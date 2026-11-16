import type { GuildMember } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { contact, fakeDeps, fakeMember } from '../test/fakes.ts'
import { handleGuildMemberAdd } from './guild-member-add.ts'

function joined(guildId = 'guild-1') {
  const send = vi.fn(async () => undefined)
  const channel = { isSendable: () => true, send }
  const member = Object.assign(fakeMember('user-1'), {
    user: { bot: false, tag: 'ada' },
    guild: { id: guildId, channels: { fetch: vi.fn(async () => channel) } },
  })
  return { member, asGuildMember: member as unknown as GuildMember, send }
}

const sentContent = (send: ReturnType<typeof vi.fn>) => {
  const arg = send.mock.calls[0]![0] as string | { content: string }
  return typeof arg === 'string' ? arg : arg.content
}

describe('guild member add', () => {
  it('restores access and greets a linked current member', async () => {
    const { deps } = fakeDeps()
    const { member, asGuildMember, send } = joined()
    await handleGuildMemberAdd(asGuildMember, deps)
    expect(member.roles.add).toHaveBeenCalledWith('role-member', expect.any(String))
    expect(member.setNickname).toHaveBeenCalledWith('Ada L.', expect.any(String))
    expect(sentContent(send)).toContain("You've already linked your membership")
  })

  it('posts the link prompt for an unlinked user', async () => {
    const { deps } = fakeDeps()
    deps.salesforce.getContactByDiscordId.mockResolvedValueOnce(null)
    const { member, asGuildMember, send } = joined()
    await handleGuildMemberAdd(asGuildMember, deps)
    expect(member.roles.add).not.toHaveBeenCalled()
    expect(sentContent(send)).toContain('Welcome to the TFI Discord server, <@user-1>!')
  })

  it('does not grant access to a linked but lapsed member', async () => {
    const { deps } = fakeDeps()
    deps.salesforce.getContactByDiscordId.mockResolvedValueOnce(contact({ membershipStatus: 'Expired' }))
    const { member, asGuildMember, send } = joined()
    await handleGuildMemberAdd(asGuildMember, deps)
    expect(member.roles.add).not.toHaveBeenCalled()
    expect(sentContent(send)).toContain('Link your membership')
  })

  it('ignores other guilds', async () => {
    const { deps } = fakeDeps()
    const { asGuildMember, send } = joined('some-other-guild')
    await handleGuildMemberAdd(asGuildMember, deps)
    expect(deps.salesforce.getContactByDiscordId).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
})
