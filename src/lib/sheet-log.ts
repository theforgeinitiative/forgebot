// Storage unlock audit log: one row per issued PIN, appended to a Google
// Sheet. Optional — when the sheet or credentials aren't configured, unlocks
// still work and logging is skipped with a warning.
import { auth as googleAuth, sheets as sheetsApi } from '@googleapis/sheets'
import type { Contact } from './salesforce.ts'
import { formatLogTimestamp } from './time.ts'

export type SheetLog = {
  storageUnlock(contact: Contact, unit: string): Promise<void>
}

export function storageUnlockRow(contact: Contact, unit: string, at: Date): string[] {
  return [formatLogTimestamp(at), unit, contact.firstName ?? '', contact.lastName ?? '', contact.id]
}

export type SheetLogOptions = {
  sheetId: string | undefined
  sheetName: string
  serviceAccountJson: string | undefined
}

export function createSheetLog(opts: SheetLogOptions): SheetLog {
  if (!opts.sheetId || !opts.serviceAccountJson) {
    console.warn('[sheet-log] STORAGE_LOG_SHEET_ID or GOOGLE_SERVICE_ACCOUNT_JSON unset; unlocks will not be logged')
    return { async storageUnlock() {} }
  }

  const auth = new googleAuth.GoogleAuth({
    credentials: JSON.parse(opts.serviceAccountJson),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  const api = sheetsApi({ version: 'v4', auth })
  const spreadsheetId = opts.sheetId

  return {
    async storageUnlock(contact, unit) {
      await api.spreadsheets.values.append({
        spreadsheetId,
        range: opts.sheetName,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [storageUnlockRow(contact, unit, new Date())] },
      })
    },
  }
}
