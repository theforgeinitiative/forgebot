import { linkMembership } from './link-membership.ts'
import { password } from './password.ts'
import type { Command } from './types.ts'
import { unlockStorage } from './unlock-storage.ts'
import { welcome } from './welcome.ts'

export const COMMANDS: readonly Command[] = [linkMembership, welcome, unlockStorage, password]

export const commandsByName = new Map(COMMANDS.map((c) => [c.data.name, c]))
