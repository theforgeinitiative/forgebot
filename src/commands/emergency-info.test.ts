import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { EMERGENCY } from '../lib/messages.ts'
import { contentOf, fakeDeps, fakeReplies } from '../test/fakes.ts'
import { emergencyInfo } from './emergency-info.ts'

const BOB_ID = '003000000000BOB'
// Anything here reaching a non-keyholder is a leak
const SENSITIVE = ['Bob', 'Tables', 'Peanuts', 'Asthma', 'Grace Hopper', '919-555']

function interaction(opts: { person?: string } = {}) {
  const replies = { ...fakeReplies(), deferReply: vi.fn(async (_arg: unknown) => undefined) }
  const send = vi.fn(async (_arg: unknown) => ({ channelId: 'dm-1' }))
  const i = {
    ...replies,
    user: { id: 'user-1', tag: 'ada', send },
    options: {
      getString: (_name: string) => opts.person ?? BOB_ID,
    },
  }
  return { i: i as unknown as ChatInputCommandInteraction, replies, send }
}

function keyholderDeps() {
  const { deps, member } = fakeDeps()
  member.roles.cache.has.mockImplementation((id: string) => id === 'role-keyholder')
  return { deps, member }
}

function expectNothingSensitive(...fns: ReturnType<typeof vi.fn>[]) {
  const all = JSON.stringify(fns.map((f) => f.mock.calls))
  for (const s of SENSITIVE) expect(all).not.toContain(s)
}

describe('/emergency-info', () => {
  it('logs the lookup, then DMs the info to a keyholder', async () => {
    const { deps } = keyholderDeps()
    const { i, replies, send } = interaction()
    await emergencyInfo.execute(i, deps)

    expect(replies.deferReply).toHaveBeenCalledWith({ flags: 64 })
    expect(deps.salesforce.searchContacts).not.toHaveBeenCalled()
    expect(deps.salesforce.getEmergencyInfo).toHaveBeenCalledWith(BOB_ID)

    const [channelId, log] = deps.postToChannel.mock.calls[0]! as [string, { content: string; allowedMentions: unknown }]
    expect(channelId).toBe('chan-emergency-log')
    expect(log.content).toBe(
      ':rotating_light: <@user-1> viewed emergency info for **Bobby Tables** (PID `P012345`).',
    )
    expect(log.allowedMentions).toEqual({ parse: [] })
    // The log names the person, never their details
    expect(log.content).not.toMatch(/Peanuts|Asthma|Grace|919/)
    // Logged before anything is revealed
    expect(deps.postToChannel.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0]!)

    const dm = (send.mock.calls[0]![0] as { content: string }).content
    expect(dm).toContain('**Emergency info for Bobby Tables**')
    expect(dm).toContain('**Emergency contact:** Grace Hopper (Aunt) 919-555-0100')
    expect(dm).toContain('**Allergies:** Peanuts (EpiPen in backpack)')
    expect(dm).toContain('**Medication:** _none on file_')
    expect(dm).toContain('**Other health info:**\n> Asthma\n> Inhaler in the front office')
    expect(dm).toContain('**Dietary restrictions:** Vegetarian, Nut-free')
    expect(dm).toContain('- **Alice Tables**: Mobile')
    expect(dm).toContain('Mobile 919-555-0101 · Other 919-555-0102 (preferred)')

    expect(contentOf(replies.editReply)).toBe(EMERGENCY.sent)
    expect(JSON.stringify(replies.editReply.mock.calls[0])).toContain('channels/@me/dm-1')
  })

  it('logs the Contact Id for someone without a PID', async () => {
    const { deps } = keyholderDeps()
    const info = (await deps.salesforce.getEmergencyInfo(BOB_ID))!
    deps.salesforce.getEmergencyInfo.mockResolvedValueOnce({ ...info, person: { ...info.person, pid: null } })
    const { i } = interaction()
    await emergencyInfo.execute(i, deps)
    const log = (deps.postToChannel.mock.calls[0]![1] as { content: string }).content
    expect(log).toContain('(Salesforce `003000000000BOB`)')
  })


  it('refuses users without the keyholder role before touching Salesforce', async () => {
    const { deps, member } = fakeDeps()
    member.roles.cache.has.mockImplementation((id: string) => id === 'role-member')
    const { i, replies, send } = interaction()
    await emergencyInfo.execute(i, deps)

    expect(contentOf(replies.editReply)).toBe(EMERGENCY.notKeyholder)
    expect(deps.salesforce.getEmergencyInfo).not.toHaveBeenCalled()
    expect(deps.postToChannel).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expectNothingSensitive(replies.editReply, replies.followUp)
  })

  it('reports a failed role lookup', async () => {
    const { deps } = keyholderDeps()
    deps.getGuild.mockRejectedValueOnce(new Error('discord down'))
    const { i, replies } = interaction()
    await emergencyInfo.execute(i, deps)
    expect(contentOf(replies.editReply)).toBe(EMERGENCY.roleCheckFailed)
    expect(deps.salesforce.getEmergencyInfo).not.toHaveBeenCalled()
  })

  it('says so when the command is not configured', async () => {
    const { deps } = keyholderDeps()
    deps.config.emergency = null
    const { i, replies } = interaction()
    await emergencyInfo.execute(i, deps)
    expect(contentOf(replies.editReply)).toBe(EMERGENCY.notConfigured)
    expect(deps.salesforce.getEmergencyInfo).not.toHaveBeenCalled()
  })

  it('reports a Salesforce failure without logging a lookup', async () => {
    const { deps } = keyholderDeps()
    deps.salesforce.getEmergencyInfo.mockRejectedValueOnce(new Error('sf down'))
    const { i, replies } = interaction()
    await emergencyInfo.execute(i, deps)
    expect(contentOf(replies.editReply)).toBe(EMERGENCY.lookupFailed)
    expect(deps.postToChannel).not.toHaveBeenCalled()
  })

  it('reports an unknown contact Id', async () => {
    const { deps } = keyholderDeps()
    deps.salesforce.getEmergencyInfo.mockResolvedValueOnce(null)
    const { i, replies } = interaction()
    await emergencyInfo.execute(i, deps)
    expect(contentOf(replies.editReply)).toBe(EMERGENCY.notFound)
    expect(deps.postToChannel).not.toHaveBeenCalled()
  })

  it('resolves typed text that matches one person', async () => {
    const { deps } = keyholderDeps()
    const { i } = interaction({ person: 'bobby' })
    await emergencyInfo.execute(i, deps)
    expect(deps.salesforce.searchContacts).toHaveBeenCalledWith('bobby', 10)
    expect(deps.salesforce.getEmergencyInfo).toHaveBeenCalledWith(BOB_ID)
  })

  it('prefers an exact name among several matches', async () => {
    const { deps } = keyholderDeps()
    deps.salesforce.searchContacts.mockResolvedValueOnce([
      { id: '003000000000BOB', firstName: 'Bobby', lastName: 'Tables', displayName: 'Bob T.' },
      { id: '003000000000BOX', firstName: 'Bob', lastName: 'Tablesworth', displayName: 'Bob T2' },
    ])
    const { i } = interaction({ person: 'Bob T.' })
    await emergencyInfo.execute(i, deps)
    expect(deps.salesforce.getEmergencyInfo).toHaveBeenCalledWith(BOB_ID)
  })

  it('lists the matches when typed text is ambiguous', async () => {
    const { deps } = keyholderDeps()
    deps.salesforce.searchContacts.mockResolvedValueOnce([
      { id: '003000000000BOB', firstName: 'Bobby', lastName: 'Tables', displayName: 'Bob T.' },
      { id: '003000000000BOX', firstName: 'Bob', lastName: 'Tablesworth', displayName: null },
    ])
    const { i, replies } = interaction({ person: 'bob' })
    await emergencyInfo.execute(i, deps)
    expect(contentOf(replies.editReply)).toBe(EMERGENCY.ambiguous(['Bob T. (Bobby Tables)', 'Bob Tablesworth']))
    expect(deps.salesforce.getEmergencyInfo).not.toHaveBeenCalled()
    expect(deps.postToChannel).not.toHaveBeenCalled()
  })

  it('reports typed text that matches nobody', async () => {
    const { deps } = keyholderDeps()
    deps.salesforce.searchContacts.mockResolvedValueOnce([])
    const { i, replies } = interaction({ person: 'zzz' })
    await emergencyInfo.execute(i, deps)
    expect(contentOf(replies.editReply)).toBe(EMERGENCY.notFound)
  })

  it('still shows the info when the audit post fails', async () => {
    const { deps } = keyholderDeps()
    deps.postToChannel.mockRejectedValueOnce(new Error('missing access'))
    const { i, send } = interaction()
    await emergencyInfo.execute(i, deps)
    expect(send).toHaveBeenCalled()
  })

  it('falls back to private replies when the DM fails', async () => {
    const { deps } = keyholderDeps()
    const { i, replies, send } = interaction()
    send.mockRejectedValueOnce(new Error('Cannot send messages to this user'))
    await emergencyInfo.execute(i, deps)
    expect(contentOf(replies.editReply)).toBe(EMERGENCY.dmFailed)
    const follow = replies.followUp.mock.calls[0]![0] as { content: string; flags: number }
    expect(follow.flags).toBe(64)
    expect(follow.content).toContain('**Allergies:** Peanuts')
  })
})

describe('/emergency-info autocomplete', () => {
  function autocomplete(focused: string) {
    const respond = vi.fn(async (_choices: { name: string; value: string }[]) => undefined)
    const i = { user: { id: 'user-1' }, options: { getFocused: () => focused }, respond }
    return { i: i as unknown as AutocompleteInteraction, respond }
  }

  it('suggests matching people to a keyholder', async () => {
    const { deps } = keyholderDeps()
    const { i, respond } = autocomplete(' bob ')
    await emergencyInfo.autocomplete!(i, deps)
    expect(deps.salesforce.searchContacts).toHaveBeenCalledWith('bob', 25)
    expect(respond).toHaveBeenCalledWith([{ name: 'Bob T. (Bobby Tables)', value: BOB_ID }])
  })

  it('suggests nobody to users without the keyholder role', async () => {
    const { deps } = fakeDeps()
    const { i, respond } = autocomplete('bob')
    await emergencyInfo.autocomplete!(i, deps)
    expect(respond).toHaveBeenCalledWith([])
    expect(deps.salesforce.searchContacts).not.toHaveBeenCalled()
  })

  it('waits for at least two characters', async () => {
    const { deps } = keyholderDeps()
    const { i, respond } = autocomplete('b')
    await emergencyInfo.autocomplete!(i, deps)
    expect(respond).toHaveBeenCalledWith([])
    expect(deps.salesforce.searchContacts).not.toHaveBeenCalled()
  })

  it('suggests nobody when Salesforce fails', async () => {
    const { deps } = keyholderDeps()
    deps.salesforce.searchContacts.mockRejectedValueOnce(new Error('sf down'))
    const { i, respond } = autocomplete('bob')
    await emergencyInfo.autocomplete!(i, deps)
    expect(respond).toHaveBeenCalledWith([])
  })
})
