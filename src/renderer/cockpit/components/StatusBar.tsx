import React from 'react'
import type { AppState } from '@shared/state'

interface Props { state: AppState }

export function StatusBar({ state }: Props): React.ReactElement {
  const { session, killed, frozen } = state.stage
  const dotClass = killed ? 'killed' : session === 'live' ? 'live' : session === 'detached' ? 'detached' : ''
  const displays = state.displays
  const stageDisplay = displays.find((d) => d.isStage)
  const audio = state.audio

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
    </div>
  )
}
