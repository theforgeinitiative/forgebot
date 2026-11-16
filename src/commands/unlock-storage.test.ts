import type { ChatInputCommandInteraction } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { STORAGE } from '../lib/messages.ts'
import { contact, contentOf, fakeDeps, fakeReplies } from '../test/fakes.ts'
import { unlockStorage } from './unlock-storage.ts'

function interaction(opts: { unit?: string; dmFails?: boolean } = {}) {
  const replies = fakeReplies()
  const send = vi.fn(async (_content: string) => {
    if (opts.dmFails) throw new Error('Cannot send messages to this user')
    return { channelId: 'dm-1' }
  })
  const i = {
    ...replies,
    user: { id: 'user-1', send },
    options: { getString: () => opts.unit ?? 'IGP119cc1cdf' },
  }
  return { i: i as unknown as ChatInputCommandInteraction, replies, send }
}

describe('/unlock-storage', () => {
  it('DMs a formatted PIN, logs it, and points to the DM', async () => {
    const { deps } = fakeDeps()
    const { i, replies, send } = interaction()
    await unlockStorage.execute(i, deps)

    expect(contentOf(replies.reply)).toBe(STORAGE.generating)
    expect(deps.salesforce.getCampaignStatus).toHaveBeenCalledWith('003AAA', '701STORAGE')
    expect(deps.igloohome.generateHourly).toHaveBeenCalledWith('IGP119cc1cdf', 'Ada Lovelace', 2)
    expect(deps.sheetLog.storageUnlock).toHaveBeenCalledWith(expect.objectContaining({ id: '003AAA' }), '2099')

    const dm = send.mock.calls[0]![0] as string
    expect(dm).toContain('Enter code `123 456 789`')
    expect(dm).toContain('**unit 2099**')
    expect(dm).toContain('valid until **4:00PM**')
    expect(dm.endsWith('Gate code is on the sign.')).toBe(true)

    const edit = replies.editReply.mock.calls[0]![0] as { content: string; components: unknown[] }
    expect(edit.content).toBe(STORAGE.done)
    expect(JSON.stringify(edit.components)).toContain('https://discord.com/channels/@me/dm-1')
  })

  it.each([
    ['unlinked', { getContactByDiscordId: vi.fn(async () => null) }, STORAGE.notLinked],
    ['lapsed', { getContactByDiscordId: vi.fn(async () => contact({ membershipStatus: 'Expired' })) }, STORAGE.notCurrent],
    ['not on campaign', { getCampaignStatus: vi.fn(async () => null) }, STORAGE.notApproved],
    ['requested', { getCampaignStatus: vi.fn(async () => 'Requested') }, STORAGE.awaitingApproval],
    ['salesforce down', { getContactByDiscordId: vi.fn(async () => Promise.reject(new Error('x'))) }, STORAGE.failed],
  ])('%s → refuses without generating a PIN', async (_, sf, message) => {
    const { deps } = fakeDeps()
    Object.assign(deps.salesforce, sf)
    const { i, replies } = interaction()
    await unlockStorage.execute(i, deps)
    expect(contentOf(replies.followUp)).toBe(message)
    expect(deps.igloohome.generateHourly).not.toHaveBeenCalled()
  })

  it('reports igloohome failures', async () => {
    const { deps } = fakeDeps()
    deps.igloohome.generateHourly.mockRejectedValueOnce(new Error('500'))
    const { i, replies, send } = interaction()
    await unlockStorage.execute(i, deps)
    expect(contentOf(replies.followUp)).toBe(STORAGE.failed)
    expect(send).not.toHaveBeenCalled()
  })

  it('still sends the code when the log append fails', async () => {
    const { deps } = fakeDeps()
    deps.sheetLog.storageUnlock.mockRejectedValueOnce(new Error('sheets down'))
    const { i, send } = interaction()
    await unlockStorage.execute(i, deps)
    expect(send).toHaveBeenCalled()
  })

  it('tells the user when the DM cannot be delivered', async () => {
    const { deps } = fakeDeps()
    const { i, replies } = interaction({ dmFails: true })
    await unlockStorage.execute(i, deps)
    expect(contentOf(replies.editReply)).toBe(STORAGE.dmFailed)
  })
})
