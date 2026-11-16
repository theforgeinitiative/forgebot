import { describe, expect, it, vi } from 'vitest'
import {
  createSalesforceClient,
  escapeSoql,
  fullName,
  isCurrentMember,
  type SalesforceConnection,
} from './salesforce.ts'

function fakeConnection(records: unknown[] = [], updateResult = { success: true, errors: [] }) {
  const update = vi.fn(async () => updateResult)
  const conn = {
    query: vi.fn(async (_soql: string) => ({ records })),
    sobject: vi.fn(() => ({ update })),
  }
  return { conn, update, client: createSalesforceClient(async () => conn as unknown as SalesforceConnection) }
}

describe('escapeSoql', () => {
  it('escapes quotes and backslashes', () => {
    expect(escapeSoql(`H0' OR Name LIKE '%`)).toBe(`H0\\' OR Name LIKE \\'%`)
    expect(escapeSoql('a\\b')).toBe('a\\\\b')
  })
})

describe('isCurrentMember', () => {
  it.each([
    ['Current', true],
    ['Grace Period', true],
    ['Expired', false],
    [null, false],
  ])('%s → %s', (status, expected) => {
    expect(isCurrentMember({ membershipStatus: status })).toBe(expected)
  })
})

describe('fullName', () => {
  it('joins available names', () => {
    expect(fullName({ firstName: 'Ada', lastName: 'Lovelace' })).toBe('Ada Lovelace')
    expect(fullName({ firstName: null, lastName: 'Lovelace' })).toBe('Lovelace')
  })
})

describe('createSalesforceClient', () => {
  const row = {
    Id: '003X',
    FirstName: 'Ada',
    LastName: 'Lovelace',
    Email: 'ada@example.org',
    TFI_Display_Name_for_Button__c: 'Ada L.',
    Account: { Id: '001X', npsp__Membership_Status__c: 'Grace Period' },
  }

  it('maps a contact row, including the account membership status', async () => {
    const { client } = fakeConnection([row])
    expect(await client.getContactByDiscordId('123')).toEqual({
      id: '003X',
      accountId: '001X',
      firstName: 'Ada',
      lastName: 'Lovelace',
      displayName: 'Ada L.',
      email: 'ada@example.org',
      membershipStatus: 'Grace Period',
    })
  })

  it('returns null when no contact matches', async () => {
    const { client } = fakeConnection([])
    expect(await client.findContactByIds('H00001', 'P000001')).toBeNull()
  })

  it('escapes HID/PID in the query', async () => {
    const { conn, client } = fakeConnection([])
    await client.findContactByIds(`H' OR '1'='1`, 'P000001')
    const soql = conn.query.mock.calls[0]![0] as string
    expect(soql).toContain(`TFI_Household_ID_ctct__c = 'H\\' OR \\'1\\'=\\'1'`)
  })

  it('writes Discord_ID__c and throws when the update fails', async () => {
    const ok = fakeConnection()
    await ok.client.setDiscordId('003X', '42')
    expect(ok.update).toHaveBeenCalledWith({ Id: '003X', Discord_ID__c: '42' })

    const bad = fakeConnection([], { success: false, errors: ['nope'] as never[] })
    await expect(bad.client.setDiscordId('003X', '42')).rejects.toThrow(/update failed/)
  })

  it('returns the campaign member status or null', async () => {
    expect(await fakeConnection([{ Status: 'Approved' }]).client.getCampaignStatus('003X', '701X')).toBe('Approved')
    expect(await fakeConnection([]).client.getCampaignStatus('003X', '701X')).toBeNull()
  })
})
