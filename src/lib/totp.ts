// RFC 6238 TOTP (HMAC-SHA1, 30-second step, 6 digits), the variant every
// authenticator app uses by default. Secrets are the base32 strings sites
// show under "can't scan the QR code?".
import { createHmac } from 'node:crypto'

const STEP_SECONDS = 30
const DIGITS = 6
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

// Decodes a base32 secret, tolerating spaces, dashes, lowercase and padding.
// Throws on anything else so a mistyped secret fails at startup.
export function decodeBase32(secret: string): Buffer {
  const clean = secret.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase()
  if (!clean) throw new Error('secret is empty')

  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char)
    if (value === -1) throw new Error('secret is not valid base32')
    buffer = (buffer << 5) | value
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  return Buffer.from(bytes)
}

export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', secret).update(message).digest()
  const offset = hmac[hmac.length - 1]! & 0x0f
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff
  return String(binary % 10 ** digits).padStart(digits, '0')
}

export function totp(
  secret: Buffer,
  now: number = Date.now(),
  { digits = DIGITS }: { digits?: number } = {},
): { code: string; expiresAt: Date } {
  const counter = Math.floor(now / 1000 / STEP_SECONDS)
  return {
    code: hotp(secret, counter, digits),
    expiresAt: new Date((counter + 1) * STEP_SECONDS * 1000),
  }
}
