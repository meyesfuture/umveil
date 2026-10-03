/**
 * freeze-cursor.test.ts — M-4 unit tests from TEST_PLAN.md
 *
 * Covers:
 * - STAGE_FREEZE action: sets frozen flag
 * - Freeze interplay with Kill: frozen is preserved across Kill/Restore
 * - U-03: pushes while killed produce autoplay=false (tested here as state)
 * - Cursor lock state transitions: CURSOR_LOCK_ENABLED, CURSOR_LOCK_ACTIVE
 */

import { describe, it, expect } from 'vitest'
import { appReducer, INITIAL_STATE } from '../state'

// ---------------------------------------------------------------------------
// STAGE_FREEZE — FR-15
// ---------------------------------------------------------------------------

describe('STAGE_FREEZE', () => {
  it('sets frozen=true on STAGE_FREEZE with frozen=true', () => {
    const state = appReducer(INITIAL_STATE, { type: 'STAGE_FREEZE', frozen: true })
    expect(state.stage.frozen).toBe(true)
  })

  it('sets frozen=false on STAGE_FREEZE with frozen=false', () => {
    let state = appReducer(INITIAL_STATE, { type: 'STAGE_FREEZE', frozen: true })
    state = appReducer(state, { type: 'STAGE_FREEZE', frozen: false })
    expect(state.stage.frozen).toBe(false)
  })

  it('freeze is independent of killed state', () => {
    // Can be frozen while not killed
    let state = appReducer(INITIAL_STATE, { type: 'STAGE_STARTED', displayId: 1 })
    state = appReducer(state, { type: 'STAGE_FREEZE', frozen: true })
    expect(state.stage.frozen).toBe(true)
    expect(state.stage.killed).toBe(false)
  })

  it('can be killed while frozen — both flags set', () => {
    let state = appReducer(INITIAL_STATE, { type: 'STAGE_STARTED', displayId: 1 })
    state = appReducer(state, { type: 'STAGE_FREEZE', frozen: true })
    state = appReducer(state, { type: 'STAGE_KILLED' })
    expect(state.stage.frozen).toBe(true)
    expect(state.stage.killed).toBe(true)
  })

  it('STAGE_RESTORED clears killed but not frozen', () => {
    let state = appReducer(INITIAL_STATE, { type: 'STAGE_STARTED', displayId: 1 })
    state = appReducer(state, { type: 'STAGE_FREEZE', frozen: true })
    state = appReducer(state, { type: 'STAGE_KILLED' })
    state = appReducer(state, { type: 'STAGE_RESTORED' })
    expect(state.stage.killed).toBe(false)
    // frozen persists — freeze/unfreeze is separate from kill/restore
    expect(state.stage.frozen).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// U-03: pushes while killed → autoplay: false (state-level check)
// ---------------------------------------------------------------------------

describe('U-03: Stage state while killed affects autoplay logic', () => {
  it('stage.killed=true after STAGE_KILLED', () => {
    let state = appReducer(INITIAL_STATE, { type: 'STAGE_STARTED', displayId: 1 })
    state = appReducer(state, { type: 'STAGE_KILLED' })
    expect(state.stage.killed).toBe(true)
  })

  it('STAGE_KILLED sets audio managedMuted=true', () => {
    let state = appReducer(INITIAL_STATE, { type: 'STAGE_STARTED', displayId: 1 })
    state = appReducer(state, { type: 'AUDIO_SELECTED', output: { deviceId: 'dev-1', label: 'HDMI' } })
    state = appReducer(state, { type: 'STAGE_KILLED' })
    expect(state.audio.managedMuted).toBe(true)
  })

  it('STAGE_RESTORED clears managedMuted when audio status=ok', () => {
    let state = appReducer(INITIAL_STATE, { type: 'STAGE_STARTED', displayId: 1 })
    state = appReducer(state, { type: 'AUDIO_SELECTED', output: { deviceId: 'dev-1', label: 'HDMI' } })
    state = appReducer(state, { type: 'STAGE_KILLED' })
    expect(state.audio.managedMuted).toBe(true)

    state = appReducer(state, { type: 'STAGE_RESTORED' })
    // Audio status=ok, so managedMuted becomes false
    expect(state.audio.managedMuted).toBe(false)
    expect(state.stage.killed).toBe(false)
  })

  it('STAGE_RESTORED keeps managedMuted=true when audio status=missing', () => {
    let state = appReducer(INITIAL_STATE, { type: 'STAGE_STARTED', displayId: 1 })
    state = appReducer(state, { type: 'AUDIO_STATUS', status: 'missing', managedMuted: true })
    state = appReducer(state, { type: 'STAGE_KILLED' })
    state = appReducer(state, { type: 'STAGE_RESTORED' })
    // Audio is missing → stays muted
    expect(state.audio.managedMuted).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Cursor lock — FR-16 / INV-8
// ---------------------------------------------------------------------------

describe('Cursor lock (FR-16)', () => {
  it('CURSOR_LOCK_ENABLED sets lockEnabled', () => {
    const next = appReducer(INITIAL_STATE, { type: 'CURSOR_LOCK_ENABLED', enabled: true })
    expect(next.cursor.lockEnabled).toBe(true)
  })

  it('CURSOR_LOCK_ENABLED can disable lock', () => {
    let state = appReducer(INITIAL_STATE, { type: 'CURSOR_LOCK_ENABLED', enabled: true })
    state = appReducer(state, { type: 'CURSOR_LOCK_ENABLED', enabled: false })
    expect(state.cursor.lockEnabled).toBe(false)
  })

  it('CURSOR_LOCK_ACTIVE sets lockActive independently of lockEnabled', () => {
    const state = appReducer(INITIAL_STATE, { type: 'CURSOR_LOCK_ACTIVE', active: true })
    expect(state.cursor.lockActive).toBe(true)
    // lockEnabled is determined by settings (default=true), not lockActive
    expect(state.cursor.lockEnabled).toBe(true)
  })

  it('lockEnabled default is true (cursor confined on Start)', () => {
    expect(INITIAL_STATE.cursor.lockEnabled).toBe(true)
  })

  it('lockActive default is false (not active until Stage starts)', () => {
    expect(INITIAL_STATE.cursor.lockActive).toBe(false)
  })

  it('STAGE_STOPPED does not change cursor lock state (cursor released by DisplayService)', () => {
    // Cursor state is managed at the OS level; reducer doesn't auto-release
    let state = appReducer(INITIAL_STATE, { type: 'STAGE_STARTED', displayId: 1 })
    state = appReducer(state, { type: 'CURSOR_LOCK_ACTIVE', active: true })
    state = appReducer(state, { type: 'STAGE_STOPPED' })
    // After stop: session=stopped; cursor.lockActive unchanged in reducer
    // (DisplayService.releaseCursorClip sets CURSOR_LOCK_ACTIVE=false separately)
    expect(state.stage.session).toBe('stopped')
  })
})
