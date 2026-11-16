// Registers slash commands with Discord. Run after changing a command
// definition or the storage lock list:
//
//   npm run deploy-commands            # global (production), from dist/
//   npm run deploy-commands:dev        # DISCORD_GUILD_ID only, instant, from src/
//
// Uses a bulk overwrite, so commands not listed in src/commands are removed
// (this is what retires the Go bot's old commands at cutover).
import { REST, Routes } from 'discord.js'
import { COMMANDS } from './commands/index.ts'
import { discordEnvSchema, parseEnv } from './env.ts'

const env = parseEnv(discordEnvSchema)
const guildOnly = process.argv.includes('--guild')

const rest = new REST().setToken(env.DISCORD_TOKEN)
const body = COMMANDS.map((c) => c.data.toJSON())
const route = guildOnly
  ? Routes.applicationGuildCommands(env.DISCORD_APPLICATION_ID, env.DISCORD_GUILD_ID)
  : Routes.applicationCommands(env.DISCORD_APPLICATION_ID)

const result = (await rest.put(route, { body })) as { name: string }[]
console.log(
  `[deploy-commands] registered ${result.length} ${guildOnly ? `guild (${env.DISCORD_GUILD_ID})` : 'global'} commands: ` +
    result.map((c) => `/${c.name}`).join(', '),
)
