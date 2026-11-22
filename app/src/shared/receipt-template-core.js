import { formatMoney } from './invoice.js'
import { formatReceiptDate, formatReceiptTime, groupTrackingNumber } from './dates.js'
import { wrapText } from './receipt.js'
import { profiles } from 'retail-print-kit/browser'

function padCell(value, width, align) {
  const text = String(value ?? '').slice(0, width)
  const gap = width - text.length
  if (align === 'right') return ' '.repeat(gap) + text
  if (align === 'center') {
    const left = Math.floor(gap / 2)
    return ' '.repeat(left) + text + ' '.repeat(gap - left)
  }
  return text + ' '.repeat(gap)
}

/**
 * Format the table heading exactly like retail-print-kit's table renderer.
 * Keeping it as one styled value lets the heading be bold without relying on
 * per-cell styles, which retail-print-kit 0.4.0 ignores for row/table blocks.
 */
function formatTableHeader(width) {
  // Column widths tuned to the reference receipt: Product | Qty | Unit Price | Price
  const widths = [
    Math.floor(width * 0.50),
    Math.floor(width * 0.10),
    Math.floor(width * 0.24)
  ]
  widths.push(width - widths.reduce((sum, value) => sum + value, 0))

  const headers = ['Product', 'Qty', 'Unit Price', 'Price']
  const aligns = ['left', 'center', 'right', 'right']
  const wrapped = headers.map((value, index) => wrapText(value, widths[index]))
  const rowCount = Math.max(1, ...wrapped.map((lines) => lines.length))

  return Array.from({ length: rowCount }, (_, row) =>
    wrapped
      .map((lines, column) => padCell(lines[row] ?? '', widths[column], aligns[column]))
      .join('')
      .trimEnd()
  ).join('\n')
}

/** Format a label/value row on the printer's character grid. */
function formatRow(left, right, width) {
  const leftWidth = Math.floor(width * 0.8)
  const rightWidth = Math.max(1, width - leftWidth)
  return padCell(left, leftWidth, 'left') + padCell(right, rightWidth, 'right')
}

/**
 * Declarative receipt template for retail-print-kit.
 *
 * All receipt content and styling live here so the preview, LAN printer and
 * Windows printer can render the same definition. This module intentionally
 * has no retail-print-kit import so the renderer can use it safely.
 */
export const RECEIPT_TEMPLATE = {
  name: 'shipping-receipt',
  version: 1,
  kind: 'receipt',
  blocks: [
    // Shipping-from address, centered.
    { type: 'each', items: 'shippingFromLines', blocks: [
      { type: 'text', value: '{{this}}', align: 'center' },
    ]},

    // Blank line before the body.
    { type: 'newline', count: 1 },

    // Date and time: date left, time right on one row.
    { type: 'row', cells: [
      { value: '{{invoiceDate}}', align: 'LEFT', width: 0.5 },
      { value: '{{invoiceTime}}', align: 'RIGHT', width: 0.5 },
    ]},

    // Section rule.
    { type: 'line', char: '-' },

    // Table heading. It is a text block so the whole heading can be bold.
    { type: 'text', value: '{{tableHeader}}', style: 'b' },

    // Product rows.
    { type: 'table', rows: 'items', header: false, columns: [
      { value: '{{product}}', width: 0.4, align: 'LEFT' },
      { value: '{{qty}}', width: 0.12, align: 'RIGHT' },
      { value: '{{unitPrice}}', width: 0.28, align: 'RIGHT' },
      { value: '{{price}}', width: 0.2, align: 'RIGHT' },
    ]},

    // Blank line before delivery details.
    { type: 'newline', count: 1 },

    // Destination address.
    { type: 'if', when: 'destinationAddress', blocks: [
      { type: 'text', value: '  {{destinationAddress}}', align: 'left' },
    ]},

    // Package weight.
    { type: 'if', when: 'packageWeight', blocks: [
      { type: 'text', value: '  Weight: {{packageWeight}}', align: 'left' },
    ]},

    // Expected delivery date.
    { type: 'text', value: 'Expected Delivery Date:', align: 'left' },
    { type: 'if', when: 'expectedDeliveryDate', blocks: [
      { type: 'text', value: '     {{expectedDeliveryDate}}', align: 'left' },
    ]},

    // Tracking number.
    { type: 'text', value: 'Tracking #:', align: 'left', style: 'b' },
    { type: 'if', when: 'trackingNumber', blocks: [
      { type: 'text', value: '      {{trackingNumber}}', align: 'left' },
    ]},

    // Blank line before totals.
    { type: 'newline', count: 1 },

    // Fixed insurance line.
    { type: 'row', cells: [
      { value: 'Up to $100.00 included', align: 'LEFT', width: 0.8 },
      { value: '$0.00', align: 'RIGHT', width: 0.2 },
    ]},

    // Total.
    { type: 'text', value: '{{totalRow}}', align: 'left' },
    { type: 'line', char: '-' },

    // Grand total (bold).
    { type: 'text', value: '{{grandTotalRow}}', align: 'left', style: 'b' },
    { type: 'line', char: '-' },

    // Blank line before footer.
    { type: 'newline', count: 1 },

    // Footer paragraphs (centered, wrapped).
    { type: 'each', items: 'footerLines', blocks: [
      { type: 'text', value: '{{this}}', align: 'center' },
    ]},
  ],
}

/**
 * Build the view-model + profile for rendering the receipt template.
 *
 * @param {object} receipt - stored invoice, including DB-shaped `items`
 * @param {object} company
 * @param {object} printer - { characterWidth, paperWidthMm }
 * @returns {[{}, object]} [data, profile] for retail-print-kit render()
 */
export function buildReceiptViewModel(receipt, company, printer) {
  const width = Math.max(24, Number(printer.characterWidth) || 48)
  const currency = receipt.currency || company.defaultCurrency || 'USD'
  const money = (minorUnits) => formatMoney(minorUnits, currency)

  const price = Number(receipt.subtotal) || 0
  const total = price

  const shippingFromLines = String(receipt.shippingFrom ?? '').split('\n').map((line) => line.trim()).filter(Boolean)

  const product = receipt.shippingService || 'Prepaid Mail'
  const priceFormatted = money(price)
  const totalFormatted = money(total)

  // Multi-item support: use receipt.items when provided, otherwise a single shipping-service row matching the existing receipt model. Production receipts carry DB-shaped line items (description / quantityMilli / unitPrice / lineTotal, money in minor units); map them onto the columns the template renders.
  const items = Array.isArray(receipt.items) && receipt.items.length > 0
    ? receipt.items.map((item) => ({
        product: item.description || '',
        qty: String(Number((Number(item.quantityMilli) / 1000).toFixed(3))),
        unitPrice: money(item.unitPrice),
        price: money(item.lineTotal)
      }))
    : [{ product, qty: '1', unitPrice: priceFormatted, price: priceFormatted }]

  const footerLines = []
  for (const paragraph of [
    'Text your tracking number to 28777 (2USPS) to get the latest status. Standard Message and Date Rates may apply. You may also visit www.usps.com USPS Tracking or call 1-800-222-1811.',
    'Save this receipt as evidence of insurance. For information on filing an insurance claim go to https://www.usps.com/help/claims.html or call 1-800-222-1811.',
  ]) {
    for (const line of wrapText(paragraph, width)) {
      footerLines.push(line)
    }
    footerLines.push('')
  }

  const data = {
    shippingFromLines,
    invoiceDate: formatReceiptDate(receipt.invoiceDate),
    invoiceTime: formatReceiptTime(receipt.invoiceTime),
    items,
    tableHeader: formatTableHeader(width),
    destinationAddress: receipt.destinationAddress || '',
    packageWeight: receipt.packageWeight || '',
    expectedDeliveryDate: formatReceiptDate(receipt.expectedDeliveryDate),
    trackingNumber: groupTrackingNumber(receipt.trackingNumber),
    totalLabel: 'Total',
    total: totalFormatted,
    totalRow: formatRow('Total', totalFormatted, width),
    grandTotalLabel: 'Grand Total:',
    grandTotal: totalFormatted,
    grandTotalRow: formatRow('Grand Total:', totalFormatted, width),
    footerLines,
  }

  const profile = {
    ...profiles['generic-escpos'],
    paper: Number(printer.paperWidthMm) === 58 ? 58 : 80,
    columns: { a: Number(printer.characterWidth) || 48, b: Number(printer.characterWidth) || 48 },
    // Preserve existing GS V 65 feed-and-cut behavior instead of the library's default `legacy` (GS V 0/1).
    cut: 'feed-and-cut'
  }

  return [data, profile]
}
