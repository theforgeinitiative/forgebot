import { describe, expect, it } from 'vitest'
import { emergencyInfo } from '../test/fakes.ts'
import { emergencyInfoMessages, fullNameLabel, personLabel, splitMessage } from './messages.ts'

describe('splitMessage', () => {
  it('packs lines up to the limit and splits overlong lines', () => {
    expect(splitMessage(['aaaa', 'bb', 'cc'], 7)).toEqual(['aaaa\nbb', 'cc'])
    expect(splitMessage(['x'.repeat(10)], 4)).toEqual(['xxxx', 'xxxx', 'xx'])
  })
})

describe('fullNameLabel', () => {
  it('uses the full name, falling back to the display name', () => {
    expect(fullNameLabel({ displayName: 'Bob T.', firstName: 'Bobby', lastName: 'Tables' })).toBe('Bobby Tables')
    expect(fullNameLabel({ displayName: 'Bob T.', firstName: null, lastName: null })).toBe('Bob T.')
    expect(fullNameLabel({ displayName: null, firstName: null, lastName: null })).toBe('Unnamed contact')
  })
})

describe('personLabel', () => {
  it('shows the display name with the full name when they differ', () => {
    expect(personLabel({ displayName: 'Bob T.', firstName: 'Bobby', lastName: 'Tables' })).toBe('Bob T. (Bobby Tables)')
    expect(personLabel({ displayName: 'Bobby Tables', firstName: 'Bobby', lastName: 'Tables' })).toBe('Bobby Tables')
    expect(personLabel({ displayName: null, firstName: null, lastName: 'Tables' })).toBe('Tables')
    expect(personLabel({ displayName: ' ', firstName: null, lastName: null })).toBe('Unnamed contact')
  })
})

describe('emergencyInfoMessages', () => {
  const now = new Date(2026, 10, 22)

  it('shows ages, escapes markdown and handles missing details', () => {
    const [msg, ...rest] = emergencyInfoMessages(
      emergencyInfo({
        emergencyContact: { name: null, phone: null, relationship: null },
        allergies: '*bees*',
        householdAdults: [],
      }),
      now,
    )
    expect(rest).toEqual([])
    expect(msg).toContain('Born 2014-03-01 (age 12)\n')
    expect(msg).toContain('**Emergency contact:** _none on file_')
    expect(msg).toContain('**Allergies:** \\*bees\\*')
    expect(msg).toContain('_No other adults in the household._')
  })

  it('splits very long records across messages under 2000 characters', () => {
    const messages = emergencyInfoMessages(emergencyInfo({ healthIssues: 'x'.repeat(3000) }), now)
    expect(messages.length).toBeGreaterThan(1)
    for (const m of messages) expect(m.length).toBeLessThanOrEqual(2000)
  })
})
