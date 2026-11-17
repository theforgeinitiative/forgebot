// Shared site logins offered by /password, read from env vars of the form
//
//   SHARED_LOGIN_<KEY>_URL           required
//   SHARED_LOGIN_<KEY>_USERNAME      required
//   SHARED_LOGIN_<KEY>_PASSWORD      required
//   SHARED_LOGIN_<KEY>_TOTP_SECRET   optional, base32
//   SHARED_LOGIN_<KEY>_TOTP_SLACK    optional, seconds the site still accepts an
//                                    expired code; only extends the countdown shown
//   SHARED_LOGIN_<KEY>_NAME          optional, defaults to the key title-cased
//
// Values are secrets: errors name the variable, never its value.
import { z } from 'zod'
import { decodeBase32 } from '../lib/totp.ts'

export type SharedLogin = {
  id: string
  name: string
  url: string
  username: string
  password: string
  totpSecret?: Buffer
  totpSlackSeconds: number
}

const PREFIX = 'SHARED_LOGIN_'
const FIELDS = ['NAME', 'URL', 'USERNAME', 'PASSWORD', 'TOTP_SECRET', 'TOTP_SLACK'] as const
type Field = (typeof FIELDS)[number]

const VAR_PATTERN = new RegExp(`^${PREFIX}([A-Z0-9_]+?)_(${FIELDS.join('|')})$`)

const required = z.string().trim().min(1, 'is required')
const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))

const siteSchema = z.object({
  NAME: optional,
  URL: z.url({ protocol: /^https?$/, error: 'must be an http(s) URL' }),
  USERNAME: required,
  PASSWORD: required,
  TOTP_SECRET: optional,
  TOTP_SLACK: optional,
})

function titleCase(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')
}

export function parseSharedLogins(source: NodeJS.ProcessEnv = process.env): SharedLogin[] {
  const byKey = new Map<string, Partial<Record<Field, string>>>()
  for (const [name, value] of Object.entries(source)) {
    const match = VAR_PATTERN.exec(name)
    if (!match) continue
    const [, key, field] = match as unknown as [string, string, Field]
    const site = byKey.get(key) ?? {}
    site[field] = value
    byKey.set(key, site)
  }

  const problems: string[] = []
  const logins: SharedLogin[] = []
  for (const [key, raw] of byKey) {
    const result = siteSchema.safeParse(raw)
    if (!result.success) {
      for (const issue of result.error.issues) {
        // Generic message only; zod's default can echo the input value
        const field = String(issue.path[0])
        const message = issue.code === 'invalid_type' ? 'is required' : issue.message
        problems.push(`  ${PREFIX}${key}_${field}: ${message}`)
      }
      continue
    }
    const site = result.data
    let totpSecret: Buffer | undefined
    if (site.TOTP_SECRET) {
      try {
        totpSecret = decodeBase32(site.TOTP_SECRET)
      } catch {
        problems.push(`  ${PREFIX}${key}_TOTP_SECRET: must be a base32 secret`)
        continue
      }
    }
    let totpSlackSeconds = 0
    if (site.TOTP_SLACK !== undefined) {
      if (!/^\d+$/.test(site.TOTP_SLACK)) {
        problems.push(`  ${PREFIX}${key}_TOTP_SLACK: must be a whole number of seconds`)
        continue
      }
      if (!totpSecret) {
        problems.push(`  ${PREFIX}${key}_TOTP_SLACK: needs ${PREFIX}${key}_TOTP_SECRET`)
        continue
      }
      totpSlackSeconds = Number(site.TOTP_SLACK)
    }
    logins.push({
      id: key.toLowerCase(),
      name: site.NAME ?? titleCase(key),
      url: site.URL,
      username: site.USERNAME,
      password: site.PASSWORD,
      totpSecret,
      totpSlackSeconds,
    })
  }

  if (problems.length > 0) {
    throw new Error(`[env] invalid shared logins:\n${problems.join('\n')}`)
  }
  return logins.sort((a, b) => a.name.localeCompare(b.name))
}
