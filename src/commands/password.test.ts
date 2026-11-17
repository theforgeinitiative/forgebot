import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SharedLogin } from '../config/shared-logins.ts'
import { PASSWORD } from '../lib/messages.ts'
import { contentOf, fakeDeps, fakeReplies } from '../test/fakes.ts'
import { password } from './password.ts'

function interaction(site = 'bambu') {
  const replies = { ...fakeReplies(), deferReply: vi.fn(async (_arg: unknown) => undefined) }
  const i = {
    ...replies,
    user: { id: 'user-1', tag: 'ada' },
    options: { getString: () => site },
  }
  return { i: i as unknown as ChatInputCommandInteraction, replies }
}

function memberDeps() {
  const { deps, member } = fakeDeps()
  member.roles.cache.has.mockImplementation((id: string) => id === 'role-member')
  return { deps, member }
}

const SECRETS = ['hunter2', 'p`ss', 'shop@example.org', 'laser@example.org']

function expectNoSecrets(replies: ReturnType<typeof interaction>['replies']) {
  const all = JSON.stringify([replies.reply.mock.calls, replies.editReply.mock.calls, replies.followUp.mock.calls])
  for (const s of SECRETS) expect(all).not.toContain(s)
}

describe('/password', () => {
  afterEach(() => vi.useRealTimers())

  it('shows the login and current 2FA code to a member, ephemerally', async () => {
    vi.useFakeTimers({ now: 59_000 })
    const { deps } = memberDeps()
    const { i, replies } = interaction()
    await password.execute(i, deps)

    expect(replies.deferReply).toHaveBeenCalledWith({ flags: 64 })
    const edit = replies.editReply.mock.calls[0]![0] as { content: string; components: unknown[] }
    expect(edit.content).toContain('**Bambu Lab**')
    expect(edit.content).toContain('**Username**\n`shop@example.org`\n')
    expect(edit.content).toContain('**Password**\n`hunter2`\n')
    expect(edit.content).toMatch(/\*\*2FA code\*\* \(expires <t:60:R>.*\)\n`287082`$/)
    expect(JSON.stringify(edit.components)).toContain('https://bambulab.com')
    expect(JSON.stringify(edit.components)).toContain('password_refresh:bambu')
    expect(deps.salesforce.getContactByDiscordId).not.toHaveBeenCalled()
  })

  it('adds the site slack to the countdown without changing the code', async () => {
    vi.useFakeTimers({ now: 59_000 })
    const { deps } = memberDeps()
    deps.config.sharedLogins = deps.config.sharedLogins.map((l) => ({ ...l, totpSlackSeconds: 30 }))
    const { i, replies } = interaction()
    await password.execute(i, deps)
    expect(contentOf(replies.editReply)).toMatch(/\(expires <t:90:R>.*\)\n`287082`$/)
  })

  it('omits the 2FA line without a secret and escapes backticks', async () => {
    const { deps } = memberDeps()
    const { i, replies } = interaction('glowforge')
    await password.execute(i, deps)

    const content = contentOf(replies.editReply)!
    expect(content).toContain('**Password**\n`` p`ss ``')
    expect(content).not.toContain('2FA')
    expect(JSON.stringify(replies.editReply.mock.calls)).not.toContain('password_refresh')
  })

  it('refuses users without the member role', async () => {
    const { deps } = fakeDeps()
    const { i, replies } = interaction()
    await password.execute(i, deps)
    expect(contentOf(replies.editReply)).toBe(PASSWORD.notMember)
    expectNoSecrets(replies)
  })

  it('refuses users who are not in the guild', async () => {
    const { deps } = fakeDeps()
    deps.getGuild.mockResolvedValueOnce({
      members: { fetch: vi.fn(async () => Promise.reject(Object.assign(new Error('Unknown Member'), { code: 10007 }))) },
    })
    const { i, replies } = interaction()
    await password.execute(i, deps)
    expect(contentOf(replies.editReply)).toBe(PASSWORD.notMember)
    expectNoSecrets(replies)
  })

  it('reports a failed member lookup', async () => {
    const { deps } = fakeDeps()
    deps.getGuild.mockRejectedValueOnce(new Error('discord down'))
    const { i, replies } = interaction()
    await password.execute(i, deps)
    expect(contentOf(replies.editReply)).toBe(PASSWORD.failed)
    expectNoSecrets(replies)
  })

  it('rejects an unknown site', async () => {
    const { deps } = memberDeps()
    const { i, replies } = interaction('nope')
    await password.execute(i, deps)
    expect(contentOf(replies.editReply)).toBe(PASSWORD.unknownSite)
  })

  it('says so when no sites are configured', async () => {
    const { deps } = memberDeps()
    deps.config.sharedLogins = []
    const { i, replies } = interaction()
    await password.execute(i, deps)
    expect(contentOf(replies.editReply)).toBe(PASSWORD.noneConfigured)
  })
})

describe('/password autocomplete', () => {
  function autocomplete(focused: string) {
    const respond = vi.fn(async (_choices: { name: string; value: string }[]) => undefined)
    const i = { options: { getFocused: () => focused }, respond }
    return { i: i as unknown as AutocompleteInteraction, respond }
  }

  it('filters sites by id or name', async () => {
    const { deps } = fakeDeps()
    const { i, respond } = autocomplete('LAB')
    await password.autocomplete!(i, deps)
    expect(respond).toHaveBeenCalledWith([{ name: 'Bambu Lab', value: 'bambu' }])
  })

  it('lists at most 25 sites', async () => {
    const { deps } = fakeDeps()
    deps.config.sharedLogins = Array.from({ length: 30 }, (_, n): SharedLogin => ({
      id: `site${n}`,
      name: `Site ${n}`,
      url: 'https://example.org',
      username: 'u',
      password: 'p',
      totpSlackSeconds: 0,
    }))
    const { i, respond } = autocomplete('')
    await password.autocomplete!(i, deps)
    expect(respond.mock.calls[0]![0]).toHaveLength(25)
  })
})
