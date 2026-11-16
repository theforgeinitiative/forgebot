// Routes interactions to their handlers by command name or custom ID, and
// turns any unhandled error into an ephemeral apology instead of Discord's
// "The application did not respond".
import { MessageFlags, type Interaction, type RepliableInteraction } from 'discord.js'
import { commandsByName } from '../commands/index.ts'
import type { Deps } from '../deps.ts'
import { handleLinkMembershipModal } from '../interactions/link-membership-modal.ts'
import { CUSTOM_IDS, GENERIC_ERROR, linkMembershipModal } from '../lib/messages.ts'

export async function handleInteraction(interaction: Interaction, deps: Deps): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commandsByName.get(interaction.commandName)
      if (!command) {
        console.warn(`[interaction] unknown command /${interaction.commandName}`)
        return
      }
      await command.execute(interaction, deps)
    } else if (interaction.isButton()) {
      if (interaction.customId === CUSTOM_IDS.showLinkForm) {
        await interaction.showModal(linkMembershipModal())
      } else {
        // e.g. the retired storage_request_access button on old messages
        console.warn(`[interaction] unknown button ${interaction.customId}`)
      }
    } else if (interaction.isModalSubmit()) {
      if (interaction.customId === CUSTOM_IDS.linkMembershipForm) {
        await handleLinkMembershipModal(interaction, deps)
      } else {
        console.warn(`[interaction] unknown modal ${interaction.customId}`)
      }
    }
  } catch (err) {
    console.error(`[interaction] ${describe(interaction)} failed:`, err)
    if (interaction.isRepliable()) await apologize(interaction)
  }
}

function describe(interaction: Interaction): string {
  if (interaction.isChatInputCommand()) return `/${interaction.commandName}`
  if (interaction.isButton() || interaction.isModalSubmit()) return interaction.customId
  return `interaction ${interaction.type}`
}

async function apologize(interaction: RepliableInteraction): Promise<void> {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: GENERIC_ERROR, flags: MessageFlags.Ephemeral })
    } else {
      await interaction.reply({ content: GENERIC_ERROR, flags: MessageFlags.Ephemeral })
    }
  } catch (err) {
    console.error('[interaction] failed to send error reply:', err)
  }
}
