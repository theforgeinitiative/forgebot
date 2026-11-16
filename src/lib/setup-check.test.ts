import { describe, expect, it } from 'vitest'
import { setupProblems, type SetupFacts } from './setup-check.ts'

const ok: SetupFacts = {
  canManageRoles: true,
  canManageNicknames: true,
  memberRole: { name: 'Current Member', managed: false, belowBotTopRole: true },
  welcomeChannelSendable: true,
}

describe('setupProblems', () => {
  it('is empty for a correct setup', () => {
    expect(setupProblems(ok)).toEqual([])
  })

  it('flags a member role at or above the bot role', () => {
    const problems = setupProblems({
      ...ok,
      memberRole: { ...ok.memberRole!, belowBotTopRole: false },
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/drag the bot's role above it/)
  })

  it('flags missing permissions, role and channel', () => {
    expect(
      setupProblems({
        canManageRoles: false,
        canManageNicknames: false,
        memberRole: null,
        welcomeChannelSendable: false,
      }),
    ).toHaveLength(4)
  })
})
