import { IPC } from '@shared/ipc'
import type { StageLoadCommand, StageLoadCommand as SLC } from '@shared/ipc'
import type { StageContent, SceneSettings, AudioOutput } from '@shared/state'

// ---------------------------------------------------------------------------
// DOM setup
// ---------------------------------------------------------------------------

const root = document.getElementById('root')!

// .canvas — 16:9 letterboxed container
const canvas = document.createElement('div')
canvas.id = 'canvas'
root.appendChild(canvas)

// Layer A and B (A/B preroll slots)
const layerA = document.createElement('div')
layerA.id = 'layer-a'
const layerB = document.createElement('div')
layerB.id = 'layer-b'
canvas.appendChild(layerA)
canvas.appendChild(layerB)

// Freeze overlay (covers whole window, above canvas)
const freezeEl = document.createElement('img')
freezeEl.id = 'freeze'
root.appendChild(freezeEl)

// Curtain (covers whole window, above freeze)
const curtainEl = document.createElement('div')
curtainEl.id = 'curtain'
root.appendChild(curtainEl)

// Inject styles
const style = document.createElement('style')
style.textContent = `
  #root { width: 100vw; height: 100vh; background: #000; position: relative; overflow: hidden; }
  #canvas {
    position: absolute;
    /* 16:9 fitted inside the viewport */
    width: min(100vw, calc(100vh * 16 / 9));
    height: min(100vh, calc(100vw * 9 / 16));
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    background: #000;
    overflow: hidden;
  }
  #layer-a, #layer-b {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
  }
  #layer-a img, #layer-b img {
    width: 100%; height: 100%; object-fit: contain;
  }
  #layer-a video, #layer-b video {
    width: 100%; height: 100%; object-fit: contain;
  }
  #layer-a webview, #layer-b webview {
    width: 100%; height: 100%; border: none;
  }
  #freeze {
    position: fixed; inset: 0;
    width: 100vw; height: 100vh;
    object-fit: cover;
    display: none;
    z-index: 10;
  }
  #curtain {
    position: fixed; inset: 0;
    background: #000;
    display: none;
    z-index: 20;
    align-items: center; justify-content: center;
  }
  #curtain.visible { display: flex; }
  #curtain .logo {
    max-width: 60%; max-height: 60%;
    object-fit: contain;
  }
`
document.head.appendChild(style)

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface CompositorState {
  activeSlot: 'a' | 'b'
  killed: boolean
  frozen: boolean
  sink: AudioOutput | null
  managedMuted: boolean
  slate: SceneSettings['slate']
  transition: SceneSettings['transition']
  latestToken: number
}

const state: CompositorState = {
  activeSlot: 'a',
  killed: false,
  frozen: false,
  sink: null,
  managedMuted: false,
  slate: { mode: 'black', logoAssetId: null },
  transition: { type: 'crossfade', durationMs: 400 },
  latestToken: 0,
}

function getActiveLayer(): HTMLDivElement {
  return state.activeSlot === 'a' ? layerA : layerB
}
function getHiddenLayer(): HTMLDivElement {
  return state.activeSlot === 'a' ? layerB : layerA
}

// ---------------------------------------------------------------------------
// Transition helpers
// ---------------------------------------------------------------------------

function swapSlots(): void {
  const active = getActiveLayer()
  const hidden = getHiddenLayer()
  const dur = state.transition.durationMs

  if (state.transition.type === 'cut' || dur === 0) {
    active.style.opacity = '0'
    hidden.style.opacity = '1'
    state.activeSlot = state.activeSlot === 'a' ? 'b' : 'a'
    // Clear old slot
    clearLayer(active)
    return
  }

  // Crossfade
  hidden.style.transition = `opacity ${dur}ms ease`
  hidden.style.opacity = '1'
  active.style.transition = `opacity ${dur}ms ease`
  active.style.opacity = '0'

  state.activeSlot = state.activeSlot === 'a' ? 'b' : 'a'

  setTimeout(() => {
    clearLayer(active)
    active.style.transition = ''
    hidden.style.transition = ''
  }, dur + 50)
}

function clearLayer(layer: HTMLDivElement): void {
  // Stop media to release resources
  const videos = layer.querySelectorAll('video')
  videos.forEach((v) => {
    v.pause()
    if (v.srcObject) {
      const stream = v.srcObject as MediaStream
      stream.getTracks().forEach((t) => t.stop())
      v.srcObject = null
    }
    v.src = ''
  })
  const webviews = layer.querySelectorAll('webview')
  webviews.forEach((w) => (w as HTMLElement & { stop?: () => void }).stop?.())
  layer.innerHTML = ''
}

// ---------------------------------------------------------------------------
// Content loaders
// ---------------------------------------------------------------------------

function loadImage(layer: HTMLDivElement, url: string, token: number, onCommit: () => void): void {
  const img = document.createElement('img')
  img.src = url
  img.onload = () => {
    if (state.latestToken !== token) { layer.innerHTML = ''; return }
    onCommit()
  }
  img.onerror = () => {
    if (state.latestToken !== token) return
    window.umveilStage.send(IPC.STAGE_STATUS, { token, phase: 'failed', code: 'DECODE' })
  }
  layer.appendChild(img)
}

function loadVideo(
  layer: HTMLDivElement,
  url: string,
  token: number,
  cmd: SLC,
  onCommit: () => void
): void {
  const video = document.createElement('video')
  video.src = url
  video.loop = cmd.playback?.loop ?? false
  video.muted = state.managedMuted
  video.preload = 'auto'

  if (state.sink?.deviceId) {
    ;(video as HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> })
      .setSinkId?.(state.sink.deviceId)
      .catch(() => undefined)
  }

  video.oncanplay = () => {
    if (state.latestToken !== token) { video.pause(); video.src = ''; return }
    if (cmd.autoplay && !state.managedMuted) video.play().catch(() => undefined)
    onCommit()
  }
  video.onerror = () => {
    if (state.latestToken !== token) return
    window.umveilStage.send(IPC.STAGE_STATUS, { token, phase: 'failed', code: 'DECODE' })
  }
  video.onended = () => {
    window.umveilStage.send(IPC.STAGE_MEDIA_EVENT, { type: 'ended' })
  }

  // Playback tick
  let tickInterval: ReturnType<typeof setInterval> | null = null
  video.addEventListener('play', () => {
    if (tickInterval) clearInterval(tickInterval)
    tickInterval = setInterval(() => {
      if (!video.paused) {
        window.umveilStage.send(IPC.PLAYBACK_TICK, {
          positionMs: Math.round(video.currentTime * 1000),
          durationMs: Math.round(video.duration * 1000),
        })
      }
    }, 250)
  })
  video.addEventListener('pause', () => { if (tickInterval) { clearInterval(tickInterval); tickInterval = null } })

  layer.appendChild(video)
}

function loadEmbed(layer: HTMLDivElement, url: string, token: number, timeoutMs: number, onCommit: () => void): void {
  const webview = document.createElement('webview') as HTMLElement & {
    src: string
    partition: string
    allowpopups?: string
    addEventListener: HTMLElement['addEventListener']
  }
  webview.src = url
  webview.partition = 'persist:umveil-embeds'
  ;(webview as unknown as Record<string, unknown>).allowpopups = undefined

  const timeout = setTimeout(() => {
    if (state.latestToken !== token) return
    window.umveilStage.send(IPC.STAGE_STATUS, { token, phase: 'failed', code: 'TIMEOUT' })
    layer.innerHTML = ''
  }, timeoutMs)

  webview.addEventListener('did-finish-load', () => {
    clearTimeout(timeout)
    if (state.latestToken !== token) { layer.innerHTML = ''; return }
    onCommit()
  })
  webview.addEventListener('did-fail-load', () => {
    clearTimeout(timeout)
    if (state.latestToken !== token) return
    window.umveilStage.send(IPC.STAGE_STATUS, { token, phase: 'failed', code: 'LOAD' })
  })

  layer.appendChild(webview)
}

function loadAppMirror(layer: HTMLDivElement, sourceId: string, token: number, onCommit: () => void): void {
  const video = document.createElement('video')
  video.autoplay = true
  video.muted = true // Mirror audio not managed in v1

  navigator.mediaDevices
    .getUserMedia({
      audio: false,
      video: {
        // @ts-expect-error Electron-specific
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxFrameRate: 30,
        },
      },
    })
    .then((stream) => {
      if (state.latestToken !== token) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      video.srcObject = stream
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        window.umveilStage.send(IPC.STAGE_CAPTURE_ENDED, { reason: 'ended' })
      })
      video.oncanplay = () => {
        onCommit()
      }
    })
    .catch(() => {
      if (state.latestToken !== token) return
      window.umveilStage.send(IPC.STAGE_STATUS, { token, phase: 'failed', code: 'CAPTURE' })
    })

  layer.appendChild(video)
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

function handleLoad(cmd: StageLoadCommand): void {
  state.latestToken = cmd.token
  const hidden = getHiddenLayer()
  clearLayer(hidden)
  hidden.style.opacity = '0'
  hidden.style.transition = ''

  function commit(): void {
    swapSlots()
    window.umveilStage.send(IPC.STAGE_STATUS, { token: cmd.token, phase: 'committed' })
  }

  switch (cmd.source.kind) {
    case 'image':
      loadImage(hidden, cmd.source.url, cmd.token, () => {
        swapSlots()
        window.umveilStage.send(IPC.STAGE_STATUS, { token: cmd.token, phase: 'committed' })
      })
      break
    case 'video':
      loadVideo(hidden, cmd.source.url, cmd.token, cmd, () => {
        swapSlots()
        window.umveilStage.send(IPC.STAGE_STATUS, { token: cmd.token, phase: 'committed' })
      })
      break
    case 'embed':
      loadEmbed(hidden, cmd.source.url, cmd.token, cmd.timeoutMs, () => {
        swapSlots()
        window.umveilStage.send(IPC.STAGE_STATUS, { token: cmd.token, phase: 'committed' })
      })
      break
    case 'app':
      loadAppMirror(hidden, cmd.source.sourceId, cmd.token, () => {
        swapSlots()
        window.umveilStage.send(IPC.STAGE_STATUS, { token: cmd.token, phase: 'committed' })
      })
      break
    case 'slate':
      hidden.innerHTML = ''
      swapSlots()
      window.umveilStage.send(IPC.STAGE_STATUS, { token: cmd.token, phase: 'committed' })
      break
  }
}

function handleCurtain(payload: { on: boolean; slate: SceneSettings['slate'] }): void {
  if (payload.on) {
    curtainEl.style.display = 'flex'
    curtainEl.classList.add('visible')
    if (payload.slate.mode === 'logo' && payload.slate.logoAssetId) {
      curtainEl.innerHTML = `<img class="logo" src="umveil-media://asset/${payload.slate.logoAssetId}" />`
    } else {
      curtainEl.innerHTML = ''
    }
    const presentedAtMs = Date.now()
    window.umveilStage.send(IPC.STAGE_CURTAIN_ACK, { on: true, presentedAtMs })
  } else {
    curtainEl.classList.remove('visible')
    curtainEl.style.display = 'none'
    window.umveilStage.send(IPC.STAGE_CURTAIN_ACK, { on: false, presentedAtMs: Date.now() })
  }
}

function handleFreezeImage(payload: { jpegDataUrl: string | null }): void {
  if (payload.jpegDataUrl) {
    freezeEl.src = payload.jpegDataUrl
    freezeEl.style.display = 'block'
  } else {
    freezeEl.style.display = 'none'
    freezeEl.src = ''
  }
}

function handleSync(payload: {
  content: StageContent
  killed: boolean
  frozen: boolean
  slate: SceneSettings['slate']
  transition: SceneSettings['transition']
  sink: AudioOutput | null
  managedMuted: boolean
}): void {
  state.killed = payload.killed
  state.frozen = payload.frozen
  state.slate = payload.slate
  state.transition = payload.transition
  state.sink = payload.sink
  state.managedMuted = payload.managedMuted

  if (payload.killed) {
    curtainEl.classList.add('visible')
  } else {
    curtainEl.classList.remove('visible')
  }
  if (payload.frozen) {
    // freeze image will come via stage:freeze-image
  }
}

function handlePlaybackCmd(cmd: { action: string; value?: number | boolean }): void {
  const active = getActiveLayer()
  const video = active.querySelector('video')
  if (!video) return
  switch (cmd.action) {
    case 'play': video.play().catch(() => undefined); break
    case 'pause': video.pause(); break
    case 'restart': video.currentTime = 0; video.play().catch(() => undefined); break
    case 'seek': if (typeof cmd.value === 'number') video.currentTime = cmd.value / 1000; break
    case 'loop': if (typeof cmd.value === 'boolean') video.loop = cmd.value; break
    case 'volume': if (typeof cmd.value === 'number') video.volume = cmd.value / 100; break
  }
}

function handleAudio(payload: { sink: AudioOutput | null; managedMuted: boolean }): void {
  state.sink = payload.sink
  state.managedMuted = payload.managedMuted
  const active = getActiveLayer()
  const video = active.querySelector('video')
  if (video) {
    video.muted = payload.managedMuted
    if (payload.sink?.deviceId) {
      ;(video as HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> })
        .setSinkId?.(payload.sink.deviceId)
        .catch(() => undefined)
    }
  }
}

function handleTestTone(): void {
  const ctx = new AudioContext()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.value = 1000
  gain.gain.value = 0.2
  osc.start()
  setTimeout(() => { osc.stop(); ctx.close() }, 800)

  // Route to selected sink if available
  if (state.sink?.deviceId) {
    ;(ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> })
      .setSinkId?.(state.sink.deviceId)
      .catch(() => undefined)
  }
}

function handleEmbedCmd(cmd: { action: string }): void {
  const active = getActiveLayer()
  const webview = active.querySelector('webview') as (HTMLElement & {
    reload?: () => void
    setAudioMuted?: (muted: boolean) => void
    executeJavaScript?: (code: string) => Promise<unknown>
  }) | null
  if (!webview) return
  switch (cmd.action) {
    case 'reload': webview.reload?.(); break
    case 'mute':
      webview.setAudioMuted?.(true)
      break
    case 'unmute':
      webview.setAudioMuted?.(false)
      break
  }
}

// ---------------------------------------------------------------------------
// Report audio devices on boot and on devicechange
// ---------------------------------------------------------------------------

async function reportAudioDevices(): Promise<void> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const outputs = devices
      .filter((d) => d.kind === 'audiooutput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label || d.deviceId }))
    window.umveilStage.send(IPC.STAGE_AUDIO_DEVICES, { outputs, sinkApplied: false })
  } catch {
    window.umveilStage.send(IPC.STAGE_AUDIO_DEVICES, { outputs: [], sinkApplied: false })
  }
}

navigator.mediaDevices.addEventListener('devicechange', () => {
  reportAudioDevices()
})

// ---------------------------------------------------------------------------
// Wire up IPC
// ---------------------------------------------------------------------------

window.umveilStage.on(IPC.STAGE_SYNC, (payload) => handleSync(payload as Parameters<typeof handleSync>[0]))
window.umveilStage.on(IPC.STAGE_LOAD, (payload) => handleLoad(payload as StageLoadCommand))
window.umveilStage.on(IPC.STAGE_CURTAIN, (payload) => handleCurtain(payload as Parameters<typeof handleCurtain>[0]))
window.umveilStage.on(IPC.STAGE_FREEZE_IMAGE, (payload) => handleFreezeImage(payload as Parameters<typeof handleFreezeImage>[0]))
window.umveilStage.on(IPC.STAGE_PLAYBACK_CMD, (payload) => handlePlaybackCmd(payload as Parameters<typeof handlePlaybackCmd>[0]))
window.umveilStage.on(IPC.STAGE_AUDIO, (payload) => handleAudio(payload as Parameters<typeof handleAudio>[0]))
window.umveilStage.on(IPC.STAGE_TONE, () => handleTestTone())
window.umveilStage.on(IPC.STAGE_EMBED_CMD, (payload) => handleEmbedCmd(payload as Parameters<typeof handleEmbedCmd>[0]))

// Boot: report ready and enumerate audio devices
window.umveilStage.send(IPC.STAGE_READY)
reportAudioDevices()
