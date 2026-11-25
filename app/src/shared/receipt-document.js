import { render, opsToHtml } from 'retail-print-kit'
import { RECEIPT_TEMPLATE, buildReceiptViewModel } from './receipt-template-core.js'
import { logoWidthDots, RECEIPT_LOGO } from './receipt-layout.js'

/**
 * Sanitize text for output. Strips characters thermal printers choke on
 * (non-breaking spaces, curly quotes, control characters).
 */
export function sanitizeReceiptText(value) {
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
    const product = String(item?.product ?? '')
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
 * Build the single canonical receipt artifact used by both preview and printing.
 *
 * Ops lifecycle: ESC @ init → [align + raster if logo] → template ops → cut.
 *
 * @param {object} receipt - stored invoice
 * @param {object} company - company metadata (may include logoDataUrl)
 * @param {object} printer - { characterWidth, paperWidthMm, printableWidthMm, dotDensity }
 * @param {object|null} logoBitmap - serialized logo bitmap { width, height, data } or null
 * @returns {{ data: object, profile: object, ops: import('retail-print-kit').Op[] }}
 */
export function buildReceiptDocument({ receipt, company, printer, logoBitmap = null }) {
  const [data, profile] = buildReceiptViewModel(receipt, company, printer)

  let ops = render(RECEIPT_TEMPLATE, data, profile)

  // Replace the internal product-name marker with bold style operations.
  ops = boldItemNamesInOps(ops, data.items)

  // ESC @ initialization at the start.
  ops.unshift({ kind: 'init' })

  // Prepend the logo raster with explicit alignment when a bitmap is provided.
  if (logoBitmap) {
    ops.splice(
      1,
      0,
      { kind: 'align', align: RECEIPT_LOGO.align },
      {
        kind: 'raster',
        width: logoBitmap.width,
        height: logoBitmap.height,
        bits: new Uint8Array(Buffer.from(logoBitmap.data, 'base64'))
      }
    )
  }

  // Sanitize text operations so characters printers choke on never reach output.
  for (const op of ops) {
    if (op.kind === 'text') {
      op.text = sanitizeReceiptText(op.text)
    }
  }

  // Automatic paper cut at the end.
  ops.push({ kind: 'cut', partial: false, feed: 3 })

  return { data, profile, ops }
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
