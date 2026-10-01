/**
 * cockpit.ts — Preload for the Cockpit window.
 * Exposes window.umveil (CockpitApi) via contextBridge.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { AppState } from '@shared/state'
import type { Result } from '@shared/ipc'

type UnsubFn = () => void

const api = {
  /** Invoke a channel (request/response). */
  invoke<T>(channel: string, payload?: unknown): Promise<Result<T>> {
    return ipcRenderer.invoke(channel, payload) as Promise<Result<T>>
  },

  /** Subscribe to whole-state snapshots. Returns unsubscribe fn. */
  onState(cb: (state: AppState) => void): UnsubFn {
    const handler = (_: Electron.IpcRendererEvent, state: AppState) => cb(state)
    ipcRenderer.on(IPC.STATE_UPDATE, handler)
    return () => ipcRenderer.removeListener(IPC.STATE_UPDATE, handler)
  },

  /** Subscribe to video playback ticks. Returns unsubscribe fn. */
  onTick(cb: (tick: { positionMs: number; durationMs: number }) => void): UnsubFn {
    const handler = (_: Electron.IpcRendererEvent, tick: { positionMs: number; durationMs: number }) => cb(tick)
    ipcRenderer.on(IPC.PLAYBACK_TICK, handler)
    return () => ipcRenderer.removeListener(IPC.PLAYBACK_TICK, handler)
  },

  /** Subscribe to Stage preview source changes. Returns unsubscribe fn. */
  onPreviewSource(cb: (mediaSourceId: string | null) => void): UnsubFn {
    const handler = (_: Electron.IpcRendererEvent, payload: { mediaSourceId: string | null }) =>
      cb(payload.mediaSourceId)
    ipcRenderer.on(IPC.PREVIEW_SOURCE, handler)
    return () => ipcRenderer.removeListener(IPC.PREVIEW_SOURCE, handler)
  },
}

contextBridge.exposeInMainWorld('umveil', api)

// TypeScript global declaration (used in cockpit renderer)
declare global {
  interface Window {
    umveil: typeof api
  }
}
