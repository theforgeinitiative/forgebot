// Environment parsing. Every setting the bot needs comes from env vars
// (Railway variables in production, .env locally). Parsed once at boot so a
// missing secret fails the deploy instead of the first interaction.
import { z } from 'zod'

const required = z.string().trim().min(1)
const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))

export const discordEnvSchema = z.object({
  DISCORD_TOKEN: required,
  DISCORD_APPLICATION_ID: required,
  DISCORD_GUILD_ID: required,
})

export const envSchema = discordEnvSchema.extend({
  DISCORD_MEMBER_ROLE_ID: required,
  DISCORD_WELCOME_CHANNEL_ID: required,

  SF_LOGIN_URL: z.url().default('https://login.salesforce.com'),
  SF_CLIENT_ID: required,
  SF_CLIENT_SECRET: required,
  SF_STORAGE_CAMPAIGN_ID: required,

  IGLOOHOME_CLIENT_ID: required,
  IGLOOHOME_CLIENT_SECRET: required,

  STORAGE_ADDITIONAL_INSTRUCTIONS: z.string().default(''),
  STORAGE_LOG_SHEET_ID: optional,
  STORAGE_LOG_SHEET_NAME: z.string().trim().min(1).default('Log'),
  GOOGLE_SERVICE_ACCOUNT_JSON: optional,

  // /emergency-info. Optional as a pair: see emergencySettings below.
  DISCORD_KEYHOLDER_ROLE_ID: optional,
  EMERGENCY_LOG_CHANNEL_ID: optional,

  PORT: z.coerce.number().int().positive().default(3000),
})

export type Env = z.infer<typeof envSchema>

export type EmergencySettings = { keyholderRoleId: string; logChannelId: string }

// null when neither variable is set (the command is off); throws when only
// one is, so the command can never run without its audit log channel.
export function emergencySettings(env: Env): EmergencySettings | null {
  const { DISCORD_KEYHOLDER_ROLE_ID: keyholderRoleId, EMERGENCY_LOG_CHANNEL_ID: logChannelId } = env
  if (!keyholderRoleId && !logChannelId) return null
  if (!keyholderRoleId || !logChannelId) {
    const missing = keyholderRoleId ? 'EMERGENCY_LOG_CHANNEL_ID' : 'DISCORD_KEYHOLDER_ROLE_ID'
    throw new Error(
      `[env] invalid environment:\n  ${missing}: required when the other /emergency-info variable is set`,
    )
  }
  return { keyholderRoleId, logChannelId }
}

export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<S> {
  const result = schema.safeParse(source)
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`[env] invalid environment:\n${problems}`)
  }
  return result.data
}
