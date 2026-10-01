/**
 * logger.ts — JSON-lines logger with rotation.
 * 5 files × 2 MB. Implements FR-19.
 * No console.log in committed code; use this instead.
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2 MB
const MAX_FILES = 5

type Level = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  ts: string
  level: Level
  event: string
  data?: unknown
}

let logDir: string | null = null
let currentFile: string | null = null
let currentSize = 0
let fileIndex = 0

function ensureLogDir(): string {
  if (!logDir) {
    logDir = path.join(app.getPath('appData'), 'umveil', 'logs')
    fs.mkdirSync(logDir, { recursive: true })
  }
  return logDir
}

function rotate(): void {
  const dir = ensureLogDir()
  fileIndex = (fileIndex + 1) % MAX_FILES
  currentFile = path.join(dir, `umveil-${fileIndex}.log`)
  // Truncate existing file
  try {
    fs.writeFileSync(currentFile, '')
  } catch {
    // ignore
  }
  currentSize = 0
}

function getFile(): string {
  if (!currentFile) rotate()
  return currentFile!
}

function write(entry: LogEntry): void {
  const line = JSON.stringify(entry) + '\n'
  const file = getFile()
  try {
    fs.appendFileSync(file, line, 'utf8')
    currentSize += Buffer.byteLength(line, 'utf8')
    if (currentSize >= MAX_FILE_SIZE) rotate()
  } catch {
    // swallow — can't log a logging error
  }
}

export const logger = {
  debug: (event: string, data?: unknown) => write({ ts: new Date().toISOString(), level: 'debug', event, data }),
  info: (event: string, data?: unknown) => write({ ts: new Date().toISOString(), level: 'info', event, data }),
  warn: (event: string, data?: unknown) => write({ ts: new Date().toISOString(), level: 'warn', event, data }),
  error: (event: string, data?: unknown) => write({ ts: new Date().toISOString(), level: 'error', event, data }),

  /** Returns the tail of the most recent log file + app version. */
  getDiagnostics(): string {
    const dir = ensureLogDir()
    const lines: string[] = [`umveil ${app.getVersion()} electron/${process.versions.electron} node/${process.versions.node}`]
    // Collect recent lines from all files
    const files = Array.from({ length: MAX_FILES }, (_, i) =>
      path.join(dir, `umveil-${i}.log`)
    ).filter((f) => fs.existsSync(f))
    for (const f of files) {
      try {
        const content = fs.readFileSync(f, 'utf8')
        lines.push(...content.trim().split('\n').slice(-100))
      } catch {
        // ignore missing
      }
    }
    return lines.join('\n')
  },
}
