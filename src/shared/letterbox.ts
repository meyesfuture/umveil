/**
 * letterbox.ts — Pure math for fitting a 16:9 canvas inside an arbitrary viewport.
 * Mirrors the CSS `min()` logic in the Stage renderer (stage/main.ts).
 * Extracted here so it can be unit-tested without a DOM.
 *
 * The Stage always shows a 16:9 canvas centred inside the display viewport.
 * Horizontal bars appear on wide-but-short displays; vertical bars on tall displays.
 */

export interface LetterboxResult {
  /** Width of the 16:9 canvas in pixels */
  canvasW: number
  /** Height of the 16:9 canvas in pixels */
  canvasH: number
  /** Horizontal offset from viewport left edge (half of the pillar bar width) */
  offsetX: number
  /** Vertical offset from viewport top edge (half of the letterbox bar height) */
  offsetY: number
}

/**
 * Compute the 16:9 letterbox layout for a given viewport.
 *
 * @param vpW  Viewport width in pixels
 * @param vpH  Viewport height in pixels
 */
export function computeLetterbox(vpW: number, vpH: number): LetterboxResult {
  // Match the CSS:  width = min(vpW, vpH * 16/9)
  //                height = min(vpH, vpW * 9/16)
  const canvasW = Math.min(vpW, (vpH * 16) / 9)
  const canvasH = Math.min(vpH, (vpW * 9) / 16)

  const offsetX = (vpW - canvasW) / 2
  const offsetY = (vpH - canvasH) / 2

  return { canvasW, canvasH, offsetX, offsetY }
}
