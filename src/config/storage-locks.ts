// igloohome storage unit locks offered by /unlock-storage. `id` is the
// igloohome device ID, `label` is the choice shown in Discord, and `unit` is
// how the unit is named in the DM and the unlock log. Not secret; edit here
// and redeploy (then run `npm run deploy-commands`) when locks change.
export type StorageLock = {
  id: string
  label: string
  unit: string
}

export const STORAGE_LOCKS: readonly StorageLock[] = [
  { id: 'IGP119be1315', label: '1128 - Downstairs / Formerly Outside', unit: '1128' },
  { id: 'IGP119cc1cdf', label: '2099 - FTC, FLL, CCR', unit: '2099' },
  { id: 'IGP119e9474c', label: '2100 - The last of BFF', unit: '2100' },
  { id: 'IGP1194801f6', label: '2116 - Team Building, Tools', unit: '2116' },
  { id: 'IGP116a592d5', label: '2166 - Outreach, PyroTech', unit: '2166' },
  { id: 'IGP119d30d04', label: 'B2 - Apex Flex Storage', unit: 'B2' },
]

export function findLock(id: string): StorageLock | undefined {
  return STORAGE_LOCKS.find((l) => l.id === id)
}
