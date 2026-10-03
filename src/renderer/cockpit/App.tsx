import React, { useEffect, useState, useCallback } from 'react'
import type { AppState } from '@shared/state'
import { IPC } from '@shared/ipc'
import { Header } from './components/Header'
import { ConfidenceMonitor } from './components/ConfidenceMonitor'
import { AssetBin } from './components/AssetBin'
import { AlertBanner } from './components/AlertBanner'
import { StatusBar } from './components/StatusBar'
import { AudioSelector } from './components/AudioSelector'
import './styles.css'

export function App(): React.ReactElement {
  const [state, setState] = useState<AppState | null>(null)
  const [previewSourceId, setPreviewSourceId] = useState<string | null>(null)

  useEffect(() => {
    const unsub = window.umveil.onState(setState)
    const unsubPreview = window.umveil.onPreviewSource(setPreviewSourceId)
    return () => { unsub(); unsubPreview() }
  }, [])

  const invoke = useCallback(
    <T,>(channel: string, payload?: unknown) => window.umveil.invoke<T>(channel, payload),
    []
  )

  if (!state) {
    return (
      <div className="loading">
        <span>Connecting…</span>
      </div>
    )
  }

  const isLive = state.stage.session === 'live'
  const isDetached = state.stage.session === 'detached'

  const handleKill = useCallback(() => invoke(IPC.STAGE_KILL), [invoke])
  const handleRestore = useCallback(() => invoke(IPC.STAGE_RESTORE), [invoke])
  const handleStart = useCallback(() => invoke(IPC.STAGE_START), [invoke])
  const handleStop = useCallback(() => invoke(IPC.STAGE_STOP), [invoke])
  const handleSave = useCallback(() => invoke(IPC.SCENE_SAVE), [invoke])
  const handleNew = useCallback(() => invoke(IPC.SCENE_NEW), [invoke])
  const handleOpen = useCallback(() => invoke(IPC.SCENE_OPEN, {}), [invoke])
  const handleDismissAlert = useCallback((id: string) => invoke('alert:dismiss', { id }), [invoke])
  const handleResume = useCallback(() => invoke(IPC.STAGE_RESUME), [invoke])
  
  const handleFreeze = useCallback(() => invoke(IPC.STAGE_FREEZE, { on: !state.stage.frozen }), [invoke, state.stage.frozen])
  const handlePlayback = useCallback((action: string, value?: number | boolean) => invoke(IPC.STAGE_PLAYBACK, { action, value }), [invoke])
  
  const handlePush = useCallback((itemId: string) => invoke(IPC.STAGE_PUSH, { itemId }), [invoke])
  const handleImport = useCallback((paths: string[]) => invoke(IPC.ITEMS_IMPORT, { paths }), [invoke])
  const handleAddEmbed = useCallback((url: string) => invoke(IPC.ITEMS_ADD_EMBED, { url }), [invoke])
  const handleRemove = useCallback((itemId: string) => invoke(IPC.ITEMS_REMOVE, { itemId }), [invoke])
  const handleProjectApp = useCallback((sourceId: string) => invoke(IPC.APPS_PROJECT, { sourceId }), [invoke])
  const handleAudioSelect = useCallback((deviceId: string) => invoke(IPC.AUDIO_SELECT, { deviceId }), [invoke])
  const handleAudioRefresh = useCallback(() => invoke(IPC.AUDIO_REFRESH), [invoke])
  const handleTestTone = useCallback(() => invoke(IPC.AUDIO_TEST_TONE), [invoke])

  return (
    <div className="app">
      <Header
        state={state}
        onKill={handleKill}
        onRestore={handleRestore}
        onStart={handleStart}
        onStop={handleStop}
        onSave={handleSave}
        onNew={handleNew}
        onOpen={handleOpen}
      >
        <AudioSelector
          state={state}
          onSelect={handleAudioSelect}
          onRefresh={handleAudioRefresh}
          onTestTone={handleTestTone}
        />
      </Header>

      {state.alerts.length > 0 && (
        <AlertBanner
          alerts={state.alerts}
          onDismiss={handleDismissAlert}
          onResume={isDetached ? handleResume : undefined}
        />
      )}

      <div className="main-content">
        <div className="left-panel">
          <ConfidenceMonitor
            state={state}
            previewSourceId={previewSourceId}
            onFreeze={handleFreeze}
            onPlayback={handlePlayback}
          />
        </div>

        <div className="right-panel">
          <AssetBin
            state={state}
            onPush={handlePush}
            onImport={handleImport}
            onAddEmbed={handleAddEmbed}
            onRemove={handleRemove}
            onProjectApp={handleProjectApp}
          />
        </div>
      </div>

      <StatusBar state={state} />
    </div>
  )
}
