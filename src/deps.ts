// Everything handlers need besides the Discord objects they're given.
// Built once in src/index.ts; tests construct it with fakes.
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
}

export type Deps = {
  config: BotConfig
  salesforce: SalesforceClient
  igloohome: IgloohomeClient
  sheetLog: SheetLog
  // The TFI guild, resolved at call time so DM interactions can still grant roles
  getGuild(): Promise<AccessGuild>
}
