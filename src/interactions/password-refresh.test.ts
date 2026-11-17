import type { ButtonInteraction } from 'discord.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PASSWORD } from '../lib/messages.ts'
import { fakeDeps, fakeReplies } from '../test/fakes.ts'
import { handlePasswordRefresh } from './password-refresh.ts'

function interaction(customId = 'password_refresh:bambu') {
  const replies = { ...fakeReplies(), deferUpdate: vi.fn(async () => undefined) }
  const i = { ...replies, customId, user: { id: 'user-1', tag: 'ada' } }
  return { i: i as unknown as ButtonInteraction, replies }
}

type Edit = { content: string; components: unknown[] }

describe('password refresh button', () => {
  afterEach(() => vi.useRealTimers())

  it('edits the message in place with a fresh code', async () => {
    vi.useFakeTimers({ now: 60_000 })
    const { deps, member } = fakeDeps()
    member.roles.cache.has.mockReturnValue(true)
    const { i, replies } = interaction()
    await handlePasswordRefresh(i, deps)

    expect(replies.deferUpdate).toHaveBeenCalled()
    const edit = replies.editReply.mock.calls[0]![0] as Edit
    // RFC 4226 counter 2 → 359152
    expect(edit.content).toMatch(/\(expires <t:90:R>.*\)\n`359152`$/)
    expect(JSON.stringify(edit.components)).toContain('password_refresh:bambu')
  })

  it('wipes the credentials when the member role is gone', async () => {
    const { deps } = fakeDeps()
    const { i, replies } = interaction()
    await handlePasswordRefresh(i, deps)

    expect(replies.editReply.mock.calls[0]![0]).toEqual({ content: PASSWORD.notMember, components: [] })
  })

  it('handles a site that was removed since the message was sent', async () => {
    const { deps, member } = fakeDeps()
    member.roles.cache.has.mockReturnValue(true)
    const { i, replies } = interaction('password_refresh:gone')
    await handlePasswordRefresh(i, deps)

    expect(replies.editReply.mock.calls[0]![0]).toEqual({ content: PASSWORD.unknownSite, components: [] })
  })
})
