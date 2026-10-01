import { describe, it, expect } from 'vitest'
import { validateEmbedUrl, isSafeEmbedNavigation } from '../url'

describe('url validation', () => {
  it('normalizes youtube URLs to embed format', () => {
    const cases = [
      ['https://youtube.com/watch?v=12345678901', 'https://www.youtube.com/embed/12345678901?autoplay=1&rel=0'],
      ['https://youtu.be/12345678901', 'https://www.youtube.com/embed/12345678901?autoplay=1&rel=0'],
      ['https://www.youtube.com/shorts/12345678901', 'https://www.youtube.com/embed/12345678901?autoplay=1&rel=0']
    ]

    for (const [input, expected] of cases) {
      const res = validateEmbedUrl(input)
      expect(res.valid).toBe(true)
      if (res.valid) {
        expect(res.normalized).toBe(expected)
      }
    }
  })

  it('rejects non-http protocols', () => {
    const res = validateEmbedUrl('file:///etc/passwd')
    expect(res.valid).toBe(false)
  })

  it('isSafeEmbedNavigation allows http and https', () => {
    expect(isSafeEmbedNavigation('https://google.com')).toBe(true)
    expect(isSafeEmbedNavigation('http://google.com')).toBe(true)
    expect(isSafeEmbedNavigation('file:///C:/test.txt')).toBe(false)
    expect(isSafeEmbedNavigation('javascript:alert(1)')).toBe(false)
  })
})
