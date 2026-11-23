import { describe, expect, it, vi } from 'vitest'
import {
  ageFromBirthdate,
  createSalesforceClient,
  escapeSoql,
  escapeSoqlLike,
  isContactId,
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

describe('escapeSoqlLike', () => {
  it('escapes LIKE wildcards as well as quotes', () => {
    expect(escapeSoqlLike(`100%_O'Brien`)).toBe(`100\\%\\_O\\'Brien`)
  })
})

describe('ageFromBirthdate', () => {
  const now = new Date(2026, 10, 22) // 22 Nov 2026, local time
  it.each([
    ['2008-11-22', 18],
    ['2008-11-23', 17],
    ['2008-12-01', 17],
    ['1980-01-01', 46],
    [null, null],
    ['not a date', null],
  ])('%s → %s', (birthdate, expected) => {
    expect(ageFromBirthdate(birthdate, now)).toBe(expected)
  })
})

describe('isContactId', () => {
  it('accepts 15- and 18-character Contact Ids only', () => {
    expect(isContactId('003000000000BOB')).toBe(true)
    expect(isContactId('003000000000BOBAAA')).toBe(true)
    expect(isContactId('001000000000BOB')).toBe(false)
    expect(isContactId('Bob Tables')).toBe(false)
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

  it('searches display names and full names with escaped wildcards', async () => {
    const { conn, client } = fakeConnection([
      { Id: '003X', FirstName: 'Ada', LastName: 'Lovelace', TFI_Display_Name_for_Button__c: 'Ada L.' },
    ])
    expect(await client.searchContacts(`a%d'a`, 25)).toEqual([
      { id: '003X', firstName: 'Ada', lastName: 'Lovelace', displayName: 'Ada L.' },
    ])
    const soql = conn.query.mock.calls[0]![0] as string
    expect(soql).toContain(`TFI_Display_Name_for_Button__c LIKE '%a\\%d\\'a%' OR Name LIKE '%a\\%d\\'a%'`)
    expect(soql).toContain('LIMIT 25')
  })

  it('loads emergency info and only the other adults in the household', async () => {
    const person = {
      Id: '003KID',
      FirstName: 'Bobby',
      LastName: 'Tables',
      TFI_Display_Name_for_Button__c: 'Bob T.',
      TFI_Personal_ID__c: 'P012345',
      AccountId: '001H',
      Birthdate: '2014-03-01',
      Emergency_Name_1__c: 'Grace Hopper',
      Emergency_Phone_1__c: '919-555-0100',
      Emergency_Contact_Relationship_1__c: 'Aunt',
      Allergies__c: 'Peanuts',
      Medication__c: null,
      Health_Issues__c: 'Asthma',
      Dietary_restrictions__c: 'Vegetarian',
      Other_food_related_information__c: null,
    }
    const household = [
      { Id: '003MOM', FirstName: 'Alice', LastName: 'Tables', TFI_Display_Name_for_Button__c: null, Birthdate: '1980-06-15', MobilePhone: '919-555-0101', HomePhone: null, npe01__PreferredPhone__c: 'Mobile' },
      { Id: '003SIB', FirstName: 'Cara', LastName: 'Tables', TFI_Display_Name_for_Button__c: null, Birthdate: '2016-01-01', MobilePhone: null, HomePhone: null, npe01__PreferredPhone__c: null },
      { Id: '003GRAN', FirstName: 'Dot', LastName: 'Tables', TFI_Display_Name_for_Button__c: null, Birthdate: null, MobilePhone: null, HomePhone: '919-555-0103', npe01__PreferredPhone__c: null },
    ]
    const conn = {
      query: vi.fn(async (soql: string) => ({ records: soql.includes('AccountId =') ? household : [person] })),
      sobject: vi.fn(),
    }
    const client = createSalesforceClient(async () => conn as unknown as SalesforceConnection)
    const info = await client.getEmergencyInfo('003KID')

    expect(info?.person).toEqual({
      id: '003KID', firstName: 'Bobby', lastName: 'Tables', displayName: 'Bob T.', pid: 'P012345', birthdate: '2014-03-01',
    })
    expect(info?.emergencyContact).toEqual({ name: 'Grace Hopper', phone: '919-555-0100', relationship: 'Aunt' })
    expect(info?.allergies).toBe('Peanuts')
    // The child is left out; an unknown birthdate counts as an adult
    expect(info?.householdAdults.map((a) => a.id)).toEqual(['003MOM', '003GRAN'])
    expect(conn.query.mock.calls[1]![0]).toContain(`AccountId = '001H' AND Id != '003KID'`)
  })

  it('skips the household query for a contact without an account, and returns null for an unknown one', async () => {
    const { conn, client } = fakeConnection([{ Id: '003X', AccountId: null }])
    expect((await client.getEmergencyInfo('003X'))?.householdAdults).toEqual([])
    expect(conn.query).toHaveBeenCalledTimes(1)
    expect(await fakeConnection([]).client.getEmergencyInfo('003X')).toBeNull()
  })
})
