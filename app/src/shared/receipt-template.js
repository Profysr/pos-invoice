import { render } from 'retail-print-kit'
import { formatMoney } from './invoice.js'
import { wrapText } from './receipt.js'

/**
 * Declarative receipt template for retail-print-kit.
 *
 * Mirrors the canonical line model in src/shared/receipt.js without replacing it:
 * - shipping-from lines (centered)
 * - blank separator
 * - date + time (left)
 * - dashed divider
 * - table header + product row
 * - blank separator
 * - optional destination / weight / delivery date / tracking
 * - optional insurance line
 * - total + grand total + dividers
 * - footer paragraphs (centered, wrapped)
 * - optional company logo image block
 *
 * Monetary values are pre-formatted with the existing formatMoney so no
 * formatting behavior is lost; this module only handles layout.
 */
export const RECEIPT_TEMPLATE = {
  name: 'shipping-receipt',
  version: 1,
  kind: 'receipt',
  blocks: [
    // Optional company logo.
    { type: 'if', when: 'logo', blocks: [
      { type: 'image', width: '{{logoWidth}}', height: '{{logoHeight}}', data: '{{logoData}}', align: 'center' },
    ]},

    // Shipping-from address, centered.
    { type: 'each', items: 'shippingFromLines', blocks: [
      { type: 'text', value: '{{this}}', align: 'center' },
    ]},

    // Blank line before the body.
    { type: 'newline', count: 1 },

    // Date and time.
    { type: 'text', value: '{{invoiceDate}} {{invoiceTime}}', align: 'left' },

    // Section rule.
    { type: 'line', char: '-' },

    // Table header.
    { type: 'table', rows: 'items', header: true, columns: [
      { value: '{{product}}', header: 'Product', width: 0.4, align: 'LEFT' },
      { value: '{{qty}}', header: 'Qty', width: 0.12, align: 'RIGHT' },
      { value: '{{unitPrice}}', header: 'Unit Price', width: 0.28, align: 'RIGHT' },
      { value: '{{price}}', header: 'Price', width: 0.2, align: 'RIGHT' },
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
      { type: 'text', value: '  {{expectedDeliveryDate}}', align: 'left' },
    ]},

    // Tracking number.
    { type: 'text', value: 'Tracking #:', align: 'left' },
    { type: 'if', when: 'trackingNumber', blocks: [
      { type: 'text', value: '  {{trackingNumber}}', align: 'left' },
    ]},

    // Blank line before totals.
    { type: 'newline', count: 1 },

    // Insurance line (only when present).
    { type: 'if', when: 'insuranceLabel', blocks: [
      { type: 'row', cells: [
        { value: '{{insuranceLabel}}', align: 'LEFT' },
        { value: '{{insurance}}', align: 'RIGHT' },
      ] },
    ]},

    // Total.
    { type: 'row', cells: [
      { value: '{{totalLabel}}', align: 'LEFT' },
      { value: '{{total}}', align: 'RIGHT' },
    ]},
    { type: 'line', char: '-' },

    // Grand total (bold).
    { type: 'row', cells: [
      { value: '{{grandTotalLabel}}', align: 'LEFT', style: 'b' },
      { value: '{{grandTotal}}', align: 'RIGHT', style: 'b' },
    ]},
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
 * @param {object} receipt
 * @param {object} company
 * @param {object} printer - { characterWidth, paperWidthMm }
 * @param {object|null} logo - { width, height, data } base64 bitmap or null
 * @returns {[{}, object, object]} [data, profile] for retail-print-kit render()
 */
export function buildReceiptViewModel(receipt, company, printer, logo = null) {
  const width = Math.max(24, Number(printer.characterWidth) || 48)
  const currency = receipt.currency || company.defaultCurrency || 'USD'
  const money = (minorUnits) => formatMoney(minorUnits, currency)

  const price = Number(receipt.subtotal) || 0
  const insurance = Number(receipt.insurance) || 0
  const total = price + insurance

  const shippingFromLines = String(receipt.shippingFrom ?? '').split('\n').map((l) => l.trim()).filter(Boolean)

  const product = receipt.shippingService || 'Prepaid Mail'
  const priceFormatted = money(price)
  const insuranceFormatted = money(insurance)
  const totalFormatted = money(total)

  // Multi-item support: use receipt.items when provided, otherwise a single
  // shipping-service row matching the existing receipt model.
  const items = Array.isArray(receipt.items) && receipt.items.length > 0
    ? receipt.items
    : [{ product, qty: '1', unitPrice: priceFormatted, price: priceFormatted }]

  const footerLines = []
  for (const paragraph of [
    'Text your tracking number to 28777 (2USPS) to get the latest status.Standard Message and Date Rates may apply. You may also visit www.usps.com USPS Tracking or call 1-800-222-1811.',
    'Save this receipt as evidence of insurance. For information on filing an insurance claim go to https://www.usps.com/help/claims.html or call 1-800-222-1811.',
  ]) {
    for (const line of wrapText(paragraph, width)) {
      footerLines.push(line)
    }
  }

  const data = {
    logo: Boolean(logo),
    logoWidth: logo ? logo.width : 0,
    logoHeight: logo ? logo.height : 0,
    logoData: logo ? logo.data : '',
    shippingFromLines,
    invoiceDate: receipt.invoiceDate || '',
    invoiceTime: receipt.invoiceTime || '',
    items,
    destinationAddress: receipt.destinationAddress || '',
    packageWeight: receipt.packageWeight || '',
    expectedDeliveryDate: receipt.expectedDeliveryDate || '',
    trackingNumber: receipt.trackingNumber || '',
    insuranceLabel: receipt.insuranceLabel || '',
    insurance: insuranceFormatted,
    totalLabel: 'Total',
    total: totalFormatted,
    grandTotalLabel: 'Grand Total:',
    grandTotal: totalFormatted,
    footerLines,
  }

  const profile = {
    id: 'generic-escpos',
    vendor: 'Generic',
    model: 'ESC/POS compatible 80 mm',
    set: 'escpos',
    paper: Number(printer.paperWidthMm) === 58 ? 58 : 80,
    dots: 576,
    columns: { a: Number(printer.characterWidth) || 48, b: Number(printer.characterWidth) || 48 },
    encoding: 'cp437',
    codepage: 0,
    cut: 'feed-and-cut',
    drawer: { on: 60, off: 120 },
    features: { nativeQr: true, raster: true, italic: false, invert: true, beep: true },
  }

  return [data, profile]
}

/**
 * Render the declarative receipt template into retail-print-kit ops.
 *
 * @param {object} receipt
 * @param {object} company
 * @param {object} printer
 * @param {object|null} logo
 * @returns {import('retail-print-kit').Op[]}
 */
export function renderReceiptTemplate(receipt, company, printer, logo = null) {
  const [data, profile] = buildReceiptViewModel(receipt, company, printer, logo)
  return render(RECEIPT_TEMPLATE, data, profile)
}
