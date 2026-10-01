/**
 * embed-guest.ts — Guest preload injected into <webview> embeds.
 * NO IPC access. Patches audio elements to follow the Stage sink.
 * Runs in the webview's renderer process (isolated from main IPC).
 */

// This runs in the guest page's main world (injected via webview preload).
// It has NO access to Electron IPC — by design (security boundary).

;(function () {
  'use strict'

  /**
   * Try to set the audio sink on a media element.
   * `setSinkId` is available in Chromium; failure is silently swallowed.
   */
  function applySink(el: HTMLMediaElement, deviceId: string): void {
    if (typeof (el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId === 'function') {
      ;(el as HTMLMediaElement & { setSinkId: (id: string) => Promise<void> })
        .setSinkId(deviceId)
        .catch(() => undefined)
    }
  }

  // The target device ID is injected via a meta tag:
  // <meta name="umveil-sink" content="<deviceId>">
  // Main process writes this before loading the URL (via executeJavaScript or preload).
  // Fallback: read from sessionStorage.
  function getSinkId(): string | null {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="umveil-sink"]')
    if (meta) return meta.content || null
    return sessionStorage.getItem('umveil-sink')
  }

  function patchExisting(): void {
    const sinkId = getSinkId()
    if (!sinkId) return
    document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((el) => applySink(el, sinkId))
  }

  // Observe new media elements
  const observer = new MutationObserver((mutations) => {
    const sinkId = getSinkId()
    if (!sinkId) return
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLMediaElement) {
          applySink(node, sinkId)
        } else if (node instanceof Element) {
          node.querySelectorAll<HTMLMediaElement>('audio, video').forEach((el) => applySink(el, sinkId))
        }
      }
    }
  })

  function init(): void {
    patchExisting()
    observer.observe(document.documentElement, { childList: true, subtree: true })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
