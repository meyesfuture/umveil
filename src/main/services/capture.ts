/**
 * capture.ts — CaptureService.
 * Lists windows for App Switcher (FR-12), pins app targets.
 * Confidence monitor source ID is exposed via stage window.
 */
import { desktopCapturer, BrowserWindow } from 'electron'
import { store } from '../store'
import { logger } from './logger'
import { Win32Bridge, hwndFromSourceId } from './win32'
import type { AppWindowInfo } from '@shared/ipc'
import { ok } from '@shared/ipc'
import type { Result } from '@shared/ipc'
import type { ItemView } from '@shared/state'
import { v4 as uuidv4 } from 'uuid'

/** Own window IDs to exclude from the app list. */
const ownWindowIds = new Set<number>()

export function registerOwnWindow(win: BrowserWindow): void {
  ownWindowIds.add(win.id)
}

export const CaptureService = {
  async listWindows(): Promise<AppWindowInfo[]> {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    })

    const ownHwnds = new Set(
      BrowserWindow.getAllWindows().map(w => w.getNativeWindowHandle().readBigUInt64LE(0).toString())
    )

    const results: AppWindowInfo[] = []
    for (const src of sources) {
      const hwndStr = src.id.match(/^window:(\d+):/)?.[1]
      if (hwndStr && ownHwnds.has(hwndStr)) continue
      // Skip shell
      if (src.name === '') continue

      const hwnd = hwndFromSourceId(src.id)
      let processName: string | null = null
      let minimized = false

      if (hwnd !== null) {
        const info = Win32Bridge.getWindowInfo(hwnd)
        if (info) {
          processName = info.processName
          minimized = info.minimized
        }
      }

      results.push({
        sourceId: src.id,
        title: src.name,
        processName,
        iconDataUrl: src.appIcon?.toDataURL() ?? null,
        thumbDataUrl: src.thumbnail.toDataURL(),
        minimized,
      })
    }
    logger.debug('capture.listWindows', { count: results.length })
    return results
  },

  async pinAppTarget(sourceId: string): Promise<Result<ItemView>> {
    const hwnd = hwndFromSourceId(sourceId)
    let processName = ''
    let title = sourceId

    if (hwnd !== null) {
      const info = Win32Bridge.getWindowInfo(hwnd)
      if (info) {
        processName = info.processName
        title = info.title
      }
    }

    const item: ItemView = {
      id: uuidv4(),
      kind: 'app',
      name: title || processName || 'App target',
      status: 'ok',
      match: { processName: processName || title },
      running: true,
    }

    store.dispatch({ type: 'SCENE_ITEM_ADD', item })
    logger.info('capture.pinAppTarget', { processName, title })
    return ok(item)
  },
}
