// /welcome: posts the public welcome message with the Link Membership button,
// e.g. to pin in a channel.
import { InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { WELCOME_SLASH, welcomeComponents } from '../lib/messages.ts'
import type { Command } from './types.ts'

export const welcome: Command = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Show welcome message with information about linking membership')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    await interaction.reply({ content: WELCOME_SLASH, components: welcomeComponents() })
  },
}
