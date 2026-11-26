import { render, opsToHtml, profiles } from 'retail-print-kit/browser'
import { groupTrackingNumber } from './invoice.js'

export { groupTrackingNumber }

/**
 * The receipt template lives in receipt-template.json next to this module
 * (app/src/shared), so it can be edited visually at
 * https://arka162.github.io/retail-print-kit/designer/ and re-imported
 * without touching source code. All receipt layout — block order, alignment,
 * bolding, column widths, table headers and the logo image — is defined
 * there. This module only prepares the raw data values that fill {{...}}
 * placeholders and turns the rendered operations into the canonical document
 * shared by preview and printing.
 */
import RECEIPT_TEMPLATE from './receipt-template.json' with { type: 'json' }
export { RECEIPT_TEMPLATE }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Parse "yyyy-mm-dd" without the UTC shift that new Date('2026-11-10') causes.
function parseLocalDate(value) {
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

// Break text into lines of at most `width` characters, honoring hard breaks.
export function wrapText(input, width) {
  const safeWidth = Math.max(1, Number(width) || 48)
  return String(input ?? '')
    .split('\n')
    .flatMap((paragraph) => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean)
      if (words.length === 0) return ['']

      const lines = []
      let line = ''
      for (const word of words) {
        if (word.length > safeWidth) {
          if (line) lines.push(line)
          line = ''
          for (let index = 0; index < word.length; index += safeWidth) {
            lines.push(word.slice(index, index + safeWidth))
          }
          continue
        }
        if (!line) {
          line = word
          continue
        }
        if (`${line} ${word}`.length <= safeWidth) {
          line += ` ${word}`
          continue
        }
        lines.push(line)
        line = word
      }
      if (line) lines.push(line)
      return lines
    })
}

/**
 * Build the printer profile from a printer profile row.
 * MVP: 80 mm paper only, LAN printing only.
 *
 * @param {object} printer - { characterWidth, paperWidthMm, ... }
 * @returns {object} profile for retail-print-kit render()
 */
export function buildPrinterProfile(printer) {
  return {
    ...profiles['generic-escpos'],
    paper: 80,
    columns: {
      a: Number(printer?.characterWidth) || 48,
      b: Number(printer?.characterWidth) || 48
    },
    cut: 'feed-and-cut'
  }
}

/**
 * Build the single canonical receipt artifact used by both preview and printing.
 *
 * Accepts template-ready data (from makeReceiptData) and a printer profile.
 * Ops lifecycle: ESC @ init → template ops → cut.
 *
 * @param {object} receiptData - template-ready data from makeReceiptData()
 * @param {object} printer - { characterWidth, paperWidthMm, ... }
 * @returns {{ data: object, profile: object, ops: import('retail-print-kit').Op[] }}
 */
export function buildReceiptDocument({ receiptData, printer }) {
  const profile = buildPrinterProfile(printer)
  let ops = render(RECEIPT_TEMPLATE, receiptData, profile)

  // Replace the internal product-name marker (@) with bold style operations.
  ops = boldItemNamesInOps(ops, receiptData.items)

  // ESC @ initialization at the start.
  ops.unshift({ kind: 'init' })

  // Sanitize text operations so characters printers choke on never reach output.
  for (const op of ops) {
    if (op.kind === 'text') {
      op.text = sanitizeReceiptText(op.text)
    }
  }

  // End the document with a cut even if the template's own cut block is removed.
  if (ops.at(-1)?.kind !== 'cut') {
    ops.push({ kind: 'cut', partial: false, feed: 3 })
  }

  return { data: receiptData, profile, ops }
}

/**
 * Render the declarative receipt template into retail-print-kit ops, without
 * the document lifecycle wrapping (init/cut) that buildReceiptDocument adds.
 *
 * @param {object} receiptData - template-ready data from makeReceiptData()
 * @param {object} printer - { characterWidth, paperWidthMm }
 * @returns {import('retail-print-kit').Op[]}
 */
export function renderReceiptTemplate(receiptData, printer) {
  const profile = buildPrinterProfile(printer)
  return render(RECEIPT_TEMPLATE, receiptData, profile)
}

/**
 * Sanitize text for output. Strips characters thermal printers choke on
 * (non-breaking spaces, curly quotes, control characters).
 */
function sanitizeReceiptText(value) {
  return String(value ?? '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/[×]/g, 'x')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
}

/**
 * Replace the internal product-name marker (`Product@`) with bold style operations,
 * mirroring the existing print path so preview and print bold the same text.
 */
function boldItemNamesInOps(ops, items) {
  const result = [...ops]
  let searchFrom = 0
  for (const item of items) {
    const product = String(item?.name ?? item?.product ?? '')
    if (!product) continue
    const markedProduct = `${product}@`
    const index = result.findIndex(
      (op, opIndex) =>
        opIndex >= searchFrom && op.kind === 'text' && op.text.includes(markedProduct)
    )
    if (index < 0) continue
    const remainder = result[index].text.slice(markedProduct.length)
    result.splice(
      index,
      1,
      { kind: 'style', style: { bold: true, underline: 0 } },
      { kind: 'text', text: product },
      { kind: 'style', style: { bold: false, underline: 0 } },
      { kind: 'text', text: remainder }
    )
    searchFrom = index + 4
  }
  return result
}

/**
 * Render preview HTML from canonical operations via retail-print-kit.opsToHtml.
 *
 * @param {import('retail-print-kit').Op[]} ops
 * @param {object} profile
 * @returns {string} complete preview HTML string
 */
export function buildReceiptPreviewHtml({ ops, profile }) {
  return opsToHtml(ops, profile, { document: true })
}
