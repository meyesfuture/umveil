/**
 * stage.ts — Preload for the Stage window.
 * Exposes window.umveilStage (StageApi) via contextBridge.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'

type UnsubFn = () => void

const api = {
  /** Send a one-way message to main. */
  send(channel: string, payload?: unknown): void {
    // Only allow known Stage-to-main channels
    const allowed = new Set([
      IPC.STAGE_READY,
      IPC.STAGE_STATUS,
      IPC.STAGE_CURTAIN_ACK,
      IPC.STAGE_MEDIA_EVENT,
      IPC.STAGE_AUDIO_DEVICES,
      IPC.STAGE_CAPTURE_ENDED,
      IPC.PLAYBACK_TICK,
    ])
    if (!allowed.has(channel as never)) return
    ipcRenderer.send(channel, payload)
  },

  /** Subscribe to main-to-Stage messages. Returns unsubscribe fn. */
  on(channel: string, cb: (payload: unknown) => void): UnsubFn {
    const allowed = new Set([
      IPC.STAGE_SYNC,
      IPC.STAGE_LOAD,
      IPC.STAGE_CURTAIN,
      IPC.STAGE_FREEZE_IMAGE,
      IPC.STAGE_PLAYBACK_CMD,
      IPC.STAGE_EMBED_CMD,
      IPC.STAGE_AUDIO,
      IPC.STAGE_TONE,
    ])
    if (!allowed.has(channel as never)) return () => undefined
    const handler = (_: Electron.IpcRendererEvent, payload: unknown) => cb(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
}

contextBridge.exposeInMainWorld('umveilStage', api)

declare global {
  interface Window {
    umveilStage: typeof api
  }
}
