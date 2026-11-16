import type {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js'
import type { Deps } from '../deps.ts'

export type Command = {
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody }
  execute(interaction: ChatInputCommandInteraction, deps: Deps): Promise<void>
}
