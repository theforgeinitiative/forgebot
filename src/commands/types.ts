import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js'
import type { Deps } from '../deps.ts'

export type Command = {
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody }
  execute(interaction: ChatInputCommandInteraction, deps: Deps): Promise<void>
  // Only for commands with an option marked setAutocomplete(true)
  autocomplete?(interaction: AutocompleteInteraction, deps: Deps): Promise<void>
}
