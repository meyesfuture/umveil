/**
 * scene.ts — SceneService.
 * New/open/save/autosave of .umveil files. FR-01, FR-02.
 * Implements atomic save, zip-slip-safe extraction, asset import.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { store } from '../store'
import { logger } from './logger'
import { MediaProtocol } from './media-protocol'
import { validateEmbedUrl } from '@shared/url'
import {
  parseAndMigrateScene,
  checkIntegrity,
  CURRENT_SCHEMA_VERSION,
} from '@shared/scene-schema'
import type { SceneV1, Asset, SceneItem } from '@shared/scene-schema'
import { ok, err } from '@shared/ipc'
import type { Result } from '@shared/ipc'
import type { ItemView, SceneSettings } from '@shared/state'
import { DEFAULT_SCENE_SETTINGS } from '@shared/state'

const APP_NAME = 'umveil'
const APP_VERSION = '0.1.0'
const SOFT_SIZE_LIMIT = 2 * 1024 * 1024 * 1024 // 2 GB
const AUTOSAVE_INTERVAL_MS = 60_000

// Current scene working dir
let cacheDir: string | null = null
let currentSceneId: string | null = null
let autosaveTimer: ReturnType<typeof setInterval> | null = null

function getCacheRoot(): string {
  const base = app.getPath('userData')
  return path.join(base, 'cache')
}

function getRecoveryDir(): string {
  return path.join(app.getPath('appData'), APP_NAME, 'recovery')
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true })
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function mimeFromExt(ext: string): string | null {
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
    mp4: 'video/mp4', webm: 'video/webm',
  }
  return map[ext.toLowerCase()] ?? null
}

function assetToItemView(item: SceneItem, assets: Asset[], cacheMediaDir: string): ItemView {
  const base = { id: item.id, name: item.name, status: 'ok' as const }

  if (item.kind === 'image') {
    const asset = assets.find((a) => a.id === item.assetId)
    const assetId = item.assetId
    MediaProtocol.setAssetPath(assetId, path.join(cacheMediaDir, path.basename(asset?.file ?? '')))
    return { ...base, kind: 'image', assetId, thumbUrl: MediaProtocol.getAssetUrl(assetId) }
  }
  if (item.kind === 'video') {
    const asset = assets.find((a) => a.id === item.assetId)
    const assetId = item.assetId
    MediaProtocol.setAssetPath(assetId, path.join(cacheMediaDir, path.basename(asset?.file ?? '')))
    return {
      ...base, kind: 'video', assetId,
      thumbUrl: MediaProtocol.getAssetUrl(assetId),
      durationMs: asset?.durationMs ?? 0,
      playback: item.playback,
    }
  }
  if (item.kind === 'embed') {
    return { ...base, kind: 'embed', url: item.url, normalizedUrl: item.normalizedUrl }
  }
  if (item.kind === 'app') {
    return { ...base, kind: 'app', match: item.match, running: false }
  }
  // Exhaustive
  const _: never = item
  void _
  return { ...base, kind: 'image', assetId: '', thumbUrl: '' }
}

function startAutosave(): void {
  if (autosaveTimer) clearInterval(autosaveTimer)
  autosaveTimer = setInterval(() => {
    const state = store.getState()
    if (!state.scene.dirty) return
    if (!currentSceneId) return
    const recoveryDir = getRecoveryDir()
    ensureDir(recoveryDir)
    const recoveryPath = path.join(recoveryDir, `${currentSceneId}.umveil`)
    SceneService.saveScene(recoveryPath, true).catch((e) => {
      logger.warn('autosave.failed', { error: String(e) })
    })
  }, AUTOSAVE_INTERVAL_MS)
}

function stopAutosave(): void {
  if (autosaveTimer) {
    clearInterval(autosaveTimer)
    autosaveTimer = null
  }
}

export const SceneService = {
  newScene(): void {
    stopAutosave()
    MediaProtocol.clearAssetPaths()
    currentSceneId = uuidv4()
    cacheDir = path.join(getCacheRoot(), currentSceneId)
    store.dispatch({ type: 'SCENE_NEW' })
    logger.info('scene.new')
    startAutosave()
  },

  async openScene(filePath: string): Promise<Result<void>> {
    logger.info('scene.open', { filePath })
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yauzl = require('yauzl') as typeof import('yauzl')

    return new Promise((resolve) => {
      yauzl.open(filePath, { lazyEntries: true }, (err2, zipfile) => {
        if (err2 || !zipfile) {
          store.dispatch({
            type: 'ALERT_ADD',
            alert: { level: 'error', code: 'SCENE_LOAD_FAILED', message: `Cannot open file: ${err2?.message}`, sticky: false },
          })
          resolve(err('E_IO', String(err2)))
          return
        }

        let sceneJson: unknown = null
        const mediaEntries: { entryName: string; sha256: string; ext: string }[] = []

        zipfile.readEntry()
        zipfile.on('entry', (entry: import('yauzl').Entry) => {
          const name = entry.fileName
          if (name === 'scene.json') {
            zipfile.openReadStream(entry, (e, stream) => {
              if (e || !stream) { zipfile.readEntry(); return }
              const chunks: Buffer[] = []
              stream.on('data', (c: Buffer) => chunks.push(c))
              stream.on('end', () => {
                try {
                  sceneJson = JSON.parse(Buffer.concat(chunks).toString('utf8'))
                } catch { /* ignore */ }
                zipfile.readEntry()
              })
            })
          } else {
            // Zip-slip safe: only accept media/<sha256>.<ext>
            const m = name.match(/^media\/([0-9a-f]{64})\.([a-z0-9]{1,8})$/)
            if (m) {
              mediaEntries.push({ entryName: name, sha256: m[1], ext: m[2] })
            }
            zipfile.readEntry()
          }
        })

        zipfile.on('end', async () => {
          if (!sceneJson) {
            resolve(err('E_SCENE_INVALID', 'Missing scene.json'))
            return
          }

          let scene: import('@shared/scene-schema').SceneV1
          try {
            scene = parseAndMigrateScene(sceneJson)
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            const code = msg.includes('newer') ? 'E_SCENE_TOO_NEW' : 'E_SCENE_INVALID'
            store.dispatch({
              type: 'ALERT_ADD',
              alert: { level: 'error', code: 'SCENE_LOAD_FAILED', message: msg, sticky: false },
            })
            resolve(err(code, msg))
            return
          }

          const integrityErrors = checkIntegrity(scene)
          if (integrityErrors.some((e) => e.type === 'missing_asset')) {
            // Open anyway but warn
            for (const ie of integrityErrors) {
              logger.warn('scene.integrity', ie)
            }
          }

          // Set up cache dir
          stopAutosave()
          MediaProtocol.clearAssetPaths()
          currentSceneId = scene.scene.id
          cacheDir = path.join(getCacheRoot(), currentSceneId)
          const cacheMediaDir = path.join(cacheDir, 'media')
          ensureDir(cacheMediaDir)

          // Re-open zip to extract media (simpler to re-open)
          yauzl.open(filePath, { lazyEntries: true }, (err3, zipfile2) => {
            if (err3 || !zipfile2) {
              resolve(err('E_IO', String(err3)))
              return
            }
            const referencedSha256s = new Set(scene.assets.map((a) => a.sha256))
            zipfile2.readEntry()
            zipfile2.on('entry', (entry: import('yauzl').Entry) => {
              const m = entry.fileName.match(/^media\/([0-9a-f]{64})\.([a-z0-9]{1,8})$/)
              if (!m || !referencedSha256s.has(m[1])) {
                zipfile2.readEntry()
                return
              }
              const destPath = path.join(cacheMediaDir, `${m[1]}.${m[2]}`)
              if (fs.existsSync(destPath)) {
                zipfile2.readEntry()
                return
              }
              zipfile2.openReadStream(entry, (e2, stream) => {
                if (e2 || !stream) { zipfile2.readEntry(); return }
                const out = fs.createWriteStream(destPath)
                stream.on('error', (err) => {
                  logger.warn('scene.extract.stream-error', { error: String(err) })
                  out.close()
                  zipfile2.readEntry()
                })
                out.on('error', (err) => {
                  logger.warn('scene.extract.write-error', { error: String(err) })
                  zipfile2.readEntry()
                })
                out.on('finish', () => zipfile2.readEntry())
                stream.pipe(out)
              })
            })
            zipfile2.on('end', () => {
              // Register asset paths
              for (const asset of scene.assets) {
                const filePart = path.basename(asset.file)
                MediaProtocol.setAssetPath(asset.id, path.join(cacheMediaDir, filePart))
              }
              // Build ItemViews
              const items: ItemView[] = scene.items.map((item) =>
                assetToItemView(item, scene.assets, cacheMediaDir)
              )
              const settings: SceneSettings = {
                slate: scene.settings.slate,
                transition: scene.settings.transition,
                audio: { output: scene.settings.audio.output ?? null },
                stage: { displayHint: scene.settings.stage.displayHint ?? null },
                cursorLock: scene.settings.cursorLock,
                returnTarget: scene.settings.returnTarget,
              }
              store.dispatch({
                type: 'SCENE_LOADED',
                path: filePath,
                name: scene.scene.name,
                settings,
                items,
              })
              startAutosave()
              logger.info('scene.opened', { id: currentSceneId, items: items.length })
              resolve(ok(undefined))
            })
          })
        })
      })
    })
  },

  async saveScene(filePath: string, isAutosave = false): Promise<Result<{ path: string }>> {
    logger.info('scene.save', { filePath, isAutosave })
    const state = store.getState()
    const mediaDir = cacheDir ? path.join(cacheDir, 'media') : null

    const sceneId = currentSceneId ?? uuidv4()
    const now = new Date().toISOString()
    let createdAt = now

    // Try to preserve createdAt
    if (fs.existsSync(filePath)) {
      try {
        const yauzl = require('yauzl') as typeof import('yauzl')
        await new Promise<void>((resolve) => {
          yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
            if (err || !zipfile) { resolve(); return }
            zipfile.readEntry()
            zipfile.on('entry', (entry: import('yauzl').Entry) => {
              if (entry.fileName === 'scene.json') {
                zipfile.openReadStream(entry, (e, stream) => {
                  if (!e && stream) {
                    const chunks: Buffer[] = []
                    stream.on('data', (c) => chunks.push(c))
                    stream.on('end', () => {
                      try {
                        const json = JSON.parse(Buffer.concat(chunks).toString('utf8'))
                        if (json.scene?.createdAt) createdAt = json.scene.createdAt
                      } catch { /* ignore */ }
                      resolve()
                    })
                  } else {
                    resolve()
                  }
                })
              } else {
                zipfile.readEntry()
              }
            })
            zipfile.on('end', () => resolve())
          })
        })
      } catch { /* ignore */ }
    }

    const assets: Asset[] = []
    const items: SceneItem[] = []
    const logoAssetId = state.scene.settings.slate.mode === 'logo' ? state.scene.settings.slate.logoAssetId : null

    for (const item of state.scene.items) {
      if (item.kind === 'image' || item.kind === 'video') {
        let foundFile: string | null = null
        if (mediaDir && fs.existsSync(mediaDir)) {
          const files = fs.readdirSync(mediaDir)
          foundFile = files.find((f) => f.startsWith(item.assetId)) ?? null
          if (!foundFile) {
            foundFile = files.find((f) => f.endsWith(`.${item.assetId.split('.').pop()}`)) ?? null
          }
        }

        if (!foundFile) continue
        const absPath = path.join(mediaDir!, foundFile)
        
        // Extract sha256 from filename instead of re-hashing
        let sha256 = ''
        const m = foundFile.match(/^([0-9a-f]{64})\./)
        if (m) {
          sha256 = m[1]
        } else {
          sha256 = await sha256File(absPath)
        }
        
        const ext = path.extname(foundFile).replace('.', '')
        const mime = mimeFromExt(ext)
        if (!mime) continue
        const stat = fs.statSync(absPath)

        // Prevent integrity collision: if this item's asset is ALSO the logo, mark it as logo
        const role = (item.assetId === logoAssetId) ? 'logo' : 'item'

        const asset: Asset = {
          id: item.assetId,
          role,
          file: `media/${sha256}.${ext}`,
          sha256,
          mime: mime as Asset['mime'],
          bytes: stat.size,
        }
        if (item.kind === 'video') {
          asset.durationMs = item.durationMs
        }
        assets.push(asset)

        if (item.kind === 'image') {
          items.push({ id: item.id, kind: 'image', name: item.name, assetId: item.assetId })
        } else {
          items.push({ id: item.id, kind: 'video', name: item.name, assetId: item.assetId, playback: item.playback })
        }
      } else if (item.kind === 'embed') {
        items.push({ id: item.id, kind: 'embed', name: item.name, url: item.url, normalizedUrl: item.normalizedUrl })
      } else if (item.kind === 'app') {
        items.push({ id: item.id, kind: 'app', name: item.name, match: item.match })
      }
    }

    if (logoAssetId && mediaDir && !assets.find((a) => a.id === logoAssetId)) {
      const files = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : []
      const logoFile = files.find((f) => f.startsWith(logoAssetId))
      if (logoFile) {
        const absPath = path.join(mediaDir, logoFile)
        const sha256 = logoFile.match(/^([0-9a-f]{64})\./)?.[1] ?? await sha256File(absPath)
        const ext = path.extname(logoFile).replace('.', '')
        const mime = mimeFromExt(ext)
        if (mime) {
          const stat = fs.statSync(absPath)
          assets.push({
            id: logoAssetId,
            role: 'logo',
            file: `media/${sha256}.${ext}`,
            sha256,
            mime: mime as Asset['mime'],
            bytes: stat.size,
          })
        }
      }
    }

    const sceneJson: SceneV1 = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      app: { name: APP_NAME, version: APP_VERSION },
      scene: {
        id: sceneId,
        name: state.scene.name,
        createdAt,
        modifiedAt: now,
      },
      settings: {
        slate: state.scene.settings.slate,
        transition: state.scene.settings.transition,
        audio: { output: state.scene.settings.audio.output },
        stage: { displayHint: state.scene.settings.stage.displayHint },
        cursorLock: state.scene.settings.cursorLock,
        returnTarget: state.scene.settings.returnTarget,
      },
      assets,
      items,
    }

    const tmpPath = `${filePath}.tmp`
    const bakPath = `${filePath}.bak`

    try {
      const yazl = require('yazl') as typeof import('yazl')
      const zipfile = new yazl.ZipFile()

      const sceneJsonBuf = Buffer.from(JSON.stringify(sceneJson, null, 2), 'utf8')
      zipfile.addBuffer(sceneJsonBuf, 'scene.json', { compress: false })

      if (mediaDir && fs.existsSync(mediaDir)) {
        const mediaFiles = fs.readdirSync(mediaDir)
        for (const asset of assets) {
          const sha256 = asset.sha256
          const localName = mediaFiles.find((f) => f.startsWith(sha256) || f.startsWith(asset.id))
          if (localName) {
            zipfile.addFile(path.join(mediaDir, localName), asset.file, { compress: false })
          }
        }
      }

      zipfile.end()

      await new Promise<void>((resolve2, reject) => {
        const out = fs.createWriteStream(tmpPath)
        zipfile.outputStream.pipe(out)
        out.on('finish', () => resolve2())
        out.on('error', reject)
      })

      if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, bakPath)
      }
      fs.renameSync(tmpPath, filePath)

      if (!isAutosave) {
        store.dispatch({ type: 'SCENE_SAVED', path: filePath })
      }
      logger.info('scene.saved', { filePath })
      return ok({ path: filePath })
    } catch (e) {
      // Clean up tmp
      if (fs.existsSync(tmpPath)) {
        try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
      }
      logger.error('scene.save.failed', { error: String(e) })
      store.dispatch({
        type: 'ALERT_ADD',
        alert: { level: 'error', code: 'SCENE_SAVE_FAILED', message: `Save failed: ${String(e)}`, sticky: false },
      })
      return err('E_IO', String(e))
    }
  },

  async importItems(filePaths: string[]): Promise<Result<{
    added: ItemView[]
    rejected: { path: string; reason: string }[]
  }>> {
    const added: ItemView[] = []
    const rejected: { path: string; reason: string }[] = []

    if (!cacheDir) {
      this.newScene()
    }
    const mediaDir = path.join(cacheDir!, 'media')
    ensureDir(mediaDir)

    for (const filePath of filePaths) {
      try {
        const stat = fs.statSync(filePath)
        if (stat.size > SOFT_SIZE_LIMIT) {
          logger.warn('import.size-warning', { filePath, size: stat.size })
        }

        const ext = path.extname(filePath).replace('.', '').toLowerCase()
        const mime = mimeFromExt(ext)
        if (!mime) {
          rejected.push({ path: filePath, reason: `Unsupported file type: .${ext}` })
          continue
        }

        const sha256 = await sha256File(filePath)
        const destName = `${sha256}.${ext}`
        const destPath = path.join(mediaDir, destName)

        // Dedupe by sha256
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(filePath, destPath)
        }

        const assetId = uuidv4()
        MediaProtocol.setAssetPath(assetId, destPath)
        const isVideo = mime.startsWith('video/')

        let item: ItemView
        if (isVideo) {
          item = {
            id: uuidv4(),
            kind: 'video',
            name: path.basename(filePath, path.extname(filePath)),
            status: 'ok',
            assetId,
            thumbUrl: MediaProtocol.getAssetUrl(assetId),
            durationMs: 0, // probed asynchronously
            playback: { autoplay: true, loop: false, volume: 100 },
          }
        } else {
          item = {
            id: uuidv4(),
            kind: 'image',
            name: path.basename(filePath, path.extname(filePath)),
            status: 'ok',
            assetId,
            thumbUrl: MediaProtocol.getAssetUrl(assetId),
          }
        }

        store.dispatch({ type: 'SCENE_ITEM_ADD', item })
        added.push(item)
        logger.info('import.added', { filePath, assetId, mime })
      } catch (e) {
        rejected.push({ path: filePath, reason: String(e) })
        logger.warn('import.failed', { filePath, error: String(e) })
      }
    }

    return ok({ added, rejected })
  },

  addEmbedItem(url: string, name?: string): Result<ItemView> {
    const validation = validateEmbedUrl(url)
    if (!validation.valid) {
      return err('E_VALIDATION', validation.reason)
    }
    const item: ItemView = {
      id: uuidv4(),
      kind: 'embed',
      name: name ?? new URL(validation.normalized).hostname,
      status: 'ok',
      url,
      normalizedUrl: validation.normalized,
    }
    store.dispatch({ type: 'SCENE_ITEM_ADD', item })
    logger.info('embed.added', { url: validation.normalized })
    return ok(item)
  },
}
