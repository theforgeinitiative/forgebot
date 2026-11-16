import { describe, expect, it } from 'vitest'
import { formatKitchen, formatLogTimestamp, formatRfc3339Local } from './time.ts'

describe('time formatting (America/New_York)', () => {
  const afternoonEst = new Date('2026-11-16T19:07:08Z') // 2:07:08 PM EST

  it('formats like Go time.Kitchen', () => {
    expect(formatKitchen(afternoonEst)).toBe('2:07PM')
    expect(formatKitchen(new Date('2026-11-16T05:05:00Z'))).toBe('12:05AM')
    expect(formatKitchen(new Date('2026-11-16T17:00:00Z'))).toBe('12:00PM')
  })

  it('formats the unlock log timestamp like the Go bot', () => {
    expect(formatLogTimestamp(afternoonEst)).toBe('2026-11-16 02:07:08PM')
  })

  it('formats RFC 3339 with the local offset, across DST', () => {
    expect(formatRfc3339Local(afternoonEst)).toBe('2026-11-16T14:07:08-05:00')
    expect(formatRfc3339Local(new Date('2026-07-01T16:30:00Z'))).toBe('2026-07-01T12:30:00-04:00')
  })
})
