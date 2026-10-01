/**
 * media-protocol.ts — Registers umveil-media:// custom protocol.
 * Serves media files from the scene cache with Range support. FR-07/08, S-5.
 */
import { protocol, net } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { logger } from './logger'

const SCHEME = 'umveil-media'

/** Map of assetId → absolute file path on disk. Updated by SceneService. */
const assetPaths = new Map<string, string>()

export const MediaProtocol = {
  register(): void {
    protocol.registerSchemesAsPrivileged([
      {
        scheme: SCHEME,
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          stream: true,
          bypassCSP: true,
        },
      },
    ])
    logger.info('media-protocol.scheme-registered')
  },

  /** Call after app is ready to install the handler. */
  install(): void {
    protocol.handle(SCHEME, (request) => {
      const url = new URL(request.url)
      // URL format: umveil-media://asset/<assetId>
      const assetId = url.pathname.replace(/^\//, '')
      const filePath = assetPaths.get(assetId)

      if (!filePath) {
        logger.warn('media-protocol.asset-not-found', { assetId })
        return new Response('Asset not found', { status: 404 })
      }

      if (!fs.existsSync(filePath)) {
        logger.warn('media-protocol.file-missing', { assetId, filePath })
        return new Response('File not found', { status: 404 })
      }

      // Use net.fetch with file:// for Range support
      return net.fetch(`file://${filePath}`, {
        headers: request.headers,
        method: request.method,
      })
    })
    logger.info('media-protocol.handler-installed')
  },

  setAssetPath(assetId: string, filePath: string): void {
    assetPaths.set(assetId, filePath)
  },

  clearAssetPaths(): void {
    assetPaths.clear()
  },

  getAssetUrl(assetId: string): string {
    return `${SCHEME}://asset/${assetId}`
  },
}
