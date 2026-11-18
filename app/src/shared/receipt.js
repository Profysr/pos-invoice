import { formatReceiptDate, formatReceiptTime, groupTrackingNumber } from './dates.js'
import { formatMoney } from './invoice.js'

const FOOTER_TRACKING =
  'Text your tracking number to 28777 (2USPS) to get the latest status.Standard Message and Date Rates may apply.You may also visit www.usps.com USPS Tracking or call 1-800-222-1811.'
const FOOTER_INSURANCE =
  'Save this receipt as evidence of insurance. For information on filing an insurance claim go to https://www.usps.com/help/claims.html or call 1-800-222-1811.'

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

function formatColumns(left, right, width) {
  const rightText = String(right ?? '')
  const leftText = String(left ?? '')
  if (rightText.length >= width) return rightText.slice(-width)
  const leftWidth = Math.max(0, width - rightText.length - 1)
  return `${leftText.slice(0, leftWidth).padEnd(leftWidth)} ${rightText}`
}

// Product | Qty | Unit Price | Price, padded for the printer's character grid.
function formatTableRow(cells, width) {
  const productEnd = Math.round(width * 0.4)
  const qtyEnd = Math.max(productEnd + 5, Math.round(width * 0.5))
  const unitEnd = Math.max(qtyEnd + 10, Math.round(width * 0.8))
  const part = (value, from, to, align) => {
    const size = Math.max(0, to - from)
    const text = String(value ?? '').slice(0, size)
    return align === 'right' ? text.padStart(size) : text.padEnd(size)
  }
  return (
    part(cells[0], 0, productEnd, 'left') +
    part(cells[1], productEnd, qtyEnd, 'right') +
    part(cells[2], qtyEnd, unitEnd, 'right') +
    part(cells[3], unitEnd, width, 'right')
  ).trimEnd()
}

function optionalLine(lines, text, align = 'left', bold = false) {
  const value = String(text ?? '').trim()
  if (value) lines.push({ text: value, align, bold })
}

/**
 * Shipping receipt template (single template for the whole app).
 *
 * Canonical line model consumed by the live preview, the ESC/POS encoder and
 * the Windows system-print path:
 * - { text, align: 'left'|'center'|'right', bold }
 * - { type: 'divider', character }  dashed rule
 * - { type: 'logo' } the logo raster, resolved by each consumer
 */
export function buildShippingReceiptLines({ receipt = {}, company = {}, printer = {} }) {
  const width = Math.max(24, Number(printer.characterWidth) || 48)
  const currency = receipt.currency || company.defaultCurrency || 'USD'
  const money = (minorUnits) => formatMoney(minorUnits, currency)
  const price = Number(receipt.subtotal) || 0
  const insurance = Number(receipt.insurance) || 0
  const total = price + insurance
  const lines = []

  if (company.logoPath || company.logoDataUrl) lines.push({ type: 'logo' })

  for (const line of String(receipt.shippingFrom ?? '').split('\n')) {
    optionalLine(lines, line.trim(), 'center')
  }

  // Header section ends here — one blank line before the body.
  lines.push({ text: '', align: 'left' })
  // lines.push({ type: 'divider', character: '-' })
  lines.push({
    text: formatColumns(
      formatReceiptDate(receipt.invoiceDate),
      formatReceiptTime(receipt.invoiceTime),
      width
    ),
    align: 'left'
  })
  lines.push({ type: 'divider', character: '-' })
  lines.push({
    text: formatTableRow(['Product', 'Qty', 'Unit Price', 'Price'], width),
    align: 'left',
    bold: true
  })
  lines.push({ type: 'divider', character: '-' })

  lines.push({
    text: formatTableRow(
      [receipt.shippingService || 'Prepaid Mail', '1', '', money(price)],
      width,
    ),
    align: 'left'
  })

  // Space between the shipped item row and the delivery details.
  lines.push({ text: '', align: 'left' })

  optionalLine(lines, receipt.destinationAddress ? `  ${receipt.destinationAddress}` : '')
  optionalLine(lines, receipt.packageWeight ? `  Weight: ${receipt.packageWeight}` : '')

  lines.push({ text: 'Expected Delivery Date:', align: 'left' })
  optionalLine(lines, formatReceiptDate(receipt.expectedDeliveryDate) ? `  ${formatReceiptDate(receipt.expectedDeliveryDate)}` : '')
  lines.push({ text: 'Tracking #:', align: 'left' })
  optionalLine(lines, groupTrackingNumber(receipt.trackingNumber) ? `  ${groupTrackingNumber(receipt.trackingNumber)}` : '')

  lines.push({ text: '', align: 'left' })
  if (receipt.insuranceLabel || insurance > 0) {
    lines.push({
      text: formatColumns(receipt.insuranceLabel || 'Insurance', money(insurance), width),
      align: 'left'
    })
  }

  // Space between the shipped item row and the totals block.
  // lines.push({ text: '', align: 'left' })
  lines.push({ text: formatColumns('Total', money(total), width), align: 'left' })
  lines.push({ type: 'divider', character: '-' })
  lines.push({
    text: formatColumns('Grand Total:', money(total), width),
    align: 'left',
    bold: true
  })
  lines.push({ type: 'divider', character: '-' })
  // Footer section starts after a blank line.
  lines.push({ text: '', align: 'left' })

  for (const paragraph of [FOOTER_TRACKING, FOOTER_INSURANCE]) {
    for (const text of wrapText(paragraph, width)) {
      lines.push({ text, align: 'center' })
    }
    lines.push({ text: '', align: 'left' })
  }

  return lines
}
