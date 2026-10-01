/**
 * audio.ts — AudioService.
 * Device enumeration, selection, sink application, device loss. FR-09, INV-4.
 */
import { store } from '../store'
import { logger } from './logger'
import type { AudioOutput } from '@shared/state'
import { ok, err } from '@shared/ipc'
import type { Result } from '@shared/ipc'

// Outputs are enumerated in the Stage renderer (which has media access).
// AudioService tracks the selection and policy.

export const AudioService = {
  async refreshOutputs(): Promise<AudioOutput[]> {
    // The real device list comes from the Stage renderer via stage:audio-devices IPC.
    // Return current cached list.
    return store.getState().audio.outputs
  },

  /** Called when Stage renderer reports its device list. */
  updateOutputs(outputs: AudioOutput[]): void {
    store.dispatch({ type: 'AUDIO_OUTPUTS_UPDATE', outputs })
    // If selected device is now missing, apply INV-4
    const selected = store.getState().audio.selected
    if (selected) {
      const found = outputs.find((o) => o.deviceId === selected.deviceId)
      if (!found) {
        logger.warn('audio.output.missing', { label: selected.label })
        store.dispatch({
          type: 'AUDIO_STATUS',
          status: 'missing',
          managedMuted: true,
        })
        store.dispatch({
          type: 'ALERT_ADD',
          alert: {
            level: 'error',
            code: 'AUDIO_OUTPUT_MISSING',
            message: `Audio output "${selected.label}" is not available. Audio muted.`,
            sticky: true,
          },
        })
      } else {
        // If it was missing and is now back, restore
        if (store.getState().audio.status === 'missing') {
          const killed = store.getState().stage.killed
          store.dispatch({
            type: 'AUDIO_STATUS',
            status: 'ok',
            managedMuted: killed,
          })
          store.dispatch({ type: 'ALERT_REMOVE_BY_CODE', code: 'AUDIO_OUTPUT_MISSING' })
        }
      }
    }
  },

  selectOutput(deviceId: string): Result<void> {
    const outputs = store.getState().audio.outputs
    const output = outputs.find((o) => o.deviceId === deviceId)
    if (!output) {
      // If no outputs yet (Stage not started), create a placeholder
      const placeholder: AudioOutput = { deviceId, label: deviceId }
      store.dispatch({ type: 'AUDIO_SELECTED', output: placeholder })
      logger.info('audio.selected.placeholder', { deviceId })
      return ok(undefined)
    }
    store.dispatch({ type: 'AUDIO_SELECTED', output })
    store.dispatch({ type: 'ALERT_REMOVE_BY_CODE', code: 'AUDIO_OUTPUT_UNSET' })
    logger.info('audio.selected', { label: output.label })
    return ok(undefined)
  },

  getSelectedOutput(): AudioOutput | null {
    return store.getState().audio.selected
  },
}
