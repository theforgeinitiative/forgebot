// Submit handler for the HID/PID modal. Saves the Discord ID on the matching
// Salesforce Contact, then grants the member role and nickname — but only for
// current members (a change from the Go bot, which granted access to any
// linked contact).
import { MessageFlags, type ModalSubmitInteraction } from 'discord.js'
import type { Deps } from '../deps.ts'
import { applyMemberAccess, fetchGuildMember } from '../lib/member-access.ts'
import {
  CUSTOM_IDS,
  LINK,
  memberAppComponents,
  recoveryComponents,
} from '../lib/messages.ts'
import { isCurrentMember } from '../lib/salesforce.ts'

const ephemeral = MessageFlags.Ephemeral

export async function handleLinkMembershipModal(
  interaction: ModalSubmitInteraction,
  deps: Deps,
): Promise<void> {
  await interaction.reply({ content: LINK.verifying, flags: ephemeral })

  const userId = interaction.user.id
  const hid = interaction.fields.getTextInputValue(CUSTOM_IDS.hid).trim().toUpperCase()
  const pid = interaction.fields.getTextInputValue(CUSTOM_IDS.pid).trim().toUpperCase()

  const contact = await deps.salesforce.findContactByIds(hid, pid)
  if (!contact) {
    console.log(`[link] no contact for ${hid}/${pid} (user ${userId})`)
    await interaction.followUp({
      content: LINK.notFound,
      components: recoveryComponents(),
      flags: ephemeral,
    })
    return
  }

  try {
    await deps.salesforce.setDiscordId(contact.id, userId)
  } catch (err) {
    console.error(`[link] failed to save Discord ID on contact ${contact.id}:`, err)
    await interaction.followUp({ content: LINK.saveFailed, flags: ephemeral })
    return
  }
  console.log(`[link] linked user ${userId} to contact ${contact.id}`)

  if (!isCurrentMember(contact)) {
    await interaction.followUp({
      content: LINK.notCurrent,
      components: memberAppComponents(),
      flags: ephemeral,
    })
    return
  }

  try {
    const member = await fetchGuildMember(await deps.getGuild(), userId)
    if (member) {
      await applyMemberAccess(member, contact, deps.config.memberRoleId)
    } else {
      console.log(`[link] user ${userId} is not in the guild; skipping role`)
    }
  } catch (err) {
    console.error(`[link] failed to grant access to ${userId}:`, err)
    await interaction.followUp({ content: LINK.roleFailed, flags: ephemeral })
    return
  }

  await interaction.followUp({ content: LINK.success, flags: ephemeral })
}
