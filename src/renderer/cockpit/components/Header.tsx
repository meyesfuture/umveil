import React from 'react'
import type { AppState } from '@shared/state'

interface Props {
  state: AppState
  onKill: () => void
  onRestore: () => void
  onStart: () => void
  onStop: () => void
  onSave: () => void
  onNew: () => void
  onOpen: () => void
  children?: React.ReactNode
}

export function Header({ state, onKill, onRestore, onStart, onStop, onSave, onNew, onOpen, children }: Props): React.ReactElement {
  const { session, killed } = state.stage
  const isLive = session === 'live'
  const isStopped = session === 'stopped'

  const sceneName = state.scene.name + (state.scene.dirty ? ' ●' : '')

  return (
    <header className="header">
      <span className="header-title">umveil</span>
      <span style={{ fontSize: 12, color: '#888', marginRight: 'auto' }}>{sceneName}</span>

      <button className="btn" onClick={onNew}>New</button>
      <button className="btn" onClick={onOpen}>Open…</button>
      <button className="btn" onClick={onSave} disabled={!state.scene.dirty}>Save</button>

      <div style={{ width: 1, height: 24, background: '#333', margin: '0 4px' }} />

      {children}

      <div style={{ width: 1, height: 24, background: '#333', margin: '0 4px' }} />

      {isStopped ? (
        <button className="btn" onClick={onStart} style={{ background: '#0a7a0a', color: '#fff', border: 'none' }}>
          ▶ Start Scene
        </button>
      ) : (
        <button className="btn" onClick={onStop}>Stop Scene</button>
      )}

      {isLive && (
        killed ? (
          <button className="btn-restore" onClick={onRestore}>◉ RESTORE</button>
        ) : (
          <button className="btn-kill" onClick={onKill}>■ KILL</button>
        )
      )}
    </header>
  )
}
