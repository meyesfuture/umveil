/**
 * overlay.ts — Preload for the Return overlay window.
 * Exposes only the overlay:return invoke.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'

const api = {
  /** Signal Return to umveil. */
  return(): Promise<void> {
    return ipcRenderer.invoke(IPC.OVERLAY_RETURN)
  },
}

contextBridge.exposeInMainWorld('umveilOverlay', api)

declare global {
  interface Window {
    umveilOverlay: typeof api
  }
}
