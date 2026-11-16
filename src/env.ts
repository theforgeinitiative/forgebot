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

  PORT: z.coerce.number().int().positive().default(3000),
})

export type Env = z.infer<typeof envSchema>

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
