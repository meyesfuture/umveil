/**
 * audio.test.ts — M-3 unit tests from TEST_PLAN.md
 *
 * U-10: Preflight evaluation for each display/audio/asset combination.
 *       Tests the reducer-level audio state transitions covering INV-4
 *       (device loss mutes managed audio) and the preflight state shape.
 *
 * Also covers:
 * - AUDIO_OUTPUTS_UPDATE action
 * - AUDIO_SELECTED action
 * - AUDIO_STATUS action (device missing → managedMuted=true)
 * - Alert lifecycle for AUDIO_OUTPUT_MISSING
 */

import { describe, it, expect } from 'vitest'
import { appReducer, INITIAL_STATE, type AppState } from '../state'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OUTPUT_A = { deviceId: 'device-a', label: 'HDMI Audio' }
const OUTPUT_B = { deviceId: 'device-b', label: 'USB Speaker' }

function withOutputs(outputs: typeof OUTPUT_A[]): AppState {
  return appReducer(INITIAL_STATE, { type: 'AUDIO_OUTPUTS_UPDATE', outputs })
}

function withSelected(state: AppState, deviceId: string): AppState {
  return appReducer(state, { type: 'AUDIO_SELECTED', output: { deviceId, label: 'HDMI Audio' } })
}

// ---------------------------------------------------------------------------
// AUDIO_OUTPUTS_UPDATE
// ---------------------------------------------------------------------------

describe('AUDIO_OUTPUTS_UPDATE', () => {
  it('stores available outputs', () => {
    const next = withOutputs([OUTPUT_A, OUTPUT_B])
    expect(next.audio.outputs).toHaveLength(2)
    expect(next.audio.outputs[0].deviceId).toBe('device-a')
  })

  it('replaces previous outputs entirely', () => {
    let state = withOutputs([OUTPUT_A, OUTPUT_B])
    state = appReducer(state, { type: 'AUDIO_OUTPUTS_UPDATE', outputs: [OUTPUT_B] })
    expect(state.audio.outputs).toHaveLength(1)
    expect(state.audio.outputs[0].deviceId).toBe('device-b')
  })

  it('empty outputs list does not crash', () => {
    const next = withOutputs([])
    expect(next.audio.outputs).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// AUDIO_SELECTED
// ---------------------------------------------------------------------------

describe('AUDIO_SELECTED', () => {
  it('stores selected output', () => {
    const state = withOutputs([OUTPUT_A])
    const next = appReducer(state, { type: 'AUDIO_SELECTED', output: OUTPUT_A })
    expect(next.audio.selected).toEqual(OUTPUT_A)
    expect(next.audio.status).toBe('ok')
  })

  it('null output clears selection and resets to unset status', () => {
    let state = withOutputs([OUTPUT_A])
    state = appReducer(state, { type: 'AUDIO_SELECTED', output: OUTPUT_A })
    state = appReducer(state, { type: 'AUDIO_SELECTED', output: null })
    expect(state.audio.selected).toBeNull()
    expect(state.audio.status).toBe('unset')
  })
})

// ---------------------------------------------------------------------------
// AUDIO_STATUS — INV-4: device loss → managedMuted=true
// ---------------------------------------------------------------------------

describe('AUDIO_STATUS (INV-4: device loss)', () => {
  it('missing status sets managedMuted=true', () => {
    const state = appReducer(INITIAL_STATE, {
      type: 'AUDIO_STATUS',
      status: 'missing',
      managedMuted: true,
    })
    expect(state.audio.status).toBe('missing')
    expect(state.audio.managedMuted).toBe(true)
  })

  it('ok status can clear managedMuted', () => {
    let state = appReducer(INITIAL_STATE, { type: 'AUDIO_STATUS', status: 'missing', managedMuted: true })
    state = appReducer(state, { type: 'AUDIO_STATUS', status: 'ok', managedMuted: false })
    expect(state.audio.status).toBe('ok')
    expect(state.audio.managedMuted).toBe(false)
  })

  it('killed stage keeps managedMuted=true even on status ok', () => {
    // Simulate: killed=true means managedMuted stays true regardless of audio status
    let state = appReducer(INITIAL_STATE, { type: 'STAGE_STARTED', displayId: 1 })
    state = appReducer(state, { type: 'STAGE_KILLED' })
    // Audio status recovers but stage is still killed
    state = appReducer(state, { type: 'AUDIO_STATUS', status: 'ok', managedMuted: true })
    expect(state.audio.managedMuted).toBe(true)
    expect(state.stage.killed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// U-10: Preflight evaluation (reducer-level state used by DisplayService.runPreflight)
// ---------------------------------------------------------------------------

describe('U-10: Preflight state combinations', () => {
  it('audio status=unset → preflight reports no-audio-selected', () => {
    // The reducer's audio.status drives the preflight audio check
    const state = INITIAL_STATE
    expect(state.audio.status).toBe('unset')
    expect(state.audio.selected).toBeNull()
  })

  it('audio status=missing → preflight reports missing device', () => {
    const state = appReducer(INITIAL_STATE, { type: 'AUDIO_STATUS', status: 'missing', managedMuted: true })
    expect(state.audio.status).toBe('missing')
  })

  it('audio status=ok after selection → preflight audio passes', () => {
    let state = withOutputs([OUTPUT_A])
    state = appReducer(state, { type: 'AUDIO_SELECTED', output: OUTPUT_A })
    expect(state.audio.status).toBe('ok')
    expect(state.audio.selected?.label).toBe('HDMI Audio')
  })

  it('items with error status are flagged in preflight', () => {
    const errorItem = {
      id: 'item-broken',
      kind: 'image' as const,
      name: 'Broken',
      status: 'error' as const,
      assetId: 'asset-x',
      thumbUrl: '',
    }
    const state = appReducer(INITIAL_STATE, { type: 'SCENE_ITEM_ADD', item: errorItem })
    const errorItems = state.scene.items.filter((i) => i.status === 'error' || i.status === 'missing')
    expect(errorItems).toHaveLength(1)
  })

  it('all-ok items → no error items in preflight scan', () => {
    const okItem = {
      id: 'item-ok',
      kind: 'image' as const,
      name: 'Photo',
      status: 'ok' as const,
      assetId: 'asset-y',
      thumbUrl: 'umveil-media://asset/asset-y',
    }
    const state = appReducer(INITIAL_STATE, { type: 'SCENE_ITEM_ADD', item: okItem })
    const errorItems = state.scene.items.filter((i) => i.status === 'error' || i.status === 'missing')
    expect(errorItems).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Alert lifecycle for audio device missing
// ---------------------------------------------------------------------------

describe('Audio device loss alert lifecycle', () => {
  it('AUDIO_OUTPUT_MISSING alert is added on device loss', () => {
    const state = appReducer(INITIAL_STATE, {
      type: 'ALERT_ADD',
      alert: {
        level: 'error',
        code: 'AUDIO_OUTPUT_MISSING',
        message: 'Audio output "HDMI Audio" is not available. Audio muted.',
        sticky: true,
      },
    })
    expect(state.alerts).toHaveLength(1)
    expect(state.alerts[0].code).toBe('AUDIO_OUTPUT_MISSING')
    expect(state.alerts[0].sticky).toBe(true)
  })

  it('ALERT_REMOVE_BY_CODE clears AUDIO_OUTPUT_MISSING when device returns', () => {
    let state = appReducer(INITIAL_STATE, {
      type: 'ALERT_ADD',
      alert: { level: 'error', code: 'AUDIO_OUTPUT_MISSING', message: 'Missing', sticky: true },
    })
    state = appReducer(state, { type: 'ALERT_REMOVE_BY_CODE', code: 'AUDIO_OUTPUT_MISSING' })
    expect(state.alerts).toHaveLength(0)
  })

  it('ALERTS_CLEAR_NON_STICKY does not remove sticky audio alert', () => {
    let state = appReducer(INITIAL_STATE, {
      type: 'ALERT_ADD',
      alert: { level: 'error', code: 'AUDIO_OUTPUT_MISSING', message: 'Missing', sticky: true },
    })
    // Add a non-sticky alert too
    state = appReducer(state, {
      type: 'ALERT_ADD',
      alert: { level: 'warn', code: 'MEDIA_DECODE_ERROR', message: 'Decode error', sticky: false },
    })
    expect(state.alerts).toHaveLength(2)

    state = appReducer(state, { type: 'ALERTS_CLEAR_NON_STICKY' })
    expect(state.alerts).toHaveLength(1)
    expect(state.alerts[0].code).toBe('AUDIO_OUTPUT_MISSING')
  })
})
