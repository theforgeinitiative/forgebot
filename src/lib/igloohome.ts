// igloohome client for storage unit PINs. Hourly algoPINs are computed
// offline by the lock, so the API only needs a window and a "variance" (which
// of several PINs for the same window to issue). The variance cycles 1→2→3
// per lock in memory so back-to-back requests get different codes; it resets
// on restart, which is why the bot must run as a single replica.
import { z } from 'zod'
import { formatRfc3339Local } from './time.ts'

const TOKEN_URL = 'https://auth.igloohome.co/oauth2/token'
const DEVICES_URL = 'https://api.igloodeveloper.co/igloohome/devices'
const MAX_HOURLY_VARIANCE = 3
const TIMEOUT_MS = 15_000

export class IgloohomeError extends Error {
  readonly status: number | undefined
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'IgloohomeError'
    this.status = status
  }
}

export type HourlyPin = { pin: string; start: Date; end: Date }

export type IgloohomeClient = {
  generateHourly(lockId: string, accessName: string, hours: number): Promise<HourlyPin>
}

// The API requires minutes and seconds to be zero, so the window starts at
// the top of the current (local) hour.
export function hourlyWindow(now: Date, hours: number): { start: Date; end: Date } {
  const start = new Date(now)
  start.setMinutes(0, 0, 0)
  const end = new Date(start.getTime() + hours * 60 * 60 * 1000)
  return { start, end }
}

export class VarianceCounter {
  private readonly counts = new Map<string, number>()
  private readonly max: number
  constructor(max: number) {
    this.max = max
  }

  next(key: string): number {
    const n = (this.counts.get(key) ?? 0) + 1
    const v = n > this.max ? 1 : n
    this.counts.set(key, v)
    return v
  }
}

const tokenResponse = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
})

const pinResponse = z.object({
  pin: z.coerce.string(),
})

export type IgloohomeOptions = {
  clientId: string
  clientSecret: string
  fetch?: typeof fetch
  now?: () => Date
}

export function createIgloohomeClient(opts: IgloohomeOptions): IgloohomeClient {
  const doFetch = opts.fetch ?? fetch
  const now = opts.now ?? (() => new Date())
  const variance = new VarianceCounter(MAX_HOURLY_VARIANCE)
  let token: { value: string; expiresAt: number } | null = null

  async function accessToken(): Promise<string> {
    if (token && Date.now() < token.expiresAt) return token.value
    const basic = Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString('base64')
    const res = await doFetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      throw new IgloohomeError(`token request failed: ${res.status} ${await res.text()}`, res.status)
    }
    const body = tokenResponse.parse(await res.json())
    // Refresh a minute early; default to 30 min if the server omits expiry
    const ttl = (body.expires_in ?? 1800) - 60
    token = { value: body.access_token, expiresAt: Date.now() + ttl * 1000 }
    return token.value
  }

  return {
    async generateHourly(lockId, accessName, hours) {
      const { start, end } = hourlyWindow(now(), hours)
      const url = `${DEVICES_URL}/${encodeURIComponent(lockId)}/algopin/hourly`
      const res = await doFetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variance: variance.next(lockId),
          startDate: formatRfc3339Local(start),
          endDate: formatRfc3339Local(end),
          accessName,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) {
        if (res.status === 401) token = null
        throw new IgloohomeError(`hourly PIN request failed: ${res.status} ${await res.text()}`, res.status)
      }
      const { pin } = pinResponse.parse(await res.json())
      return { pin, start, end }
    },
  }
}

// 9-digit PINs are easier to key in grouped: "123 456 789"
export function formatPin(pin: string): string {
  return /^\d{9}$/.test(pin) ? pin.replace(/(\d{3})(?=\d)/g, '$1 ') : pin
}
