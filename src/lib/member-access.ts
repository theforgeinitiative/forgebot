// Granting member access in the guild: the member role plus the member's
// display name as nickname. Callers decide whether the contact qualifies
// (see isCurrentMember) before calling applyMemberAccess.
import { RESTJSONErrorCodes } from 'discord.js'
import type { Contact } from './salesforce.ts'

// Discord caps nicknames at 32 characters
const MAX_NICKNAME = 32

// Minimal shapes so tests can pass fakes instead of discord.js objects
export type AccessMember = {
  id: string
  roles: {
    add(roleId: string, reason?: string): Promise<unknown>
    cache: { has(roleId: string): boolean }
  }
  setNickname(nick: string, reason?: string): Promise<unknown>
}

export type AccessGuild = {
  members: { fetch(userId: string): Promise<AccessMember> }
}

export function isUnknownMember(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    err.code === RESTJSONErrorCodes.UnknownMember
  )
}

// The member in the guild, or null if the user isn't in it
export async function fetchGuildMember(
  guild: AccessGuild,
  userId: string,
): Promise<AccessMember | null> {
  try {
    return await guild.members.fetch(userId)
  } catch (err) {
    if (isUnknownMember(err)) return null
    throw err
  }
}

export type MemberRoleCheck = 'member' | 'not-member' | 'lookup-failed'

// Whether the user holds a role (the member role, or e.g. Keyholder) in the
// guild. Used to gate commands; looks at the role, not Salesforce.
export async function checkMemberRole(
  getGuild: () => Promise<AccessGuild>,
  userId: string,
  roleId: string,
): Promise<MemberRoleCheck> {
  try {
    const member = await fetchGuildMember(await getGuild(), userId)
    return member?.roles.cache.has(roleId) ? 'member' : 'not-member'
  } catch (err) {
    console.error(`[member-access] member lookup for ${userId} failed:`, err)
    return 'lookup-failed'
  }
}

// Adds the member role (throws on failure) and sets the nickname (best
// effort: Discord refuses for the server owner or members ranked above the
// bot, which shouldn't block access).
export async function applyMemberAccess(
  member: AccessMember,
  contact: Contact,
  memberRoleId: string,
): Promise<void> {
  await member.roles.add(memberRoleId, 'Linked TFI membership')
  console.log(`[member-access] added member role for ${member.id} (contact ${contact.id})`)

  const nick = contact.displayName?.trim().slice(0, MAX_NICKNAME)
  if (!nick) return
  try {
    await member.setNickname(nick, 'TFI member display name')
  } catch (err) {
    console.warn(`[member-access] failed to set nickname for ${member.id}:`, err)
  }
}
