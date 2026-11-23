import { describe, expect, it } from 'vitest'
import { emergencySettings, envSchema, parseEnv } from './env.ts'

const BASE = {
  DISCORD_TOKEN: 't',
  DISCORD_APPLICATION_ID: 'a',
  DISCORD_GUILD_ID: 'g',
  DISCORD_MEMBER_ROLE_ID: 'r',
  DISCORD_WELCOME_CHANNEL_ID: 'w',
  SF_CLIENT_ID: 'c',
  SF_CLIENT_SECRET: 's',
  SF_STORAGE_CAMPAIGN_ID: 'x',
  IGLOOHOME_CLIENT_ID: 'i',
  IGLOOHOME_CLIENT_SECRET: 'j',
}

describe('emergencySettings', () => {
  it('is null when neither variable is set', () => {
    expect(emergencySettings(parseEnv(envSchema, BASE))).toBeNull()
  })

  it('returns the role and log channel', () => {
    const env = parseEnv(envSchema, { ...BASE, DISCORD_KEYHOLDER_ROLE_ID: 'kh', EMERGENCY_LOG_CHANNEL_ID: 'log' })
    expect(emergencySettings(env)).toEqual({ keyholderRoleId: 'kh', logChannelId: 'log' })
  })

  it('refuses to run without the log channel', () => {
    const env = parseEnv(envSchema, { ...BASE, DISCORD_KEYHOLDER_ROLE_ID: 'kh' })
    expect(() => emergencySettings(env)).toThrow(/EMERGENCY_LOG_CHANNEL_ID: required/)
  })
})
