import React, { useEffect, useRef } from 'react'
import type { AppState } from '@shared/state'

interface Props {
  state: AppState
  previewSourceId: string | null
  onFreeze: () => void
  onPlayback: (action: string, value?: number | boolean) => void
}

export const ConfidenceMonitor = React.memo(function ConfidenceMonitor({ state, previewSourceId, onFreeze, onPlayback }: Props): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { session, killed, frozen, content } = state.stage
  const isLive = session === 'live'

  useEffect(() => {
    let isMounted = true
    let currentStream: MediaStream | null = null

    const video = videoRef.current
    if (!video || !previewSourceId || !isLive) {
      if (video) video.srcObject = null
      return
    }

    // Get media stream from the Stage window source ID
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          // @ts-expect-error — Electron-specific constraint
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: previewSourceId,
            maxFrameRate: 15,
            maxWidth: 960,
            maxHeight: 540,
          },
        },
      })
      .then((stream) => {
        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        currentStream = stream
        if (video) video.srcObject = stream
      })
      .catch(() => {
        if (!isMounted) return
        if (video) video.srcObject = null
      })

    return () => {
      isMounted = false
      if (currentStream) {
        currentStream.getTracks().forEach((t) => t.stop())
      }
      if (video) video.srcObject = null
    }
  }, [previewSourceId, isLive])

  const chips: React.ReactElement[] = []
  if (!isLive) chips.push(<span key="offline" className="chip chip-offline">OFFLINE</span>)
  else if (killed) chips.push(<span key="killed" className="chip chip-killed">KILLED</span>)
  else chips.push(<span key="live" className="chip chip-live">LIVE</span>)
  if (frozen) chips.push(<span key="frozen" className="chip chip-frozen">FROZEN</span>)
  if (session === 'detached') chips.push(<span key="detached" className="chip chip-detached">DETACHED</span>)

  const borderColor = killed ? '#cc2200' : frozen ? '#005fa3' : isLive ? '#0a7a0a' : '#333'

  return (
    <div className="confidence-monitor" style={{ border: `2px solid ${borderColor}` }}>
      {isLive && previewSourceId ? (
        <video ref={videoRef} className="confidence-video" autoPlay muted playsInline />
      ) : (
        <div className="confidence-offline">Stage offline</div>
      )}

      <div className="confidence-overlay">
        <div className="confidence-chips">{chips}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {content.kind === 'video' && (
            <>
              <button className="btn" style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => onPlayback(content.playing ? 'pause' : 'play')}>
                {content.playing ? '⏸' : '▶'}
              </button>
              <button className="btn" style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => onPlayback('restart')}>↺</button>
            </>
          )}
          {isLive && (
            <button className="btn" style={{ fontSize: 11, padding: '3px 8px', marginLeft: 'auto',
              background: frozen ? '#005fa3' : undefined }}
              onClick={onFreeze}>
              {frozen ? '⬡ Unfreeze' : '⬡ Freeze'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
})
