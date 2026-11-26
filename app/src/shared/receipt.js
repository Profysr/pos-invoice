import { render, opsToHtml, profiles } from 'retail-print-kit/browser'
import {
  formatReceiptDate,
  formatReceiptTime,
  groupTrackingNumber
} from './invoice.js'

export { formatReceiptDate, formatReceiptTime, groupTrackingNumber }

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
 * Render preview HTML from canonical operations via retail-print-kit.opsToHtml.
 *
 * @param {import('retail-print-kit').Op[]} ops
 * @param {object} profile
 * @returns {string} complete preview HTML string
 */
export function buildReceiptPreviewHtml({ ops, profile }) {
  return opsToHtml(ops, profile, { document: true })
}
