// /unlock-storage: issues a temporary igloohome PIN for a storage unit to a
// linked, current member who is Approved on the storage Salesforce campaign.
// The PIN goes by DM; every issued code is appended to the unlock log sheet.
import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js'
import { findLock, STORAGE_LOCKS } from '../config/storage-locks.ts'
import { formatPin } from '../lib/igloohome.ts'
import { checkDmComponents, STORAGE, storageDm } from '../lib/messages.ts'
import { fullName, isCurrentMember } from '../lib/salesforce.ts'
import { formatKitchen } from '../lib/time.ts'
import type { Command } from './types.ts'

const PIN_VALID_HOURS = 2
const ephemeral = MessageFlags.Ephemeral

export const unlockStorage: Command = {
  data: new SlashCommandBuilder()
    .setName('unlock-storage')
    .setDescription('Generates a temporary code for a TFI storage unit')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .addStringOption((o) =>
      o
        .setName('unit')
        .setDescription('Which storage unit needs to be unlocked?')
        .setRequired(true)
        .addChoices(...STORAGE_LOCKS.map((l) => ({ name: l.label, value: l.id }))),
    ),

  async execute(interaction, deps) {
    await interaction.reply({ content: STORAGE.generating, flags: ephemeral })
    const userId = interaction.user.id

    let contact
    try {
      contact = await deps.salesforce.getContactByDiscordId(userId)
    } catch (err) {
      console.error('[unlock-storage] contact lookup failed:', err)
      await interaction.followUp({ content: STORAGE.failed, flags: ephemeral })
      return
    }
    if (!contact) {
      await interaction.followUp({ content: STORAGE.notLinked, flags: ephemeral })
      return
    }

    const name = fullName(contact)
    if (!isCurrentMember(contact)) {
      console.log(`[unlock-storage] ${name} (${contact.id}) is not a current member`)
      await interaction.followUp({ content: STORAGE.notCurrent, flags: ephemeral })
      return
    }

    let status
    try {
      status = await deps.salesforce.getCampaignStatus(contact.id, deps.config.storageCampaignId)
    } catch (err) {
      console.error('[unlock-storage] campaign status lookup failed:', err)
      await interaction.followUp({ content: STORAGE.failed, flags: ephemeral })
      return
    }
    if (!status) {
      console.log(`[unlock-storage] ${name} (${contact.id}) is not on the storage campaign`)
      await interaction.followUp({ content: STORAGE.notApproved, flags: ephemeral })
      return
    }
    if (status !== 'Approved') {
      console.log(`[unlock-storage] ${name} (${contact.id}) storage status is ${status}`)
      await interaction.followUp({ content: STORAGE.awaitingApproval, flags: ephemeral })
      return
    }

    const lockId = interaction.options.getString('unit', true)
    const unit = findLock(lockId)?.unit ?? lockId

    let pin
    try {
      pin = await deps.igloohome.generateHourly(lockId, name, PIN_VALID_HOURS)
    } catch (err) {
      console.error(`[unlock-storage] PIN generation failed for lock ${lockId}:`, err)
      await interaction.followUp({ content: STORAGE.failed, flags: ephemeral })
      return
    }
    console.log(`[unlock-storage] ${name} (${contact.id}) generated a code for unit ${unit}`)

    try {
      await deps.sheetLog.storageUnlock(contact, unit)
    } catch (err) {
      console.error('[unlock-storage] unlock log append failed:', err)
    }

    let dm
    try {
      dm = await interaction.user.send(
        storageDm({
          pin: formatPin(pin.pin),
          unit,
          validUntil: formatKitchen(pin.end),
          additionalInstructions: deps.config.storageAdditionalInstructions,
        }),
      )
    } catch (err) {
      console.error(`[unlock-storage] DM to ${userId} failed:`, err)
      await interaction.editReply({ content: STORAGE.dmFailed })
      return
    }

    await interaction.editReply({ content: STORAGE.done, components: checkDmComponents(dm.channelId) })
  },
}
