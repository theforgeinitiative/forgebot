import type { ModalSubmitInteraction } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { LINK } from '../lib/messages.ts'
import { contact, contentOf, fakeDeps, fakeReplies } from '../test/fakes.ts'
import { handleLinkMembershipModal } from './link-membership-modal.ts'

function interaction(hid = 'h01234 ', pid = 'P012345') {
  const replies = fakeReplies()
  const i = {
    ...replies,
    user: { id: 'user-1' },
    fields: { getTextInputValue: (id: string) => (id === 'hid' ? hid : pid) },
  }
  return { i: i as unknown as ModalSubmitInteraction, replies }
}

describe('link membership modal', () => {
  it('links, grants the role and nickname, and confirms', async () => {
    const { deps, member } = fakeDeps()
    const { i, replies } = interaction()
    await handleLinkMembershipModal(i, deps)

    expect(deps.salesforce.findContactByIds).toHaveBeenCalledWith('H01234', 'P012345')
    expect(deps.salesforce.setDiscordId).toHaveBeenCalledWith('003AAA', 'user-1')
    expect(member.roles.add).toHaveBeenCalledWith('role-member', expect.any(String))
    expect(member.setNickname).toHaveBeenCalledWith('Ada L.', expect.any(String))
    expect(contentOf(replies.followUp)).toBe(LINK.success)
  })

  it('shows the recovery links when the HID/PID is not found', async () => {
    const { deps } = fakeDeps()
    deps.salesforce.findContactByIds.mockResolvedValueOnce(null)
    const { i, replies } = interaction()
    await handleLinkMembershipModal(i, deps)
    expect(contentOf(replies.followUp)).toBe(LINK.notFound)
    expect(deps.salesforce.setDiscordId).not.toHaveBeenCalled()
  })

  it('links but does not grant the role to a lapsed member', async () => {
    const { deps, member } = fakeDeps()
    deps.salesforce.findContactByIds.mockResolvedValueOnce(contact({ membershipStatus: 'Expired' }))
    const { i, replies } = interaction()
    await handleLinkMembershipModal(i, deps)
    expect(deps.salesforce.setDiscordId).toHaveBeenCalled()
    expect(member.roles.add).not.toHaveBeenCalled()
    expect(contentOf(replies.followUp)).toBe(LINK.notCurrent)
  })

  it('reports a failed Salesforce write', async () => {
    const { deps } = fakeDeps()
    deps.salesforce.setDiscordId.mockRejectedValueOnce(new Error('x'))
    const { i, replies } = interaction()
    await handleLinkMembershipModal(i, deps)
    expect(contentOf(replies.followUp)).toBe(LINK.saveFailed)
  })

  it('succeeds without a role when the user is not in the guild', async () => {
    const { deps } = fakeDeps({
      getGuild: vi.fn(async () => ({
        members: { fetch: vi.fn(async () => Promise.reject({ code: 10007 })) },
      })),
    })
    const { i, replies } = interaction()
    await handleLinkMembershipModal(i, deps)
    expect(contentOf(replies.followUp)).toBe(LINK.success)
  })

  it('reports a failed role grant', async () => {
    const { deps, member } = fakeDeps()
    member.roles.add.mockRejectedValueOnce(new Error('Missing Permissions'))
    const { i, replies } = interaction()
    await handleLinkMembershipModal(i, deps)
    expect(contentOf(replies.followUp)).toBe(LINK.roleFailed)
  })
})
