import { describe, it, expect } from 'vitest'
import { appReducer, INITIAL_STATE, AppState } from '../state'

describe('state reducer', () => {
  it('should handle SCENE_NEW', () => {
    // Make a dirty state to ensure it resets
    const state: AppState = {
      ...INITIAL_STATE,
      scene: { ...INITIAL_STATE.scene, dirty: true, name: 'Old' },
      stage: { ...INITIAL_STATE.stage, killed: true }
    }
    
    const next = appReducer(state, { type: 'SCENE_NEW' })
    expect(next.scene.dirty).toBe(false)
    expect(next.scene.name).toBe('Untitled Scene')
    expect(next.stage.killed).toBe(false)
    expect(next.revision).toBe(state.revision + 1)
  })

  it('should add alert and assign id', () => {
    const next = appReducer(INITIAL_STATE, {
      type: 'ALERT_ADD',
      alert: { level: 'error', code: 'DISPLAY_LOST', message: 'Test', sticky: false }
    })
    expect(next.alerts).toHaveLength(1)
    expect(next.alerts[0].id).toBeDefined()
    expect(next.alerts[0].message).toBe('Test')
  })

  it('should handle SCENE_ITEM_ADD', () => {
    const next = appReducer(INITIAL_STATE, {
      type: 'SCENE_ITEM_ADD',
      item: { id: '1', kind: 'image', name: 'Test', status: 'ok', assetId: 'abc', thumbUrl: 'url' }
    })
    expect(next.scene.items).toHaveLength(1)
    expect(next.scene.dirty).toBe(true)
  })
})
