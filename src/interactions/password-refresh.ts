// "New 2FA code" button on a /password reply. Re-checks access, then edits
// the same ephemeral message in place with a fresh code.
import type { ButtonInteraction } from 'discord.js'
import { passwordAccess } from '../commands/password.ts'
import type { Deps } from '../deps.ts'
import { CUSTOM_IDS, passwordReply } from '../lib/messages.ts'

export async function handlePasswordRefresh(
  interaction: ButtonInteraction,
  deps: Deps,
): Promise<void> {
  await interaction.deferUpdate()
  const siteId = interaction.customId.slice(CUSTOM_IDS.passwordRefreshPrefix.length)
  const access = await passwordAccess(interaction.user, siteId, deps)
  if (!access.ok) {
    // Replace the old credentials too, not just the code
    await interaction.editReply({ content: access.content, components: [] })
    return
  }
  console.log(`[password] ${interaction.user.tag} (${interaction.user.id}) refreshed ${access.login.id}`)
  await interaction.editReply(passwordReply(access.login))
}
