// Time formatting. The process runs with TZ=America/New_York (set in
// src/index.ts), so local Date getters are Eastern time. Formats match the
// Go bot's output so the DM and the unlock log sheet look the same.

const pad = (n: number) => String(n).padStart(2, '0')

function hour12(d: Date): number {
  const h = d.getHours() % 12
  return h === 0 ? 12 : h
}

const meridiem = (d: Date) => (d.getHours() < 12 ? 'AM' : 'PM')

// Go's time.Kitchen: "3:04PM"
export function formatKitchen(d: Date): string {
  return `${hour12(d)}:${pad(d.getMinutes())}${meridiem(d)}`
}

// Go layout "2006-01-02 03:04:05PM", used by the unlock log sheet
export function formatLogTimestamp(d: Date): string {
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(hour12(d))}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${meridiem(d)}`
  return `${date} ${time}`
}

// RFC 3339 with the local offset, e.g. "2026-11-16T14:00:00-05:00"
export function formatRfc3339Local(d: Date): string {
  const offset = -d.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  const tz = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${tz}`
  )
}
