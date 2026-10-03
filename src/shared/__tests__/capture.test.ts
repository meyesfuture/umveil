/**
 * capture.test.ts - M-5 unit tests for App Switcher and Return behaviour
 *
 * Covers:
 * - STAGE_PUSH_PENDING with itemId: null (used for Return slate fallback and mirror failure)
 * - APP_WINDOW_LOST alert addition (mirror capture ended)
 */

import { describe, it, expect } from 'vitest'
import { appReducer, INITIAL_STATE } from '../state'

describe('M-5: Return and capture ended behavior (state)', () => {
  it('STAGE_PUSH_PENDING handles itemId: null for Return overlay fallback', () => {
    // When Return overlay or APP_WINDOW_LOST triggers a fallback to slate, it pushes null itemId
    const next = appReducer(INITIAL_STATE, { type: 'STAGE_PUSH_PENDING', token: 10, itemId: null })
    expect(next.stage.pending).toEqual({ token: 10, itemId: null })
  })

  it('APP_WINDOW_LOST alert is added when mirror capture ends', () => {
    const next = appReducer(INITIAL_STATE, {
      type: 'ALERT_ADD',
      alert: {
        level: 'warn',
        code: 'APP_WINDOW_LOST',
        message: 'Mirrored app window was closed. Stage returned to slate.',
        sticky: false,
      },
    })
    
    expect(next.alerts).toHaveLength(1)
    expect(next.alerts[0].code).toBe('APP_WINDOW_LOST')
  })

  it('STAGE_PUSH_COMMITTED for slate item clears pending and updates content', () => {
    let state = appReducer(INITIAL_STATE, { type: 'STAGE_PUSH_PENDING', token: 11, itemId: null })
    state = appReducer(state, {
      type: 'STAGE_PUSH_COMMITTED',
      content: { kind: 'slate' },
    })

    expect(state.stage.pending).toBeNull()
    expect(state.stage.content.kind).toBe('slate')
    expect('itemId' in state.stage.content).toBe(false)
  })
})
