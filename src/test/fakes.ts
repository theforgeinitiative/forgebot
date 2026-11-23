// Test doubles for handler tests. Discord interactions are faked with just
// the members the handlers touch, then cast to the discord.js types.
import { vi } from 'vitest'
import type { SharedLogin } from '../config/shared-logins.ts'
import type { Deps } from '../deps.ts'
import type { AccessMember } from '../lib/member-access.ts'
import type { Contact, ContactSummary, EmergencyInfo } from '../lib/salesforce.ts'

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

// RFC 6238's SHA-1 test secret ("12345678901234567890")
export const TEST_TOTP_SECRET = Buffer.from('12345678901234567890')

export const SHARED_LOGINS: readonly SharedLogin[] = [
  {
    id: 'bambu',
    name: 'Bambu Lab',
    url: 'https://bambulab.com',
    username: 'shop@example.org',
    password: 'hunter2',
    totpSecret: TEST_TOTP_SECRET,
    totpSlackSeconds: 0,
  },
  {
    id: 'glowforge',
    name: 'Glowforge',
    url: 'https://app.glowforge.com',
    username: 'laser@example.org',
    password: 'p`ss',
    totpSlackSeconds: 0,
  },
]

export function emergencyInfo(overrides: Partial<EmergencyInfo> = {}): EmergencyInfo {
  return {
    person: {
      id: '003000000000BOB',
      firstName: 'Bobby',
      lastName: 'Tables',
      displayName: 'Bob T.',
      pid: 'P012345',
      birthdate: '2014-03-01',
    },
    emergencyContact: { name: 'Grace Hopper', phone: '919-555-0100', relationship: 'Aunt' },
    allergies: 'Peanuts (EpiPen in backpack)',
    medication: null,
    healthIssues: 'Asthma\nInhaler in the front office',
    dietaryRestrictions: 'Vegetarian;Nut-free',
    otherFoodInfo: null,
    householdAdults: [
      {
        id: '003000000000ALI',
        firstName: 'Alice',
        lastName: 'Tables',
        displayName: 'Alice T.',
        birthdate: '1980-06-15',
        mobilePhone: '919-555-0101',
        homePhone: '919-555-0102',
        preferredPhone: 'Home',
      },
    ],
    ...overrides,
  }
}

export const SEARCH_HITS: ContactSummary[] = [
  { id: '003000000000BOB', firstName: 'Bobby', lastName: 'Tables', displayName: 'Bob T.' },
]

export function fakeMember(id = 'user-1'): AccessMember & {
  roles: { add: ReturnType<typeof vi.fn>; cache: { has: ReturnType<typeof vi.fn> } }
  setNickname: ReturnType<typeof vi.fn>
} {
  return {
    id,
    roles: {
      add: vi.fn(async () => undefined),
      cache: { has: vi.fn((_roleId: string) => false) },
    },
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
      sharedLogins: SHARED_LOGINS,
      emergency: { keyholderRoleId: 'role-keyholder', logChannelId: 'chan-emergency-log' } as Deps['config']['emergency'],
    },
    salesforce: {
      getContactByDiscordId: vi.fn(async () => contact() as Contact | null),
      findContactByIds: vi.fn(async () => contact() as Contact | null),
      setDiscordId: vi.fn(async () => undefined),
      getCampaignStatus: vi.fn(async () => 'Approved' as string | null),
      searchContacts: vi.fn(async (_text: string, _limit: number) => SEARCH_HITS),
      getEmergencyInfo: vi.fn(async (_id: string) => emergencyInfo() as EmergencyInfo | null),
    },
    igloohome: {
      generateHourly: vi.fn(async () => ({
        pin: '123456789',
        start: new Date('2026-11-16T19:00:00Z'),
        end: new Date('2026-11-16T21:00:00Z'),
      })),
    },
    sheetLog: { storageUnlock: vi.fn(async () => undefined) },
    postToChannel: vi.fn(async (_channelId: string, _message: unknown) => ({
      url: 'https://discord.com/channels/guild-1/chan-emergency-log/msg-1',
    })),
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
