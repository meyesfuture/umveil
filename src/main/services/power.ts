/**
 * power.ts — Prevents display sleep while the Stage is live.
 * Also handles suspend/resume events.
 */
import { powerSaveBlocker, powerMonitor } from 'electron'
import { logger } from './logger'

let blockerId: number | null = null

export type ResumeCallback = () => void
const resumeCallbacks = new Set<ResumeCallback>()

export const PowerService = {
  /** Call when Stage goes live. */
  start(): void {
    if (blockerId !== null) return
    blockerId = powerSaveBlocker.start('prevent-display-sleep')
    logger.info('power.blocker.started', { blockerId })
  },

  /** Call when Stage stops. */
  stop(): void {
    if (blockerId === null) return
    powerSaveBlocker.stop(blockerId)
    logger.info('power.blocker.stopped', { blockerId })
    blockerId = null
  },

  onResume(cb: ResumeCallback): () => void {
    resumeCallbacks.add(cb)
    return () => resumeCallbacks.delete(cb)
  },

  init(): void {
    powerMonitor.on('suspend', () => {
      logger.info('power.suspend')
    })
    powerMonitor.on('resume', () => {
      logger.info('power.resume')
      for (const cb of resumeCallbacks) cb()
    })
  },
}
