// /link-membership: opens the HID/PID modal. The submit is handled in
// src/interactions/link-membership-modal.ts.
import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { linkMembershipModal } from '../lib/messages.ts'
import type { Command } from './types.ts'

export const linkMembership: Command = {
  data: new SlashCommandBuilder()
    .setName('link-membership')
    .setDescription('Link your user to your TFI membership')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),

  async execute(interaction) {
    await interaction.showModal(linkMembershipModal())
  },
}
