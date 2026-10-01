/**
 * scene-schema.ts — Zod schemas for .umveil scene files.
 * Normative alongside docs/SCENE_FORMAT.md.
 * schemaVersion 1 only; migrations live at the bottom.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const UuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Must be UUID v4')

const Sha256Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'Must be lowercase hex SHA-256')

const ExtSchema = z
  .string()
  .regex(/^[a-z0-9]{1,8}$/, 'Must be a lowercase extension')

const SUPPORTED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'video/mp4',
  'video/webm',
] as const

export const AssetSchema = z
  .object({
    id: UuidSchema,
    role: z.enum(['item', 'logo']),
    file: z
      .string()
      .regex(/^media\/[0-9a-f]{64}\.[a-z0-9]{1,8}$/, 'file must be media/<sha256>.<ext>'),
    sha256: Sha256Schema,
    mime: z.enum(SUPPORTED_MIMES),
    bytes: z.number().int().positive(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationMs: z.number().int().positive().optional(),
  })
  .refine(
    (a) => a.file === `media/${a.sha256}.${a.file.split('.').pop()}`,
    'file must equal media/<sha256>.<ext>'
  )

export type Asset = z.infer<typeof AssetSchema>

const ItemBaseSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(120),
})

export const SceneItemSchema = z.discriminatedUnion('kind', [
  ItemBaseSchema.extend({
    kind: z.literal('image'),
    assetId: UuidSchema,
  }),
  ItemBaseSchema.extend({
    kind: z.literal('video'),
    assetId: UuidSchema,
    playback: z.object({
      autoplay: z.boolean(),
      loop: z.boolean(),
      volume: z.number().int().min(0).max(100),
    }),
  }),
  ItemBaseSchema.extend({
    kind: z.literal('embed'),
    url: z.string().url(),
    normalizedUrl: z.string().url(),
  }),
  ItemBaseSchema.extend({
    kind: z.literal('app'),
    match: z.object({
      processName: z.string().min(1),
      titleContains: z.string().optional(),
    }),
  }),
])

export type SceneItem = z.infer<typeof SceneItemSchema>

export const SceneSettingsSchema = z.object({
  slate: z.object({
    mode: z.enum(['black', 'logo']),
    logoAssetId: UuidSchema.nullable(),
  }),
  transition: z.object({
    type: z.enum(['cut', 'crossfade']),
    durationMs: z.number().int().min(0).max(2000),
  }),
  audio: z.object({
    output: z.object({ deviceId: z.string(), label: z.string() }).nullable(),
  }),
  stage: z.object({
    displayHint: z
      .object({ width: z.number(), height: z.number(), internal: z.boolean() })
      .nullable(),
  }),
  cursorLock: z.boolean(),
  returnTarget: z.enum(['slate', 'keep']),
})

export const SceneV1Schema = z.object({
  schemaVersion: z.literal(1),
  app: z.object({
    name: z.string(),
    version: z.string(),
  }),
  scene: z.object({
    id: UuidSchema,
    name: z.string().min(1).max(120),
    createdAt: z.string().datetime(),
    modifiedAt: z.string().datetime(),
  }),
  settings: SceneSettingsSchema,
  assets: z.array(AssetSchema).max(500),
  items: z.array(SceneItemSchema).max(500),
})

export type SceneV1 = z.infer<typeof SceneV1Schema>

/** Current supported schema version */
export const CURRENT_SCHEMA_VERSION = 1

// ---------------------------------------------------------------------------
// Referential integrity check
// ---------------------------------------------------------------------------

export interface IntegrityError {
  type: 'missing_asset' | 'orphan_asset' | 'duplicate_id' | 'duplicate_sha256' | 'invalid_logo_ref'
  message: string
}

export function checkIntegrity(scene: SceneV1): IntegrityError[] {
  const errors: IntegrityError[] = []
  const assetIds = new Set<string>()
  const sha256s = new Set<string>()

  for (const asset of scene.assets) {
    if (assetIds.has(asset.id)) {
      errors.push({ type: 'duplicate_id', message: `Asset id ${asset.id} duplicated` })
    }
    assetIds.add(asset.id)
    if (sha256s.has(asset.sha256)) {
      errors.push({ type: 'duplicate_sha256', message: `SHA-256 ${asset.sha256} duplicated` })
    }
    sha256s.add(asset.sha256)
  }

  const itemIds = new Set<string>()
  const referencedAssetIds = new Set<string>()

  for (const item of scene.items) {
    if (itemIds.has(item.id)) {
      errors.push({ type: 'duplicate_id', message: `Item id ${item.id} duplicated` })
    }
    itemIds.add(item.id)
    if ('assetId' in item) {
      referencedAssetIds.add(item.assetId)
      if (!assetIds.has(item.assetId)) {
        errors.push({
          type: 'missing_asset',
          message: `Item ${item.id} references missing asset ${item.assetId}`,
        })
      }
    }
  }

  // Check logo reference
  const { slate } = scene.settings
  if (slate.mode === 'logo' && slate.logoAssetId !== null) {
    const logoAsset = scene.assets.find((a) => a.id === slate.logoAssetId)
    if (!logoAsset) {
      errors.push({
        type: 'invalid_logo_ref',
        message: `Logo asset ${slate.logoAssetId} not found`,
      })
    } else if (logoAsset.role !== 'logo') {
      errors.push({
        type: 'invalid_logo_ref',
        message: `Asset ${slate.logoAssetId} has role '${logoAsset.role}', expected 'logo'`,
      })
    }
  }

  return errors
}

// ---------------------------------------------------------------------------
// Migrations (schema version upgrades)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const migrations: Record<number, (s: unknown) => unknown> = {
  // Future: 1: (s) => ({ ...(s as SceneV1), schemaVersion: 2, /* new fields */ }),
}

/**
 * Parse and migrate a raw scene JSON blob to the current schema version.
 * Returns the validated scene or throws a ZodError / Error.
 */
export function parseAndMigrateScene(raw: unknown): SceneV1 {
  // Peek at schemaVersion
  if (typeof raw !== 'object' || raw === null || !('schemaVersion' in raw)) {
    throw new Error('Missing schemaVersion')
  }
  const version = (raw as Record<string, unknown>).schemaVersion
  if (typeof version !== 'number') {
    throw new Error('schemaVersion must be a number')
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Scene was created by a newer umveil (schemaVersion ${version}). Please update the app.`
    )
  }

  let data: unknown = raw
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
    const migrate = migrations[v]
    if (migrate) data = migrate(data)
  }

  return SceneV1Schema.parse(data)
}
