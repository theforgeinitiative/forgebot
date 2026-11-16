import { describe, expect, it, vi } from 'vitest'
import { contact, fakeMember } from '../test/fakes.ts'
import { applyMemberAccess, fetchGuildMember } from './member-access.ts'

describe('fetchGuildMember', () => {
  it('returns null for Unknown Member (10007)', async () => {
    const guild = { members: { fetch: vi.fn(async () => Promise.reject({ code: 10007 })) } }
    expect(await fetchGuildMember(guild, 'u')).toBeNull()
  })

  it('rethrows other errors', async () => {
    const guild = { members: { fetch: vi.fn(async () => Promise.reject({ code: 50013 })) } }
    await expect(fetchGuildMember(guild, 'u')).rejects.toEqual({ code: 50013 })
  })
})

describe('applyMemberAccess', () => {
  it('adds the role and sets a nickname truncated to 32 chars', async () => {
    const member = fakeMember()
    await applyMemberAccess(member, contact({ displayName: 'x'.repeat(40) }), 'role-1')
    expect(member.roles.add).toHaveBeenCalledWith('role-1', expect.any(String))
    expect(member.setNickname).toHaveBeenCalledWith('x'.repeat(32), expect.any(String))
  })

  it('skips the nickname when there is no display name', async () => {
    const member = fakeMember()
    await applyMemberAccess(member, contact({ displayName: null }), 'role-1')
    expect(member.setNickname).not.toHaveBeenCalled()
  })

  it('does not fail when the nickname cannot be set', async () => {
    const member = fakeMember()
    member.setNickname.mockRejectedValueOnce(new Error('Missing Permissions'))
    await expect(applyMemberAccess(member, contact(), 'role-1')).resolves.toBeUndefined()
  })

  it('throws when the role cannot be added', async () => {
    const member = fakeMember()
    member.roles.add.mockRejectedValueOnce(new Error('Missing Permissions'))
    await expect(applyMemberAccess(member, contact(), 'role-1')).rejects.toThrow()
  })
})
