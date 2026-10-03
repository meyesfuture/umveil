import React from 'react'
import type { AppState } from '@shared/state'

interface Props {
  state: AppState
  onToggleCursorLock?: () => void
}

export function StatusBar({ state, onToggleCursorLock }: Props): React.ReactElement {
  const { session, killed, frozen } = state.stage
  const dotClass = killed ? 'killed' : session === 'live' ? 'live' : session === 'detached' ? 'detached' : ''
  const displays = state.displays
  const stageDisplay = displays.find((d) => d.isStage)
  const audio = state.audio
  const cursor = state.cursor

  return (
    <div className="status-bar">
      <div className={`status-bar-dot ${dotClass}`} />
      <span>
        {session === 'stopped' ? 'Stage offline' :
         killed ? 'KILLED' :
         frozen ? 'Frozen' :
         session === 'detached' ? 'Detached' :
         'Live'}
      </span>
      {stageDisplay && <span>Display: {stageDisplay.label}</span>}
      {audio.selected && <span>Audio: {audio.selected.label}</span>}
      {audio.status === 'unset' && <span style={{ color: '#ffd166' }}>⚠ No audio output</span>}
      <span style={{ marginLeft: 'auto' }}>
        {state.hotkeys.killRestore === 'registered' ? 'Ctrl+Alt+K=Kill' : ''}
      </span>
      {onToggleCursorLock && (
        <button
          className="btn"
          style={{
            fontSize: 11, padding: '2px 8px',
            background: cursor.lockEnabled ? '#005fa3' : undefined,
            color: cursor.lockEnabled ? '#fff' : undefined,
          }}
          onClick={onToggleCursorLock}
          title={cursor.lockEnabled ? 'Hide Mouse active — cursor confined to Cockpit display' : 'Hide Mouse off'}
        >
          {cursor.lockEnabled ? '🐭 Hide Mouse ON' : '🐭 Hide Mouse OFF'}
        </button>
      )}
    </div>
  )
}

