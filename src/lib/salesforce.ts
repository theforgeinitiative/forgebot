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

// A search hit for /emergency-info autocomplete
export type ContactSummary = {
  id: string
  firstName: string | null
  lastName: string | null
  displayName: string | null
}

// Field names match the member portal's profile form (lib/profile-fields.ts)
export type EmergencyInfo = {
  // pid is TFI_Personal_ID__c; null for contacts without one (e.g. some guests)
  person: ContactSummary & { pid: string | null; birthdate: string | null }
  emergencyContact: { name: string | null; phone: string | null; relationship: string | null }
  allergies: string | null
  medication: string | null
  healthIssues: string | null
  dietaryRestrictions: string | null
  otherFoodInfo: string | null
  // Other adults on the same household Account, oldest first
  householdAdults: HouseholdAdult[]
}

export type HouseholdAdult = ContactSummary & {
  birthdate: string | null
  mobilePhone: string | null
  homePhone: string | null
  // npe01__PreferredPhone__c, e.g. "Mobile" or "Home"
  preferredPhone: string | null
}

export type SalesforceClient = {
  getContactByDiscordId(discordId: string): Promise<Contact | null>
  findContactByIds(hid: string, pid: string): Promise<Contact | null>
  setDiscordId(contactId: string, discordId: string): Promise<void>
  // Status of the contact's CampaignMember row, or null when there isn't one
  getCampaignStatus(contactId: string, campaignId: string): Promise<string | null>
  // Contacts whose display name or full name contains the text
  searchContacts(text: string, limit: number): Promise<ContactSummary[]>
  // null when no contact has that Id
  getEmergencyInfo(contactId: string): Promise<EmergencyInfo | null>
}

const CURRENT_STATUSES = new Set(['Current', 'Grace Period'])

export function isCurrentMember(contact: Pick<Contact, 'membershipStatus'>): boolean {
  return contact.membershipStatus !== null && CURRENT_STATUSES.has(contact.membershipStatus)
}

export function escapeSoql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

// For use inside a quoted LIKE pattern: also escapes the % and _ wildcards
export function escapeSoqlLike(value: string): string {
  return escapeSoql(value).replace(/[%_]/g, (c) => `\\${c}`)
}

export function fullName(contact: Pick<Contact, 'firstName' | 'lastName'>): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ')
}

// Whole years from a Salesforce date (YYYY-MM-DD) to `now`, in local time;
// null when the date is missing or malformed
export function ageFromBirthdate(birthdate: string | null, now: Date = new Date()): number | null {
  const m = birthdate?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  let age = now.getFullYear() - year
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age--
  return age
}

// Same rule as the member portal: an unknown birthdate counts as an adult
export function isAdult(birthdate: string | null, now: Date = new Date()): boolean {
  const age = ageFromBirthdate(birthdate, now)
  return age === null || age >= 18
}

// Salesforce Contact Ids: 15 or 18 characters starting with the 003 prefix
export function isContactId(value: string): boolean {
  return /^003[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?$/.test(value)
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

type SummaryRow = {
  Id: string
  FirstName: string | null
  LastName: string | null
  TFI_Display_Name_for_Button__c: string | null
}

const SUMMARY_FIELDS = 'Id, FirstName, LastName, TFI_Display_Name_for_Button__c'

function toSummary(row: SummaryRow): ContactSummary {
  return {
    id: row.Id,
    firstName: row.FirstName,
    lastName: row.LastName,
    displayName: row.TFI_Display_Name_for_Button__c,
  }
}

type EmergencyRow = SummaryRow & {
  TFI_Personal_ID__c: string | null
  AccountId: string | null
  Birthdate: string | null
  Emergency_Name_1__c: string | null
  Emergency_Phone_1__c: string | null
  Emergency_Contact_Relationship_1__c: string | null
  Allergies__c: string | null
  Medication__c: string | null
  Health_Issues__c: string | null
  Dietary_restrictions__c: string | null
  Other_food_related_information__c: string | null
}

const EMERGENCY_FIELDS = `${SUMMARY_FIELDS}, TFI_Personal_ID__c, AccountId, Birthdate,
  Emergency_Name_1__c, Emergency_Phone_1__c, Emergency_Contact_Relationship_1__c,
  Allergies__c, Medication__c, Health_Issues__c,
  Dietary_restrictions__c, Other_food_related_information__c`

type HouseholdRow = SummaryRow & {
  Birthdate: string | null
  MobilePhone: string | null
  HomePhone: string | null
  npe01__PreferredPhone__c: string | null
}

const HOUSEHOLD_FIELDS = `${SUMMARY_FIELDS}, Birthdate, MobilePhone, HomePhone, npe01__PreferredPhone__c`

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

    async searchContacts(text, limit) {
      const sf = await getConnection()
      const pattern = `'%${escapeSoqlLike(text)}%'`
      const result = await sf.query<SummaryRow>(
        `SELECT ${SUMMARY_FIELDS} FROM Contact
         WHERE TFI_Display_Name_for_Button__c LIKE ${pattern} OR Name LIKE ${pattern}
         ORDER BY TFI_Display_Name_for_Button__c ASC NULLS LAST, LastName ASC
         LIMIT ${Math.trunc(limit)}`,
      )
      return result.records.map(toSummary)
    },

    async getEmergencyInfo(contactId) {
      const sf = await getConnection()
      const result = await sf.query<EmergencyRow>(
        `SELECT ${EMERGENCY_FIELDS} FROM Contact WHERE Id = '${escapeSoql(contactId)}' LIMIT 1`,
      )
      const row = result.records[0]
      if (!row) return null

      let householdAdults: HouseholdAdult[] = []
      if (row.AccountId) {
        const household = await sf.query<HouseholdRow>(
          `SELECT ${HOUSEHOLD_FIELDS} FROM Contact
           WHERE AccountId = '${escapeSoql(row.AccountId)}' AND Id != '${escapeSoql(row.Id)}'
           ORDER BY Birthdate ASC NULLS LAST`,
        )
        householdAdults = household.records
          .filter((r) => isAdult(r.Birthdate))
          .map((r) => ({
            ...toSummary(r),
            birthdate: r.Birthdate,
            mobilePhone: r.MobilePhone,
            homePhone: r.HomePhone,
            preferredPhone: r.npe01__PreferredPhone__c,
          }))
      }

      return {
        person: {
          ...toSummary(row),
          pid: row.TFI_Personal_ID__c,
          birthdate: row.Birthdate,
        },
        emergencyContact: {
          name: row.Emergency_Name_1__c,
          phone: row.Emergency_Phone_1__c,
          relationship: row.Emergency_Contact_Relationship_1__c,
        },
        allergies: row.Allergies__c,
        medication: row.Medication__c,
        healthIssues: row.Health_Issues__c,
        dietaryRestrictions: row.Dietary_restrictions__c,
        otherFoodInfo: row.Other_food_related_information__c,
        householdAdults,
      }
    },
  }
}
