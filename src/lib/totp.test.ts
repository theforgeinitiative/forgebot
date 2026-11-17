import { describe, expect, it } from 'vitest'
import { decodeBase32, hotp, totp } from './totp.ts'

// RFC 4226 / RFC 6238 SHA-1 test secret
const SECRET = Buffer.from('12345678901234567890')
const SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('decodeBase32', () => {
  it('decodes the RFC test secret', () => {
    expect(decodeBase32(SECRET_BASE32)).toEqual(SECRET)
  })

  it('tolerates spaces, dashes, lowercase and padding', () => {
    expect(decodeBase32('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq')).toEqual(SECRET)
    expect(decodeBase32('MZXW6===')).toEqual(Buffer.from('foo'))
  })

  it('rejects invalid input', () => {
    expect(() => decodeBase32('not base32!')).toThrow()
    expect(() => decodeBase32('ABC1')).toThrow()
    expect(() => decodeBase32('   ')).toThrow()
  })
})

describe('hotp', () => {
  it('matches the RFC 4226 vectors', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314']
    expected.forEach((code, counter) => expect(hotp(SECRET, counter)).toBe(code))
  })
})

describe('totp', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('matches the RFC 6238 SHA-1 vector at t=%i', (seconds, code) => {
    expect(totp(SECRET, seconds * 1000, { digits: 8 }).code).toBe(code)
  })

  it('defaults to 6 digits and reports the end of the 30s window', () => {
    const { code, expiresAt } = totp(SECRET, 59_000)
    expect(code).toBe('287082')
    expect(expiresAt.getTime()).toBe(60_000)
    expect(totp(SECRET, 60_000).expiresAt.getTime()).toBe(90_000)
  })
})
