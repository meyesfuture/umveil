/**
 * letterbox.test.ts — I-06 from TEST_PLAN.md
 *
 * I-06: Letterbox math at 1024×768, 1280×800, 1920×1080, 3840×2160, 3440×1440
 *       (canvas size and offsets).
 *
 * The Stage renderer uses CSS:
 *   width:  min(100vw, calc(100vh * 16/9))
 *   height: min(100vh, calc(100vw * 9/16))
 *   centered with transform: translate(-50%, -50%)
 *
 * This mirrors that math in computeLetterbox() from src/shared/letterbox.ts.
 */

import { describe, it, expect } from 'vitest'
import { computeLetterbox } from '../letterbox'

// Helper: assert canvas keeps 16:9 aspect within tolerance
function assertAspect(canvasW: number, canvasH: number, tol = 0.001) {
  expect(canvasW / canvasH).toBeCloseTo(16 / 9, 3)
  // also verify the tolerance value is sensible
  expect(tol).toBeGreaterThan(0)
}

describe('I-06: Letterbox math', () => {
  // -------------------------------------------------------------------------
  // 1920×1080 — exact 16:9, canvas fills the entire viewport
  // -------------------------------------------------------------------------
  it('1920×1080 (exact 16:9): canvas fills viewport, no bars', () => {
    const { canvasW, canvasH, offsetX, offsetY } = computeLetterbox(1920, 1080)
    expect(canvasW).toBeCloseTo(1920)
    expect(canvasH).toBeCloseTo(1080)
    expect(offsetX).toBeCloseTo(0)
    expect(offsetY).toBeCloseTo(0)
  })

  // -------------------------------------------------------------------------
  // 1024×768 — 4:3, wider than 16:9 relative to height → letterbox (H bars)
  //   canvas height = 768, canvas width = 768 * 16/9 = 1365.33  > 1024
  //   so canvas width = 1024, canvas height = 1024 * 9/16 = 576
  //   offsetY = (768 - 576) / 2 = 96
  // -------------------------------------------------------------------------
  it('1024×768 (4:3 display): horizontal bars, pillar-free', () => {
    const { canvasW, canvasH, offsetX, offsetY } = computeLetterbox(1024, 768)
    expect(canvasW).toBeCloseTo(1024)
    expect(canvasH).toBeCloseTo(576)
    expect(offsetX).toBeCloseTo(0)          // no pillar bars
    expect(offsetY).toBeCloseTo(96)         // (768 - 576) / 2
    assertAspect(canvasW, canvasH)
  })

  // -------------------------------------------------------------------------
  // 1280×800 — 16:10, similar to 4:3 case
  //   canvas width = 1280, canvas height = 1280 * 9/16 = 720
  //   offsetY = (800 - 720) / 2 = 40
  // -------------------------------------------------------------------------
  it('1280×800 (16:10 display): horizontal bars top and bottom', () => {
    const { canvasW, canvasH, offsetX, offsetY } = computeLetterbox(1280, 800)
    expect(canvasW).toBeCloseTo(1280)
    expect(canvasH).toBeCloseTo(720)
    expect(offsetX).toBeCloseTo(0)
    expect(offsetY).toBeCloseTo(40)         // (800 - 720) / 2
    assertAspect(canvasW, canvasH)
  })

  // -------------------------------------------------------------------------
  // 3840×2160 — exact 4K 16:9, no bars
  // -------------------------------------------------------------------------
  it('3840×2160 (4K, exact 16:9): canvas fills viewport, no bars', () => {
    const { canvasW, canvasH, offsetX, offsetY } = computeLetterbox(3840, 2160)
    expect(canvasW).toBeCloseTo(3840)
    expect(canvasH).toBeCloseTo(2160)
    expect(offsetX).toBeCloseTo(0)
    expect(offsetY).toBeCloseTo(0)
  })

  // -------------------------------------------------------------------------
  // 3440×1440 — ultra-wide 21:9 → pillar bars on left and right
  //   canvas height = 1440, canvas width = 1440 * 16/9 = 2560
  //   offsetX = (3440 - 2560) / 2 = 440
  // -------------------------------------------------------------------------
  it('3440×1440 (ultrawide 21:9): pillar bars left and right', () => {
    const { canvasW, canvasH, offsetX, offsetY } = computeLetterbox(3440, 1440)
    expect(canvasW).toBeCloseTo(2560)
    expect(canvasH).toBeCloseTo(1440)
    expect(offsetX).toBeCloseTo(440)        // (3440 - 2560) / 2
    expect(offsetY).toBeCloseTo(0)          // no letterbox bars
    assertAspect(canvasW, canvasH)
  })

  // -------------------------------------------------------------------------
  // Square viewport 1080×1080 — pillar bars
  //   canvas width = 1080 * 16/9 = 1920 → capped to 1080 → pillar
  //   canvas height = 1080 * 9/16 = 607.5 → canvas height = 607.5
  //   Wait: min(1080, 1080*9/16) = min(1080, 607.5) = 607.5
  //   offsetY = (1080 - 607.5) / 2 = 236.25
  // -------------------------------------------------------------------------
  it('1080×1080 (square): horizontal bars (16:9 is wider than square)', () => {
    const { canvasW, canvasH, offsetX, offsetY } = computeLetterbox(1080, 1080)
    expect(canvasW).toBeCloseTo(1080)
    expect(canvasH).toBeCloseTo(607.5)
    expect(offsetX).toBeCloseTo(0)
    expect(offsetY).toBeCloseTo(236.25)
    assertAspect(canvasW, canvasH)
  })

  // -------------------------------------------------------------------------
  // Portrait 1080×1920 (rotated 9:16 display) — pillar bars
  //   canvas height = 1920, canvas width = 1920 * 16/9 = 3413 → capped to 1080
  //   canvas height = 1080 * 9/16 = 607.5 → min(1920, 607.5) = 607.5
  //   offsetY = (1920 - 607.5) / 2 = 656.25
  // -------------------------------------------------------------------------
  it('1080×1920 (portrait): heavy horizontal bars', () => {
    const { canvasW, canvasH, offsetX, offsetY } = computeLetterbox(1080, 1920)
    expect(canvasW).toBeCloseTo(1080)
    expect(canvasH).toBeCloseTo(607.5)
    expect(offsetX).toBeCloseTo(0)
    expect(offsetY).toBeCloseTo(656.25)
    assertAspect(canvasW, canvasH)
  })

  // -------------------------------------------------------------------------
  // Sanity: canvas is always ≤ viewport dimensions
  // -------------------------------------------------------------------------
  it.each([
    [1920, 1080],
    [1024, 768],
    [1280, 800],
    [3840, 2160],
    [3440, 1440],
    [2560, 1600],
    [800, 600],
  ])('canvas fits inside viewport for %ix%i', (vpW, vpH) => {
    const { canvasW, canvasH } = computeLetterbox(vpW, vpH)
    expect(canvasW).toBeLessThanOrEqual(vpW + 0.001)
    expect(canvasH).toBeLessThanOrEqual(vpH + 0.001)
  })
})
