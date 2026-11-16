// Entry point: parse env, build clients, connect to the Discord gateway.
// Runs as a single always-on Railway service (see README).

// Times in DMs and igloohome PIN windows are Eastern; set before any Date use.
process.env.TZ ??= 'America/New_York'

import { Client, Events, GatewayIntentBits, PermissionFlagsBits } from 'discord.js'
import type { Deps } from './deps.ts'
import { envSchema, parseEnv } from './env.ts'
import { handleGuildMemberAdd } from './events/guild-member-add.ts'
import { handleInteraction } from './events/interaction-create.ts'
import { startHealthServer } from './health.ts'
import { createIgloohomeClient } from './lib/igloohome.ts'
import { connectionFactory, createSalesforceClient } from './lib/salesforce.ts'
import { setupProblems } from './lib/setup-check.ts'
import { createSheetLog } from './lib/sheet-log.ts'

const env = parseEnv(envSchema)

const client = new Client({
  // GuildMembers is privileged; it must be enabled for the application in the
  // Developer Portal or login fails.
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
})

const deps: Deps = {
  config: {
    guildId: env.DISCORD_GUILD_ID,
    memberRoleId: env.DISCORD_MEMBER_ROLE_ID,
    welcomeChannelId: env.DISCORD_WELCOME_CHANNEL_ID,
    storageCampaignId: env.SF_STORAGE_CAMPAIGN_ID,
    storageAdditionalInstructions: env.STORAGE_ADDITIONAL_INSTRUCTIONS,
  },
  salesforce: createSalesforceClient(
    connectionFactory({
      loginUrl: env.SF_LOGIN_URL,
      clientId: env.SF_CLIENT_ID,
      clientSecret: env.SF_CLIENT_SECRET,
    }),
  ),
  igloohome: createIgloohomeClient({
    clientId: env.IGLOOHOME_CLIENT_ID,
    clientSecret: env.IGLOOHOME_CLIENT_SECRET,
  }),
  sheetLog: createSheetLog({
    sheetId: env.STORAGE_LOG_SHEET_ID,
    sheetName: env.STORAGE_LOG_SHEET_NAME,
    serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON,
  }),
  getGuild: () => client.guilds.fetch(env.DISCORD_GUILD_ID),
}

client.once(Events.ClientReady, (c) => {
  console.log(`[bot] ready as ${c.user.tag} (TZ=${process.env.TZ})`)
  const guild = c.guilds.cache.get(env.DISCORD_GUILD_ID)
  const me = guild?.members.me
  if (!guild || !me) {
    console.error(`[bot] not a member of guild ${env.DISCORD_GUILD_ID}; check DISCORD_GUILD_ID`)
    return
  }
  const role = guild.roles.cache.get(env.DISCORD_MEMBER_ROLE_ID)
  const welcome = guild.channels.cache.get(env.DISCORD_WELCOME_CHANNEL_ID)
  const problems = setupProblems({
    canManageRoles: me.permissions.has(PermissionFlagsBits.ManageRoles),
    canManageNicknames: me.permissions.has(PermissionFlagsBits.ManageNicknames),
    memberRole: role
      ? {
          name: role.name,
          managed: role.managed,
          belowBotTopRole: me.roles.highest.comparePositionTo(role) > 0,
        }
      : null,
    welcomeChannelSendable:
      welcome?.permissionsFor(me)?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ]) ?? false,
  })
  for (const p of problems) console.error(`[bot] setup problem in "${guild.name}": ${p}`)
})

client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction, deps)
})

client.on(Events.GuildMemberAdd, (member) => {
  handleGuildMemberAdd(member, deps).catch((err) =>
    console.error(`[member-add] failed for ${member.id}:`, err),
  )
})

client.on(Events.Error, (err) => console.error('[bot] client error:', err))

const health = startHealthServer(env.PORT, () => client.isReady())

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[bot] ${signal} received, shutting down`)
  health.close()
  await client.destroy()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

await client.login(env.DISCORD_TOKEN)
