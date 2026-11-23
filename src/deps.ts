// Everything handlers need besides the Discord objects they're given.
// Built once in src/index.ts; tests construct it with fakes.
import type { MessageCreateOptions } from 'discord.js'
import type { SharedLogin } from './config/shared-logins.ts'
import type { IgloohomeClient } from './lib/igloohome.ts'
import type { AccessGuild } from './lib/member-access.ts'
import type { SalesforceClient } from './lib/salesforce.ts'
import type { SheetLog } from './lib/sheet-log.ts'

export type BotConfig = {
  guildId: string
  memberRoleId: string
  welcomeChannelId: string
  storageCampaignId: string
  storageAdditionalInstructions: string
  sharedLogins: readonly SharedLogin[]
  // /emergency-info; null when it isn't configured
  emergency: { keyholderRoleId: string; logChannelId: string } | null
}

export type Deps = {
  config: BotConfig
  salesforce: SalesforceClient
  igloohome: IgloohomeClient
  sheetLog: SheetLog
  // Posts to a guild channel and returns the message's jump link
  postToChannel(channelId: string, message: MessageCreateOptions): Promise<{ url: string }>
  // The TFI guild, resolved at call time so DM interactions can still grant roles
  getGuild(): Promise<AccessGuild>
}
