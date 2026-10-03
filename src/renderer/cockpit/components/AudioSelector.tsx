/**
 * AudioSelector.tsx — Audio output picker for the Cockpit.
 * Shows the current selected output and lets the user pick from available
 * outputs enumerated by the Stage renderer (FR-09).
 */
import React, { useState } from 'react'
import type { AppState } from '@shared/state'
import { IPC } from '@shared/ipc'

interface Props {
  state: AppState
  onSelect: (deviceId: string) => void
  onRefresh: () => void
  onTestTone: () => void
}

export const AudioSelector = React.memo(function AudioSelector({
  state, onSelect, onRefresh, onTestTone,
}: Props): React.ReactElement {
  const [open, setOpen] = useState(false)
  const { audio } = state

  const statusColor = audio.status === 'ok' ? '#0a7a0a'
    : audio.status === 'missing' ? '#cc2200'
    : '#888'

  return (
    <div className="audio-selector" style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn"
        style={{ display: 'flex', alignItems: 'center', gap: 4, maxWidth: 180 }}
        onClick={() => { onRefresh(); setOpen((o) => !o) }}
        title="Select audio output"
      >
        <span style={{ color: statusColor, fontSize: 14 }}>♪</span>
        <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
          {audio.selected?.label ?? 'No audio output'}
        </span>
        <span style={{ fontSize: 9 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', bottom: '100%', left: 0, zIndex: 100,
            background: '#1e1e1e', border: '1px solid #444', borderRadius: 4,
            minWidth: 220, padding: '4px 0', boxShadow: '0 -4px 12px rgba(0,0,0,0.6)',
          }}
        >
          {audio.outputs.length === 0 && (
            <div style={{ padding: '8px 12px', color: '#666', fontSize: 12 }}>
              No outputs found. Start Scene first.
            </div>
          )}
          {audio.outputs.map((out) => (
            <button
              key={out.deviceId}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: out.deviceId === audio.selected?.deviceId ? '#2a4a2a' : 'transparent',
                border: 'none', color: '#ddd', padding: '6px 12px', cursor: 'pointer',
                fontSize: 12,
              }}
              onClick={() => { onSelect(out.deviceId); setOpen(false) }}
            >
              {out.deviceId === audio.selected?.deviceId && '✓ '}
              {out.label}
            </button>
          ))}
          <div style={{ borderTop: '1px solid #333', marginTop: 4, padding: '4px 8px', display: 'flex', gap: 4 }}>
            <button
              className="btn"
              style={{ fontSize: 11, flex: 1 }}
              onClick={() => { onTestTone(); setOpen(false) }}
              title="Play a 1-second test tone on the selected output"
            >
              🔊 Test tone
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
