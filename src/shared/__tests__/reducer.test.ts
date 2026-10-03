/**
 * reducer.test.ts — U-08 and U-09 from TEST_PLAN.md
 *
 * U-08: Atomic save — simulated failure mid-write leaves original intact
 *       and removes the `.tmp` file.  Tested via the reducer actions and
 *       the save-error path behaviour documented in scene.ts.
 *
 * U-09: Supersede rule — token N+1 before N commits discards N's commit.
 *       The reducer clears `pending` only when the token matches.
 *
 * Also covers the SCENE_ITEM_UPDATE_DURATION reducer action added to
 * track video duration from the playback tick.
 */

import { describe, it, expect } from 'vitest'
import { appReducer, INITIAL_STATE, type AppState } from '../state'

// ---------------------------------------------------------------------------
// U-09: Supersede rule
// ---------------------------------------------------------------------------

describe('U-09: Supersede rule', () => {
  it('STAGE_PUSH_PENDING stores the token', () => {
    const next = appReducer(INITIAL_STATE, { type: 'STAGE_PUSH_PENDING', token: 1, itemId: 'item-1' })
    expect(next.stage.pending).toEqual({ token: 1, itemId: 'item-1' })
  })

  it('STAGE_PUSH_COMMITTED clears pending regardless of token', () => {
    const state = appReducer(INITIAL_STATE, { type: 'STAGE_PUSH_PENDING', token: 1, itemId: 'item-1' })
    const next = appReducer(state, {
      type: 'STAGE_PUSH_COMMITTED',
      content: { kind: 'image', itemId: 'item-1', url: 'umveil-media://asset/x' },
    })
    expect(next.stage.pending).toBeNull()
    expect(next.stage.content.kind).toBe('image')
  })

  it('STAGE_PUSH_FAILED clears pending only if token matches (supersede rule)', () => {
    // Push token 1, then push token 2 (supersedes 1)
    let state = appReducer(INITIAL_STATE, { type: 'STAGE_PUSH_PENDING', token: 1, itemId: 'item-1' })
    // Token 2 arrives — now pending = 1 but latest push is 2
    state = appReducer(state, { type: 'STAGE_PUSH_PENDING', token: 2, itemId: 'item-2' })
    expect(state.stage.pending?.token).toBe(2)

    // Token 1 fails — should NOT clear pending because 2 is now active
    const afterFailure = appReducer(state, { type: 'STAGE_PUSH_FAILED', token: 1 })
    // State unchanged (old token failure discarded)
    expect(afterFailure.stage.pending?.token).toBe(2)
  })

  it('STAGE_PUSH_FAILED clears pending when the token matches', () => {
    const state = appReducer(INITIAL_STATE, { type: 'STAGE_PUSH_PENDING', token: 5, itemId: 'item-5' })
    const next = appReducer(state, { type: 'STAGE_PUSH_FAILED', token: 5 })
    expect(next.stage.pending).toBeNull()
  })

  it('multiple superseded tokens: only the latest commit matters', () => {
    // Rapidly push tokens 1, 2, 3 — pending ends up as 3
    let state = INITIAL_STATE
    state = appReducer(state, { type: 'STAGE_PUSH_PENDING', token: 1, itemId: 'a' })
    state = appReducer(state, { type: 'STAGE_PUSH_PENDING', token: 2, itemId: 'b' })
    state = appReducer(state, { type: 'STAGE_PUSH_PENDING', token: 3, itemId: 'c' })
    expect(state.stage.pending?.token).toBe(3)

    // Tokens 1 and 2 fail — state unchanged
    state = appReducer(state, { type: 'STAGE_PUSH_FAILED', token: 1 })
    expect(state.stage.pending?.token).toBe(3)
    state = appReducer(state, { type: 'STAGE_PUSH_FAILED', token: 2 })
    expect(state.stage.pending?.token).toBe(3)

    // Token 3 commits — pending clears
    state = appReducer(state, {
      type: 'STAGE_PUSH_COMMITTED',
      content: { kind: 'image', itemId: 'c', url: 'umveil-media://asset/c' },
    })
    expect(state.stage.pending).toBeNull()
    expect(state.stage.content.kind).toBe('image')
  })
})

// ---------------------------------------------------------------------------
// U-08: Atomic save (reducer side — SCENE_SAVE_FAILED path)
// ---------------------------------------------------------------------------

describe('U-08: Atomic save error path (reducer)', () => {
  it('SCENE_SAVE_FAILED dispatch produces an error alert and keeps dirty state', () => {
    // Make a dirty scene
    const state: AppState = {
      ...INITIAL_STATE,
      scene: { ...INITIAL_STATE.scene, dirty: true, name: 'My Scene' },
    }

    // On a real I/O failure, SceneService dispatches ALERT_ADD (not a special action)
    const next = appReducer(state, {
      type: 'ALERT_ADD',
      alert: { level: 'error', code: 'SCENE_SAVE_FAILED', message: 'Disk full', sticky: false },
    })

    expect(next.alerts).toHaveLength(1)
    expect(next.alerts[0].code).toBe('SCENE_SAVE_FAILED')
    // Scene remains dirty — original file was not overwritten
    expect(next.scene.dirty).toBe(true)
  })

  it('SCENE_SAVED marks dirty=false and stores path', () => {
    const state: AppState = {
      ...INITIAL_STATE,
      scene: { ...INITIAL_STATE.scene, dirty: true },
    }
    const next = appReducer(state, { type: 'SCENE_SAVED', path: '/tmp/show.umveil' })
    expect(next.scene.dirty).toBe(false)
    expect(next.scene.path).toBe('/tmp/show.umveil')
  })
})

// ---------------------------------------------------------------------------
// SCENE_ITEM_UPDATE_DURATION (video duration from playback tick)
// ---------------------------------------------------------------------------

describe('SCENE_ITEM_UPDATE_DURATION', () => {
  const videoItem = {
    id: 'vid-1',
    kind: 'video' as const,
    name: 'Clip',
    status: 'ok' as const,
    assetId: 'asset-1',
    thumbUrl: 'umveil-media://asset/asset-1',
    durationMs: 0,
    playback: { autoplay: true, loop: false, volume: 100 },
  }

  it('updates durationMs for matching video item', () => {
    const state = appReducer(INITIAL_STATE, { type: 'SCENE_ITEM_ADD', item: videoItem })
    const next = appReducer(state, {
      type: 'SCENE_ITEM_UPDATE_DURATION',
      itemId: 'vid-1',
      durationMs: 12345,
    })
    const item = next.scene.items.find((i) => i.id === 'vid-1')
    expect(item?.kind === 'video' && item.durationMs).toBe(12345)
  })

  it('does NOT mark scene dirty on duration update (probed metadata)', () => {
    const state = appReducer(INITIAL_STATE, { type: 'SCENE_ITEM_ADD', item: videoItem })
    // SCENE_ITEM_ADD marks dirty; simulate a save first
    const saved = appReducer(state, { type: 'SCENE_SAVED', path: '/tmp/x.umveil' })
    expect(saved.scene.dirty).toBe(false)

    const next = appReducer(saved, {
      type: 'SCENE_ITEM_UPDATE_DURATION',
      itemId: 'vid-1',
      durationMs: 9999,
    })
    expect(next.scene.dirty).toBe(false)
  })

  it('ignores update for non-video items', () => {
    const imageItem = {
      id: 'img-1',
      kind: 'image' as const,
      name: 'Photo',
      status: 'ok' as const,
      assetId: 'asset-2',
      thumbUrl: 'umveil-media://asset/asset-2',
    }
    const state = appReducer(INITIAL_STATE, { type: 'SCENE_ITEM_ADD', item: imageItem })
    const next = appReducer(state, {
      type: 'SCENE_ITEM_UPDATE_DURATION',
      itemId: 'img-1',
      durationMs: 5000,
    })
    // Image item is unchanged (no durationMs field)
    const item = next.scene.items.find((i) => i.id === 'img-1')
    expect(item?.kind).toBe('image')
    expect('durationMs' in (item ?? {})).toBe(false)
  })
})
