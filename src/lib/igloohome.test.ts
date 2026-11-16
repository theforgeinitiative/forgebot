import { describe, expect, it, vi } from 'vitest'
import {
  createIgloohomeClient,
  formatPin,
  hourlyWindow,
  IgloohomeError,
  VarianceCounter,
} from './igloohome.ts'

describe('hourlyWindow', () => {
  it('starts at the top of the local hour and runs for the given hours', () => {
    const { start, end } = hourlyWindow(new Date('2026-11-16T19:42:13.500Z'), 2)
    expect(start.toISOString()).toBe('2026-11-16T19:00:00.000Z')
    expect(end.toISOString()).toBe('2026-11-16T21:00:00.000Z')
  })
})

describe('VarianceCounter', () => {
  it('cycles 1→2→3→1 per key', () => {
    const v = new VarianceCounter(3)
    expect([v.next('a'), v.next('a'), v.next('a'), v.next('a')]).toEqual([1, 2, 3, 1])
    expect(v.next('b')).toBe(1)
  })
})

describe('formatPin', () => {
  it('groups 9-digit PINs in threes', () => {
    expect(formatPin('123456789')).toBe('123 456 789')
  })
  it('leaves other PINs alone', () => {
    expect(formatPin('12345678')).toBe('12345678')
    expect(formatPin('1234567890')).toBe('1234567890')
  })
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('createIgloohomeClient', () => {
  it('fetches a token, then requests an hourly PIN with Eastern RFC 3339 dates', async () => {
    const fetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      if (String(url).includes('oauth2/token')) {
        return jsonResponse({ access_token: 'tok', expires_in: 3600 })
      }
      return jsonResponse({ pin: '987654321', pinId: 'x' })
    })
    const client = createIgloohomeClient({
      clientId: 'id',
      clientSecret: 'secret',
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => new Date('2026-11-16T19:42:00Z'),
    })

    const first = await client.generateHourly('IGP1', 'Ada Lovelace', 2)
    await client.generateHourly('IGP1', 'Ada Lovelace', 2)

    expect(first.pin).toBe('987654321')
    // token fetched once and reused
    expect(fetch.mock.calls.filter(([u]) => String(u).includes('oauth2/token'))).toHaveLength(1)

    const tokenInit = fetch.mock.calls[0]![1] as RequestInit
    expect((tokenInit.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('id:secret').toString('base64')}`,
    )

    const [url, init] = fetch.mock.calls[1]! as [string, RequestInit]
    expect(url).toBe('https://api.igloodeveloper.co/igloohome/devices/IGP1/algopin/hourly')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body as string)).toEqual({
      variance: 1,
      startDate: '2026-11-16T14:00:00-05:00',
      endDate: '2026-11-16T16:00:00-05:00',
      accessName: 'Ada Lovelace',
    })
    const second = JSON.parse((fetch.mock.calls[2]![1] as RequestInit).body as string)
    expect(second.variance).toBe(2)
  })

  it('throws IgloohomeError on a failed PIN request', async () => {
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('oauth2/token')
        ? jsonResponse({ access_token: 'tok', expires_in: 3600 })
        : new Response('nope', { status: 500 }),
    )
    const client = createIgloohomeClient({
      clientId: 'id',
      clientSecret: 'secret',
      fetch: fetch as unknown as typeof globalThis.fetch,
    })
    await expect(client.generateHourly('IGP1', 'Ada', 2)).rejects.toBeInstanceOf(IgloohomeError)
  })
})
