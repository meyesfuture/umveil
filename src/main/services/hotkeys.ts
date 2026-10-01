/**
 * hotkeys.ts — Global shortcut registration (FR-18).
 * System-wide shortcuts: Kill/Restore, Freeze, Return.
 */
import { globalShortcut } from 'electron'
import { logger } from './logger'
import type { HotkeyStatus } from '@shared/state'

type HotkeyName = 'killRestore' | 'freeze' | 'ret'
type HotkeyCallback = () => void

const ACCELERATORS: Record<HotkeyName, string> = {
  killRestore: 'Ctrl+Alt+K',
  freeze: 'Ctrl+Alt+F',
  ret: 'Ctrl+Alt+R',
}

const callbacks: Partial<Record<HotkeyName, HotkeyCallback>> = {}
const statuses: Record<HotkeyName, HotkeyStatus> = {
  killRestore: 'disabled',
  freeze: 'disabled',
  ret: 'disabled',
}

type StatusChangeCallback = (statuses: Record<HotkeyName, HotkeyStatus>) => void
const statusChangeCallbacks = new Set<StatusChangeCallback>()

export const HotkeyService = {
  onStatusChange(cb: StatusChangeCallback): () => void {
    statusChangeCallbacks.add(cb)
    return () => statusChangeCallbacks.delete(cb)
  },

  register(
    name: HotkeyName,
    cb: HotkeyCallback
  ): HotkeyStatus {
    callbacks[name] = cb
    const accel = ACCELERATORS[name]
    const ok = globalShortcut.register(accel, cb)
    statuses[name] = ok ? 'registered' : 'failed'
    logger.info('hotkey.register', { name, accel, status: statuses[name] })
    for (const cb of statusChangeCallbacks) cb({ ...statuses })
    return statuses[name]
  },

  registerAll(cbs: Partial<Record<HotkeyName, HotkeyCallback>>): Record<HotkeyName, HotkeyStatus> {
    for (const [name, cb] of Object.entries(cbs) as [HotkeyName, HotkeyCallback][]) {
      this.register(name, cb)
    }
    return { ...statuses }
  },

  unregisterAll(): void {
    globalShortcut.unregisterAll()
    for (const k of Object.keys(statuses) as HotkeyName[]) {
      statuses[k] = 'disabled'
    }
    logger.info('hotkey.unregister_all')
  },

  getStatuses(): Record<HotkeyName, HotkeyStatus> {
    return { ...statuses }
  },
}
