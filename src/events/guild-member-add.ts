// New guild member: if they've already linked a current membership (e.g.
// rejoining), restore the member role and nickname and greet them; otherwise
// post the welcome message with the Link Membership button.
import type { GuildMember } from 'discord.js'
import type { Deps } from '../deps.ts'
import { applyMemberAccess } from '../lib/member-access.ts'
import { welcomeComponents, welcomeLinkedMember, welcomeNewMember } from '../lib/messages.ts'
import { isCurrentMember, type Contact } from '../lib/salesforce.ts'

export async function handleGuildMemberAdd(member: GuildMember, deps: Deps): Promise<void> {
  if (member.guild.id !== deps.config.guildId) return
  if (member.user.bot) return

  let contact: Contact | null = null
  try {
    contact = await deps.salesforce.getContactByDiscordId(member.id)
  } catch (err) {
    // Fall through to the regular welcome; they can link again
    console.error(`[member-add] contact lookup failed for ${member.id}:`, err)
  }

  let granted = false
  if (contact && isCurrentMember(contact)) {
    try {
      await applyMemberAccess(member, contact, deps.config.memberRoleId)
      granted = true
    } catch (err) {
      console.error(`[member-add] failed to grant access to ${member.id}:`, err)
    }
  }

  const channel = await member.guild.channels.fetch(deps.config.welcomeChannelId)
  if (!channel?.isSendable()) {
    console.error(`[member-add] welcome channel ${deps.config.welcomeChannelId} is not sendable`)
    return
  }

  if (granted) {
    await channel.send(welcomeLinkedMember(member.id))
  } else {
    await channel.send({ content: welcomeNewMember(member.id), components: welcomeComponents() })
  }
  console.log(`[member-add] welcomed ${member.user.tag} (${granted ? 'linked' : 'new'})`)
}
