/**
 * win32.ts — Win32Bridge: the ONLY module that imports koffi.
 * Cursor confinement, HWND↔sourceId mapping, window info, foreground control.
 */
import { logger } from './logger'

export interface PhysicalRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Win32WindowInfo {
  processName: string
  title: string
  minimized: boolean
}

// Lazy-load koffi so that if it fails (wrong arch, missing) we degrade gracefully
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let user32: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel32: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let koffi: any = null

function loadKoffi(): boolean {
  if (koffi) return true
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    koffi = require('koffi')

    // ---- User32 ----
    user32 = koffi.load('user32.dll')

    // BOOL ClipCursor(const RECT* lpRect)
    const ClipCursorFn = user32.func('ClipCursor', 'bool', ['pointer'])

    // BOOL GetWindowRect(HWND, LPRECT)
    // HWND GetForegroundWindow()
    // BOOL SetForegroundWindow(HWND)
    // BOOL IsIconic(HWND)
    const GetWindowTextLengthFn = user32.func('GetWindowTextLengthW', 'int', ['pointer'])
    const GetWindowTextFn = user32.func('GetWindowTextW', 'int', ['pointer', 'str16', 'int'])
    const IsIconicFn = user32.func('IsIconic', 'bool', ['pointer'])
    const SetForegroundWindowFn = user32.func('SetForegroundWindow', 'bool', ['pointer'])
    const ShowWindowFn = user32.func('ShowWindow', 'bool', ['pointer', 'int'])

    // ---- Kernel32 ----
    kernel32 = koffi.load('kernel32.dll')
    const OpenProcessFn = kernel32.func('OpenProcess', 'pointer', ['uint', 'bool', 'uint'])
    const GetModuleFileNameExFn = (() => {
      try {
        const psapi = koffi.load('psapi.dll')
        return psapi.func('GetModuleFileNameExW', 'uint', ['pointer', 'pointer', 'str16', 'uint'])
      } catch {
        return null
      }
    })()
    const CloseHandleFn = kernel32.func('CloseHandle', 'bool', ['pointer'])
    const GetWindowThreadProcessIdFn = user32.func('GetWindowThreadProcessId', 'uint', ['pointer', 'pointer'])

    // Attach to module
    ;(Win32Bridge as unknown as Record<string, unknown>)._fns = {
      ClipCursorFn, GetWindowTextLengthFn, GetWindowTextFn, IsIconicFn,
      SetForegroundWindowFn, ShowWindowFn, OpenProcessFn, GetModuleFileNameExFn,
      CloseHandleFn, GetWindowThreadProcessIdFn,
    }

    logger.info('win32.loaded')
    return true
  } catch (e) {
    logger.warn('win32.load_failed', { error: String(e) })
    koffi = null
    return false
  }
}

// RECT struct layout for ClipCursor
function makeRect(r: PhysicalRect): Buffer {
  const buf = Buffer.alloc(16)
  buf.writeInt32LE(r.left, 0)
  buf.writeInt32LE(r.top, 4)
  buf.writeInt32LE(r.right, 8)
  buf.writeInt32LE(r.bottom, 12)
  return buf
}

/**
 * Parse a desktopCapturer sourceId of the form "window:<HWND>:0" into a BigInt HWND.
 * Returns null if unparseable.
 */
export function hwndFromSourceId(sourceId: string): bigint | null {
  const m = sourceId.match(/^window:(\d+):/)
  if (!m) return null
  try {
    return BigInt(m[1])
  } catch {
    return null
  }
}

export const Win32Bridge = {
  /** Confine the cursor to the given physical-pixel rect. Pass null to release. */
  clipCursor(rect: PhysicalRect | null): void {
    if (!loadKoffi()) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fns = (Win32Bridge as any)._fns
    try {
      if (rect === null) {
        fns.ClipCursorFn(null)
      } else {
        fns.ClipCursorFn(makeRect(rect))
      }
      logger.debug('win32.clipCursor', { rect })
    } catch (e) {
      logger.warn('win32.clipCursor.error', { error: String(e) })
    }
  },

  /** Get window title, process name, and minimized state for an HWND. */
  getWindowInfo(hwnd: bigint): Win32WindowInfo | null {
    if (!loadKoffi()) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fns = (Win32Bridge as any)._fns
    try {
      const hwndPtr = Buffer.alloc(8)
      hwndPtr.writeBigUInt64LE(hwnd)

      // Get title
      const len: number = fns.GetWindowTextLengthFn(hwndPtr)
      const titleBuf = Buffer.alloc((len + 1) * 2)
      fns.GetWindowTextFn(hwndPtr, titleBuf, len + 1)
      const title = titleBuf.toString('utf16le').replace(/\0.*$/, '')

      // Minimized?
      const minimized: boolean = fns.IsIconicFn(hwndPtr)

      // Get process name
      const pidBuf = Buffer.alloc(4)
      fns.GetWindowThreadProcessIdFn(hwndPtr, pidBuf)
      const pid = pidBuf.readUInt32LE(0)
      let processName = ''
      const PROCESS_QUERY_INFORMATION = 0x0400
      const PROCESS_VM_READ = 0x0010
      const hProc = fns.OpenProcessFn(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid)
      if (hProc) {
        try {
          if (fns.GetModuleFileNameExFn) {
            const nameBuf = Buffer.alloc(520)
            fns.GetModuleFileNameExFn(hProc, null, nameBuf, 260)
            processName = nameBuf.toString('utf16le').replace(/\0.*$/, '').split(/[\\/]/).pop() ?? ''
          }
        } finally {
          fns.CloseHandleFn(hProc)
        }
      }

      return { title, minimized, processName }
    } catch (e) {
      logger.warn('win32.getWindowInfo.error', { hwnd: String(hwnd), error: String(e) })
      return null
    }
  },

  /** Bring a window to the foreground. */
  bringToFront(hwnd: bigint): boolean {
    if (!loadKoffi()) return false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fns = (Win32Bridge as any)._fns
    try {
      const hwndPtr = Buffer.alloc(8)
      hwndPtr.writeBigUInt64LE(hwnd)
      // SW_RESTORE = 9 if minimized
      const minimized: boolean = fns.IsIconicFn(hwndPtr)
      if (minimized) fns.ShowWindowFn(hwndPtr, 9)
      const ok: boolean = fns.SetForegroundWindowFn(hwndPtr)
      logger.debug('win32.bringToFront', { hwnd: String(hwnd), ok })
      return ok
    } catch (e) {
      logger.warn('win32.bringToFront.error', { hwnd: String(hwnd), error: String(e) })
      return false
    }
  },

  hwndFromSourceId,
}
