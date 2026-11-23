// /emergency-info: break-glass lookup of a member's or guest's emergency
// contact, allergies, medical info and the other adults in their household.
// Keyholders only, checked on every autocomplete and run so names never leak
// to anyone else. Each lookup is posted to the emergency log channel before
// anything is revealed; the details themselves go by DM.
import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js'
import type { Deps } from '../deps.ts'
import { checkMemberRole } from '../lib/member-access.ts'
import {
  checkDmComponents,
  EMERGENCY,
  emergencyAuditLog,
  emergencyInfoMessages,
  personLabel,
} from '../lib/messages.ts'
import { isContactId, type ContactSummary } from '../lib/salesforce.ts'
import type { Command } from './types.ts'

// Discord's limits on autocomplete suggestions and their labels
const MAX_SUGGESTIONS = 25
const MAX_CHOICE_LENGTH = 100
// Shorter searches match too many people to be useful
const MIN_QUERY = 2
// Names listed when typed text matches several people
const MAX_AMBIGUOUS = 10

const ephemeral = MessageFlags.Ephemeral
const noMentions = { parse: [] as [] }

type Resolved = { kind: 'found'; id: string } | { kind: 'none' } | { kind: 'ambiguous'; names: string[] }

// The option's value is a Contact Id when picked from the list, or whatever
// was typed if the member submitted without picking (e.g. autocomplete
// timed out). Typed text resolves only when it names one person.
async function resolvePerson(input: string, deps: Deps): Promise<Resolved> {
  if (isContactId(input)) return { kind: 'found', id: input }
  const hits = await deps.salesforce.searchContacts(input, MAX_AMBIGUOUS)
  if (hits.length === 1) return { kind: 'found', id: hits[0]!.id }
  const lower = input.toLowerCase()
  const exact = hits.filter((h) => namesOf(h).includes(lower))
  if (exact.length === 1) return { kind: 'found', id: exact[0]!.id }
  if (hits.length === 0) return { kind: 'none' }
  return { kind: 'ambiguous', names: hits.map(personLabel) }
}

function namesOf(c: ContactSummary): string[] {
  const full = [c.firstName, c.lastName].filter(Boolean).join(' ')
  return [c.displayName ?? '', full].map((n) => n.trim().toLowerCase()).filter(Boolean)
}

export const emergencyInfo: Command = {
  data: new SlashCommandBuilder()
    .setName('emergency-info')
    .setDescription("Keyholders only: shows a member's or guest's emergency contact and medical info")
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .addStringOption((o) =>
      o
        .setName('person')
        .setDescription('Who needs help? Start typing their name.')
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction, deps) {
    const emergency = deps.config.emergency
    const query = interaction.options.getFocused().trim()
    if (!emergency || query.length < MIN_QUERY) {
      await interaction.respond([])
      return
    }
    const role = await checkMemberRole(deps.getGuild, interaction.user.id, emergency.keyholderRoleId)
    if (role !== 'member') {
      await interaction.respond([])
      return
    }
    let hits
    try {
      hits = await deps.salesforce.searchContacts(query, MAX_SUGGESTIONS)
    } catch (err) {
      console.error('[emergency-info] autocomplete search failed:', err)
      await interaction.respond([])
      return
    }
    await interaction.respond(
      hits.map((h) => ({ name: personLabel(h).slice(0, MAX_CHOICE_LENGTH), value: h.id })),
    )
  },

  async execute(interaction, deps) {
    await interaction.deferReply({ flags: ephemeral })
    const emergency = deps.config.emergency
    if (!emergency) {
      await interaction.editReply({ content: EMERGENCY.notConfigured })
      return
    }
    const user = interaction.user

    const role = await checkMemberRole(deps.getGuild, user.id, emergency.keyholderRoleId)
    if (role === 'lookup-failed') {
      await interaction.editReply({ content: EMERGENCY.roleCheckFailed })
      return
    }
    if (role === 'not-member') {
      console.log(`[emergency-info] ${user.tag} (${user.id}) refused: no keyholder role`)
      await interaction.editReply({ content: EMERGENCY.notKeyholder })
      return
    }

    const input = interaction.options.getString('person', true).trim()

    let info
    try {
      const resolved = await resolvePerson(input, deps)
      if (resolved.kind === 'none') {
        await interaction.editReply({ content: EMERGENCY.notFound })
        return
      }
      if (resolved.kind === 'ambiguous') {
        await interaction.editReply({ content: EMERGENCY.ambiguous(resolved.names), allowedMentions: noMentions })
        return
      }
      info = await deps.salesforce.getEmergencyInfo(resolved.id)
    } catch (err) {
      console.error('[emergency-info] Salesforce lookup failed:', err)
      await interaction.editReply({ content: EMERGENCY.lookupFailed })
      return
    }
    if (!info) {
      await interaction.editReply({ content: EMERGENCY.notFound })
      return
    }

    // Log before revealing anything. If the post fails, still show the info:
    // in an emergency it matters more, and the console line below is the
    // fallback record.
    console.log(`[emergency-info] ${user.tag} (${user.id}) viewed ${info.person.id}`)
    try {
      await deps.postToChannel(
        emergency.logChannelId,
        emergencyAuditLog({
          userId: user.id,
          person: info.person,
        }),
      )
    } catch (err) {
      console.error(`[emergency-info] audit log post failed for ${user.id} viewing ${info.person.id}:`, err)
    }

    const messages = emergencyInfoMessages(info)
    try {
      let dmChannelId = ''
      for (const content of messages) {
        dmChannelId = (await user.send({ content, allowedMentions: noMentions })).channelId
      }
      await interaction.editReply({ content: EMERGENCY.sent, components: checkDmComponents(dmChannelId) })
    } catch (err) {
      console.error(`[emergency-info] DM to ${user.id} failed:`, err)
      await interaction.editReply({ content: EMERGENCY.dmFailed })
      for (const content of messages) {
        await interaction.followUp({ content, flags: ephemeral, allowedMentions: noMentions })
      }
    }
  },
}
