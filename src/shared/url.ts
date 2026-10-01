/**
 * url.ts — Embed URL validation and normalization.
 * Pure TypeScript, no side effects.
 * Implements FR-10.
 */

export type UrlValidationResult =
  | { valid: true; normalized: string; insecure: boolean }
  | { valid: false; reason: string }

const ALLOWED_PROTOCOLS = new Set(['https:', 'http:'])

// YouTube patterns → /embed/
// Matches: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID
const YT_PATTERNS = [
  /^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{11})/,
  /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})/,
  /^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
]

function normalizeYouTube(raw: string): string | null {
  for (const pat of YT_PATTERNS) {
    const m = raw.match(pat)
    if (m) {
      return `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0`
    }
  }
  return null
}

export function validateEmbedUrl(input: string): UrlValidationResult {
  const trimmed = input.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { valid: false, reason: 'Not a valid URL.' }
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return {
      valid: false,
      reason: `Only http and https URLs are accepted (got "${parsed.protocol}").`,
    }
  }

  // YouTube normalization
  const ytNorm = normalizeYouTube(trimmed)
  if (ytNorm !== null) {
    return { valid: true, normalized: ytNorm, insecure: false }
  }

  const insecure = parsed.protocol === 'http:'
  return { valid: true, normalized: trimmed, insecure }
}

/**
 * Returns true if the URL is safe to load in a webview (http/https only).
 * Used at navigation time to block redirects to disallowed protocols.
 */
export function isSafeEmbedNavigation(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
