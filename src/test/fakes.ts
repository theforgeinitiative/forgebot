// Test doubles for handler tests. Discord interactions are faked with just
// the members the handlers touch, then cast to the discord.js types.
import { vi } from 'vitest'
import type { Deps } from '../deps.ts'
import type { AccessMember } from '../lib/member-access.ts'
import type { Contact } from '../lib/salesforce.ts'

export function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: '003AAA',
    accountId: '001AAA',
    firstName: 'Ada',
    lastName: 'Lovelace',
    displayName: 'Ada L.',
    email: 'ada@example.org',
    membershipStatus: 'Current',
    ...overrides,
  }
}

export function fakeMember(id = 'user-1'): AccessMember & {
  roles: { add: ReturnType<typeof vi.fn> }
  setNickname: ReturnType<typeof vi.fn>
} {
  return {
    id,
    roles: { add: vi.fn(async () => undefined) },
    setNickname: vi.fn(async () => undefined),
  }
}

export function fakeDeps(overrides: Partial<Deps> = {}) {
  const member = fakeMember()
  const deps = {
    config: {
      guildId: 'guild-1',
      memberRoleId: 'role-member',
      welcomeChannelId: 'chan-welcome',
      storageCampaignId: '701STORAGE',
      storageAdditionalInstructions: 'Gate code is on the sign.',
    },
    salesforce: {
      getContactByDiscordId: vi.fn(async () => contact() as Contact | null),
      findContactByIds: vi.fn(async () => contact() as Contact | null),
      setDiscordId: vi.fn(async () => undefined),
      getCampaignStatus: vi.fn(async () => 'Approved' as string | null),
    },
    igloohome: {
      generateHourly: vi.fn(async () => ({
        pin: '123456789',
        start: new Date('2026-11-16T19:00:00Z'),
        end: new Date('2026-11-16T21:00:00Z'),
      })),
    },
    sheetLog: { storageUnlock: vi.fn(async () => undefined) },
    getGuild: vi.fn(async () => ({ members: { fetch: vi.fn(async (_id: string) => member) } })),
  }
  // Assign after building so the fields keep their Mock types
  Object.assign(deps, overrides)
  const typed: Deps = deps
  void typed // compile-time check that the fake satisfies Deps
  return { deps, member }
}

type ReplyArg = string | { content?: string; components?: unknown[] }

// Records replies so tests can assert on content in order
export function fakeReplies() {
  return {
    reply: vi.fn(async (_arg: ReplyArg) => undefined),
    followUp: vi.fn(async (_arg: ReplyArg) => undefined),
    editReply: vi.fn(async (_arg: ReplyArg) => undefined),
    showModal: vi.fn(async (_modal: unknown) => undefined),
  }
}

export function contentOf(fn: ReturnType<typeof vi.fn>, call = 0): string | undefined {
  const arg = fn.mock.calls[call]?.[0] as { content?: string } | string | undefined
  return typeof arg === 'string' ? arg : arg?.content
}
