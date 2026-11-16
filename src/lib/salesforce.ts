// Salesforce access. Contact.Discord_ID__c is the source of truth for which
// Discord user belongs to which member; membership status lives on the
// household Account. Connection handling mirrors the member portal's
// lib/salesforce.ts (client-credentials flow, cached ~110 min).
import { Connection } from 'jsforce'

export type Contact = {
  id: string
  accountId: string | null
  firstName: string | null
  lastName: string | null
  displayName: string | null
  email: string | null
  membershipStatus: string | null
}

export type SalesforceClient = {
  getContactByDiscordId(discordId: string): Promise<Contact | null>
  findContactByIds(hid: string, pid: string): Promise<Contact | null>
  setDiscordId(contactId: string, discordId: string): Promise<void>
  // Status of the contact's CampaignMember row, or null when there isn't one
  getCampaignStatus(contactId: string, campaignId: string): Promise<string | null>
}

const CURRENT_STATUSES = new Set(['Current', 'Grace Period'])

export function isCurrentMember(contact: Pick<Contact, 'membershipStatus'>): boolean {
  return contact.membershipStatus !== null && CURRENT_STATUSES.has(contact.membershipStatus)
}

export function escapeSoql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export function fullName(contact: Pick<Contact, 'firstName' | 'lastName'>): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ')
}

type ContactRow = {
  Id: string
  FirstName: string | null
  LastName: string | null
  Email: string | null
  TFI_Display_Name_for_Button__c: string | null
  Account: { Id: string | null; npsp__Membership_Status__c: string | null } | null
}

const CONTACT_FIELDS = `Id, FirstName, LastName, Email, TFI_Display_Name_for_Button__c,
  Account.Id, Account.npsp__Membership_Status__c`

export function toContact(row: ContactRow): Contact {
  return {
    id: row.Id,
    accountId: row.Account?.Id ?? null,
    firstName: row.FirstName,
    lastName: row.LastName,
    displayName: row.TFI_Display_Name_for_Button__c,
    email: row.Email,
    membershipStatus: row.Account?.npsp__Membership_Status__c ?? null,
  }
}

// The subset of jsforce's Connection this module uses; lets tests pass a fake.
export type SalesforceConnection = {
  query<T>(soql: string): Promise<{ records: T[] }>
  sobject(type: string): {
    update(record: { Id: string } & Record<string, unknown>): Promise<{
      success: boolean
      errors: unknown[]
    }>
  }
}

export type SalesforceOptions = {
  loginUrl: string
  clientId: string
  clientSecret: string
}

export function connectionFactory(opts: SalesforceOptions): () => Promise<SalesforceConnection> {
  let conn: Connection | null = null
  let expiresAt = 0
  return async () => {
    if (conn && Date.now() < expiresAt) return conn as unknown as SalesforceConnection
    const next = new Connection({
      oauth2: { clientId: opts.clientId, clientSecret: opts.clientSecret, loginUrl: opts.loginUrl },
    })
    await next.authorize({ grant_type: 'client_credentials' })
    conn = next
    // Access tokens last ~2 hours; refresh 10 minutes early
    expiresAt = Date.now() + 110 * 60 * 1000
    return conn as unknown as SalesforceConnection
  }
}

export function createSalesforceClient(
  getConnection: () => Promise<SalesforceConnection>,
): SalesforceClient {
  async function queryOneContact(where: string): Promise<Contact | null> {
    const sf = await getConnection()
    const result = await sf.query<ContactRow>(
      `SELECT ${CONTACT_FIELDS} FROM Contact WHERE ${where} LIMIT 1`,
    )
    const row = result.records[0]
    return row ? toContact(row) : null
  }

  return {
    getContactByDiscordId(discordId) {
      return queryOneContact(`Discord_ID__c = '${escapeSoql(discordId)}'`)
    },

    findContactByIds(hid, pid) {
      return queryOneContact(
        `TFI_Household_ID_ctct__c = '${escapeSoql(hid)}' AND TFI_Personal_ID__c = '${escapeSoql(pid)}'`,
      )
    },

    async setDiscordId(contactId, discordId) {
      const sf = await getConnection()
      const result = await sf
        .sobject('Contact')
        .update({ Id: contactId, Discord_ID__c: discordId })
      if (!result.success) {
        throw new Error(`Contact ${contactId} Discord ID update failed: ${JSON.stringify(result.errors)}`)
      }
    },

    async getCampaignStatus(contactId, campaignId) {
      const sf = await getConnection()
      const result = await sf.query<{ Status: string | null }>(
        `SELECT Status FROM CampaignMember
         WHERE CampaignId = '${escapeSoql(campaignId)}' AND ContactId = '${escapeSoql(contactId)}'
         LIMIT 1`,
      )
      return result.records[0]?.Status ?? null
    },
  }
}
