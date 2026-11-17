import { describe, expect, it } from 'vitest'
import { parseSharedLogins } from './shared-logins.ts'

describe('parseSharedLogins', () => {
  it('groups SHARED_LOGIN_* vars into sites sorted by name', () => {
    const logins = parseSharedLogins({
      SHARED_LOGIN_TINKERCAD_URL: 'https://www.tinkercad.com',
      SHARED_LOGIN_TINKERCAD_USERNAME: 'cad@example.org',
      SHARED_LOGIN_TINKERCAD_PASSWORD: 'pw1',
      SHARED_LOGIN_BAMBU_NAME: 'Bambu Lab',
      SHARED_LOGIN_BAMBU_URL: 'https://bambulab.com',
      SHARED_LOGIN_BAMBU_USERNAME: 'shop@example.org',
      SHARED_LOGIN_BAMBU_PASSWORD: 'pw2',
      SHARED_LOGIN_BAMBU_TOTP_SECRET: 'gezd gnbv gy3t qojq gezd gnbv gy3t qojq',
      SHARED_LOGIN_BAMBU_TOTP_SLACK: '30',
      SHARED_LOGIN_PRUSA_CONNECT_URL: 'https://connect.prusa3d.com',
      SHARED_LOGIN_PRUSA_CONNECT_USERNAME: 'prusa@example.org',
      SHARED_LOGIN_PRUSA_CONNECT_PASSWORD: 'pw3',
      UNRELATED: 'x',
    })

    expect(logins.map((l) => [l.id, l.name])).toEqual([
      ['bambu', 'Bambu Lab'],
      ['prusa_connect', 'Prusa Connect'],
      ['tinkercad', 'Tinkercad'],
    ])
    expect(logins[0]).toMatchObject({
      url: 'https://bambulab.com',
      username: 'shop@example.org',
      password: 'pw2',
      totpSecret: Buffer.from('12345678901234567890'),
      totpSlackSeconds: 30,
    })
    expect(logins[2]).toMatchObject({ totpSecret: undefined, totpSlackSeconds: 0 })
  })

  it('returns no sites when none are configured', () => {
    expect(parseSharedLogins({ DISCORD_TOKEN: 'x' })).toEqual([])
  })

  it('names every bad variable without echoing secret values', () => {
    let message = ''
    try {
      parseSharedLogins({
        SHARED_LOGIN_A_URL: 'not a url with-secret-in-it',
        SHARED_LOGIN_A_USERNAME: 'user',
        SHARED_LOGIN_B_URL: 'https://b.example.org',
        SHARED_LOGIN_B_USERNAME: 'user',
        SHARED_LOGIN_B_PASSWORD: '   ',
        SHARED_LOGIN_C_URL: 'https://c.example.org',
        SHARED_LOGIN_C_USERNAME: 'user',
        SHARED_LOGIN_C_PASSWORD: 'pw',
        SHARED_LOGIN_C_TOTP_SECRET: 'secret!value',
        SHARED_LOGIN_D_URL: 'https://d.example.org',
        SHARED_LOGIN_D_USERNAME: 'user',
        SHARED_LOGIN_D_PASSWORD: 'pw',
        SHARED_LOGIN_D_TOTP_SECRET: 'GEZDGNBV',
        SHARED_LOGIN_D_TOTP_SLACK: 'thirty',
        SHARED_LOGIN_E_URL: 'https://e.example.org',
        SHARED_LOGIN_E_USERNAME: 'user',
        SHARED_LOGIN_E_PASSWORD: 'pw',
        SHARED_LOGIN_E_TOTP_SLACK: '30',
      })
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain('SHARED_LOGIN_A_URL')
    expect(message).toContain('SHARED_LOGIN_A_PASSWORD: is required')
    expect(message).toContain('SHARED_LOGIN_B_PASSWORD: is required')
    expect(message).toContain('SHARED_LOGIN_C_TOTP_SECRET: must be a base32 secret')
    expect(message).toContain('SHARED_LOGIN_D_TOTP_SLACK: must be a whole number of seconds')
    expect(message).toContain('SHARED_LOGIN_E_TOTP_SLACK: needs SHARED_LOGIN_E_TOTP_SECRET')
    expect(message).not.toContain('with-secret-in-it')
    expect(message).not.toContain('secret!value')
  })

  it('rejects non-http URLs', () => {
    expect(() =>
      parseSharedLogins({
        SHARED_LOGIN_A_URL: 'javascript:alert(1)',
        SHARED_LOGIN_A_USERNAME: 'user',
        SHARED_LOGIN_A_PASSWORD: 'pw',
      }),
    ).toThrow('SHARED_LOGIN_A_URL')
  })
})
