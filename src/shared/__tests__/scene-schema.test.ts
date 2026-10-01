import { describe, it, expect } from 'vitest'
import { checkIntegrity, SceneV1 } from '../scene-schema'

describe('scene integrity', () => {
  it('detects missing assets', () => {
    const scene = {
      assets: [],
      items: [{ id: '1', name: 'Test', kind: 'image', assetId: 'missing-uuid' }],
      settings: { slate: { mode: 'black', logoAssetId: null } }
    } as unknown as SceneV1

    const errors = checkIntegrity(scene)
    expect(errors).toHaveLength(1)
    expect(errors[0].type).toBe('missing_asset')
  })

  it('detects duplicate ids', () => {
    const scene = {
      assets: [
        { id: 'dup', role: 'item', file: 'media/hash1.jpg', sha256: 'hash1' },
        { id: 'dup', role: 'item', file: 'media/hash2.jpg', sha256: 'hash2' }
      ],
      items: [],
      settings: { slate: { mode: 'black', logoAssetId: null } }
    } as unknown as SceneV1

    const errors = checkIntegrity(scene)
    expect(errors.some(e => e.type === 'duplicate_id')).toBe(true)
  })
})
