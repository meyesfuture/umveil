/**
 * scene.test.ts — U-05 and U-06 from TEST_PLAN.md
 *
 * U-05: Scene schema — valid file passes; each required-field removal fails;
 *       newer schemaVersion yields E_SCENE_TOO_NEW; orphan asset dropped;
 *       duplicate ids rejected.
 *
 * U-06: Zip-slip guard — entries like `../x`, `media/../../x`, absolute paths
 *       are never extracted (verified by the regex used in openScene).
 */

import { describe, it, expect } from 'vitest'
import {
  SceneV1Schema,
  parseAndMigrateScene,
  checkIntegrity,
  CURRENT_SCHEMA_VERSION,
  type SceneV1,
} from '../scene-schema'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const VALID_SHA = 'a'.repeat(64)
const VALID_UUID2 = '550e8400-e29b-41d4-a716-446655440001'
const VALID_SHA2 = 'b'.repeat(64)

function makeValidScene(): SceneV1 {
  return {
    schemaVersion: 1,
    app: { name: 'umveil', version: '0.1.0' },
    scene: {
      id: VALID_UUID,
      name: 'Test Scene',
      createdAt: '2024-01-01T00:00:00.000Z',
      modifiedAt: '2024-01-01T00:00:00.000Z',
    },
    settings: {
      slate: { mode: 'black', logoAssetId: null },
      transition: { type: 'crossfade', durationMs: 400 },
      audio: { output: null },
      stage: { displayHint: null },
      cursorLock: false,
      returnTarget: 'slate',
    },
    assets: [
      {
        id: VALID_UUID2,
        role: 'item',
        file: `media/${VALID_SHA2}.jpg`,
        sha256: VALID_SHA2,
        mime: 'image/jpeg',
        bytes: 1024,
      },
    ],
    items: [
      {
        id: VALID_UUID,
        kind: 'image',
        name: 'Photo',
        assetId: VALID_UUID2,
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// U-05: Scene schema
// ---------------------------------------------------------------------------

describe('U-05: Scene schema', () => {
  it('valid scene parses successfully', () => {
    const scene = makeValidScene()
    expect(() => SceneV1Schema.parse(scene)).not.toThrow()
  })

  it('missing schemaVersion fails', () => {
    const { schemaVersion: _, ...rest } = makeValidScene()
    expect(() => SceneV1Schema.parse(rest)).toThrow()
  })

  it('missing scene.id fails', () => {
    const scene = makeValidScene()
    // @ts-expect-error intentional
    delete scene.scene.id
    expect(() => SceneV1Schema.parse(scene)).toThrow()
  })

  it('missing scene.name fails', () => {
    const scene = makeValidScene()
    // @ts-expect-error intentional
    delete scene.scene.name
    expect(() => SceneV1Schema.parse(scene)).toThrow()
  })

  it('missing settings.slate fails', () => {
    const scene = makeValidScene()
    // @ts-expect-error intentional
    delete scene.settings.slate
    expect(() => SceneV1Schema.parse(scene)).toThrow()
  })

  it('missing settings.transition fails', () => {
    const scene = makeValidScene()
    // @ts-expect-error intentional
    delete scene.settings.transition
    expect(() => SceneV1Schema.parse(scene)).toThrow()
  })

  it('invalid transition type fails', () => {
    const scene = makeValidScene()
    // @ts-expect-error intentional
    scene.settings.transition.type = 'wipe'
    expect(() => SceneV1Schema.parse(scene)).toThrow()
  })

  it('transition durationMs above 2000 fails', () => {
    const scene = makeValidScene()
    scene.settings.transition.durationMs = 2001
    expect(() => SceneV1Schema.parse(scene)).toThrow()
  })

  it('asset file path not matching sha256 fails', () => {
    const scene = makeValidScene()
    scene.assets[0].sha256 = VALID_SHA  // deliberately mismatched
    expect(() => SceneV1Schema.parse(scene)).toThrow()
  })

  it('newer schemaVersion yields E_SCENE_TOO_NEW error message', () => {
    const raw = { ...makeValidScene(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 }
    expect(() => parseAndMigrateScene(raw)).toThrow(/newer umveil/)
  })

  it('missing schemaVersion in raw throws', () => {
    expect(() => parseAndMigrateScene({ foo: 'bar' })).toThrow(/schemaVersion/)
  })

  it('checkIntegrity detects orphan items (missing_asset)', () => {
    const scene = makeValidScene()
    // Remove the asset while leaving the item reference
    scene.assets = []
    const errors = checkIntegrity(scene)
    expect(errors.some((e) => e.type === 'missing_asset')).toBe(true)
  })

  it('checkIntegrity: scene with no items and no assets has no errors', () => {
    const scene = makeValidScene()
    scene.items = []
    scene.assets = []
    expect(checkIntegrity(scene)).toHaveLength(0)
  })

  it('checkIntegrity detects duplicate asset id', () => {
    const scene = makeValidScene()
    scene.assets.push({ ...scene.assets[0] })  // duplicate id
    const errors = checkIntegrity(scene)
    expect(errors.some((e) => e.type === 'duplicate_id')).toBe(true)
  })

  it('checkIntegrity detects duplicate item id', () => {
    const scene = makeValidScene()
    const item2 = {
      id: VALID_UUID,  // same as item[0]
      kind: 'image' as const,
      name: 'Copy',
      assetId: VALID_UUID2,
    }
    scene.items.push(item2)
    const errors = checkIntegrity(scene)
    expect(errors.some((e) => e.type === 'duplicate_id')).toBe(true)
  })

  it('checkIntegrity rejects invalid logo reference', () => {
    const scene = makeValidScene()
    scene.settings.slate.mode = 'logo'
    scene.settings.slate.logoAssetId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'  // non-existent
    const errors = checkIntegrity(scene)
    expect(errors.some((e) => e.type === 'invalid_logo_ref')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// U-06: Zip-slip guard
// ---------------------------------------------------------------------------

/**
 * The zip-slip safe regex from scene.ts openScene():
 *   /^media\/([0-9a-f]{64})\.([a-z0-9]{1,8})$/
 * Only entries matching this pattern are extracted.
 */
const SAFE_MEDIA_REGEX = /^media\/([0-9a-f]{64})\.([a-z0-9]{1,8})$/

describe('U-06: Zip-slip guard (entry regex)', () => {
  const safe = [
    `media/${'a'.repeat(64)}.jpg`,
    `media/${'b'.repeat(64)}.mp4`,
    `media/${'c'.repeat(64)}.webm`,
    `media/${'d'.repeat(64)}.png`,
    `media/${'e'.repeat(64)}.webp`,
  ]

  const unsafe = [
    '../etc/passwd',
    '../../secret.txt',
    `media/../${'a'.repeat(64)}.jpg`,
    `media/../../outside.jpg`,
    `/absolute/${'a'.repeat(64)}.jpg`,
    `media/${'a'.repeat(64)}`,          // no extension
    `media/${'a'.repeat(63)}.jpg`,      // sha256 too short
    `media/${'a'.repeat(65)}.jpg`,      // sha256 too long
    `media/${'a'.repeat(64)}.toolong8x`,  // ext > 8 chars (9 chars)
    `media/${'a'.repeat(64)}.JPG`,      // uppercase ext
    `scene.json`,
    `media/${'a'.repeat(64)}.jpg/evil`, // path traversal suffix
    `./media/${'a'.repeat(64)}.jpg`,    // relative prefix
  ]

  for (const entry of safe) {
    it(`accepts safe entry: ${entry.slice(0, 30)}...`, () => {
      expect(SAFE_MEDIA_REGEX.test(entry)).toBe(true)
    })
  }

  for (const entry of unsafe) {
    it(`rejects unsafe entry: ${JSON.stringify(entry)}`, () => {
      expect(SAFE_MEDIA_REGEX.test(entry)).toBe(false)
    })
  }
})
