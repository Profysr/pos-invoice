const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Parse "yyyy-mm-dd" without the UTC shift that new Date('2026-11-10') causes.
export function parseLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim())
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

// "2026-08-10" -> "Mon 08/10/2026"
export function formatReceiptDate(value) {
  const date = parseLocalDate(value)
  if (!date) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${WEEKDAYS[date.getDay()]} ${month}/${day}/${date.getFullYear()}`
}

// "18:06" -> "6:06 PM"
export function formatReceiptTime(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim())
  if (!match) return ''
  const hours = Number(match[1])
  if (hours > 23) return ''
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${match[2]} ${suffix}`
}

// "9201990367007536409945" -> "9201 9903 6700 7536 4099 45"
export function groupTrackingNumber(value) {
  const text = String(value ?? '').trim()
  if (!text || !/^\d+$/.test(text)) return text
  return text.replace(/(\d{4})(?=\d)/g, '$1 ')
}
