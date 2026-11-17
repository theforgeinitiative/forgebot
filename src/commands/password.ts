// /password: shows a shared site login (and its current 2FA code, if any) to
// anyone holding the member role. Sites come from SHARED_LOGIN_* env vars
// (see src/config/shared-logins.ts), so the site option uses autocomplete
// rather than fixed choices: adding a site needs no deploy-commands run.
import { InteractionContextType, MessageFlags, SlashCommandBuilder, type User } from 'discord.js'
import type { SharedLogin } from '../config/shared-logins.ts'
import type { Deps } from '../deps.ts'
import { fetchGuildMember } from '../lib/member-access.ts'
import { PASSWORD, passwordReply } from '../lib/messages.ts'
import type { Command } from './types.ts'

// Discord's limit on autocomplete suggestions
const MAX_SUGGESTIONS = 25

type Access = { ok: true; login: SharedLogin } | { ok: false; content: string }

// Resolves the site and checks the member role. Shared by the command and
// the "New 2FA code" button, so a refresh is re-authorized every time.
export async function passwordAccess(user: User, siteId: string, deps: Deps): Promise<Access> {
  if (deps.config.sharedLogins.length === 0) return { ok: false, content: PASSWORD.noneConfigured }
  const login = deps.config.sharedLogins.find((l) => l.id === siteId)
  if (!login) return { ok: false, content: PASSWORD.unknownSite }

  let member
  try {
    member = await fetchGuildMember(await deps.getGuild(), user.id)
  } catch (err) {
    console.error(`[password] member lookup for ${user.id} failed:`, err)
    return { ok: false, content: PASSWORD.failed }
  }
  if (!member?.roles.cache.has(deps.config.memberRoleId)) {
    console.log(`[password] ${user.tag} (${user.id}) refused ${login.id}: no member role`)
    return { ok: false, content: PASSWORD.notMember }
  }
  return { ok: true, login }
}

export const password: Command = {
  data: new SlashCommandBuilder()
    .setName('password')
    .setDescription('Shows the login for a shared TFI account')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .addStringOption((o) =>
      o
        .setName('site')
        .setDescription('Which site do you need to log in to?')
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction, deps) {
    const query = interaction.options.getFocused().trim().toLowerCase()
    const matches = deps.config.sharedLogins.filter(
      (l) => l.id.includes(query) || l.name.toLowerCase().includes(query),
    )
    await interaction.respond(
      matches.slice(0, MAX_SUGGESTIONS).map((l) => ({ name: l.name, value: l.id })),
    )
  },

  async execute(interaction, deps) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })
    const access = await passwordAccess(
      interaction.user,
      interaction.options.getString('site', true),
      deps,
    )
    if (!access.ok) {
      await interaction.editReply({ content: access.content })
      return
    }
    console.log(`[password] ${interaction.user.tag} (${interaction.user.id}) viewed ${access.login.id}`)
    await interaction.editReply(passwordReply(access.login))
  },
}
