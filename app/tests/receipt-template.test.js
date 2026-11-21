import assert from 'node:assert/strict'
import test from 'node:test'
import { renderReceiptTemplate, RECEIPT_TEMPLATE } from '../src/shared/receipt-template.js'
import { encodeEscPos, profiles } from 'retail-print-kit'

const receipt = {
  invoiceDate: '2026-08-10',
  invoiceTime: '18:06',
  trackingNumber: '9201990367007536409945',
  subtotal: 6522,
  insurance: 0,
  shippingFrom: 'DE MOSS\nDE 5800 Corporate Dr Houston\nTX 77036',
  expectedDeliveryDate: '2026-08-13',
  shippingService: 'Prepaid Mail',
  destinationAddress: 'DANBURY CT 06810',
  packageWeight: '14 lb 6.0 oz',
  insuranceLabel: 'Up to $100.00 included',
  currency: 'USD'
}

const company = { name: 'Example', defaultCurrency: 'USD' }
const printer = { characterWidth: 42, paperWidthMm: 80 }

function opsText(ops) {
  return ops
    .filter((op) => op.kind === 'text')
    .map((op) => op.text.replace(/\n$/, ''))
}

test('renders the full shipping receipt with all sections', () => {
  const ops = renderReceiptTemplate(receipt, company, printer)

  const text = opsText(ops)
  assert.ok(text.some((t) => t.includes('DE MOSS')), 'shipping from present')
  assert.ok(text.some((t) => t.includes('Mon 08/10/2026') || t.includes('2026-08-10')), 'date present')
  assert.ok(text.some((t) => t.includes('6:06 PM') || t.includes('18:06')), 'time present')
  assert.ok(text.some((t) => t.includes('Product')), 'table header present')
  assert.ok(text.some((t) => t.includes('Prepaid Mail')), 'product present')
  assert.ok(text.some((t) => t.includes('DANBURY CT 06810')), 'destination present')
  assert.ok(text.some((t) => t.includes('Weight: 14 lb 6.0 oz')), 'weight present')
  assert.ok(text.some((t) => t.includes('Expected Delivery Date:')), 'delivery present')
  assert.ok(text.some((t) => t.includes('Tracking #:')), 'tracking present')
  assert.ok(text.some((t) => t.includes('$65.22')), 'total present')
  assert.ok(text.some((t) => t.includes('Text your tracking number to 28777')), 'footer present')
})

test('encodes to valid ESC/POS bytes for the 80 mm generic profile', () => {
  const ops = renderReceiptTemplate(receipt, company, printer)
  const bytes = encodeEscPos(ops, profiles['generic-escpos'])
  assert.ok(Buffer.isBuffer(bytes))
  assert.ok(bytes.length > 0)
  assert.ok(bytes.toString('latin1').includes('Prepaid Mail'))
})

test('omits optional shipping details that are not filled in', () => {
  const ops = renderReceiptTemplate({
    ...receipt,
    destinationAddress: '',
    packageWeight: '',
    insuranceLabel: '',
    insurance: 0
  }, company, printer)

  const text = opsText(ops)
  assert.ok(!text.some((t) => t.includes('DANBURY')), 'destination omitted')
  assert.ok(!text.some((t) => t.includes('Weight:')), 'weight omitted')
  assert.ok(!text.some((t) => t.includes('Up to $100.00')), 'insurance label omitted')
})

test('wraps long product descriptions to the printer width', () => {
  const ops = renderReceiptTemplate({
    ...receipt,
    shippingService: 'A very long shipping service description that exceeds the line width'
  }, company, printer)

  const lines = ops.filter((op) => op.kind === 'text')
    .map((op) => op.text.replace(/\n$/, ''))
  assert.ok(lines.some((t) => t.includes('very long')), 'long product text rendered')
  assert.ok(lines.every((t) => t.length <= 42), `line exceeds width 42: ${JSON.stringify(lines.find((t) => t.length > 42))}`)
})

test('handles multiple items', () => {
  const ops = renderReceiptTemplate({
    ...receipt,
    shippingService: 'First Item',
    subtotal: 2000,
    // Exact shape returned by database.getInvoice()/mapInvoice().
    items: [
      { id: 'i1', position: 0, description: 'First Item', quantityMilli: 1000, unitPrice: 1000, lineTotal: 1000 },
      { id: 'i2', position: 1, description: 'Second Item', quantityMilli: 2000, unitPrice: 500, lineTotal: 1000 }
    ]
  }, company, {
    characterWidth: 48,
    paperWidthMm: 80
  })

  const text = opsText(ops)
  assert.ok(text.some((t) => t.includes('First Item')), 'first item present')
  assert.ok(text.some((t) => t.includes('Second Item')), 'second item present')
  assert.ok(text.some((t) => t.includes('$10.00')), 'minor units converted to money')
  assert.ok(text.some((t) => t.includes('$20.00')), 'grand total summed from items')
})

test('maps a single stored line item onto the table columns', () => {
  const ops = renderReceiptTemplate({
    ...receipt,
    subtotal: 6522,
    items: [
      { id: 'i1', position: 0, description: 'Prepaid Mail', quantityMilli: 1000, unitPrice: 6522, lineTotal: 6522 }
    ]
  }, company, printer)

  const text = opsText(ops)
  const row = text.find((t) => t.includes('Prepaid Mail'))
  assert.ok(row, 'product description rendered')
  assert.ok(row.includes('$65.22'), `unit price rendered as money: ${JSON.stringify(row)}`)
  assert.ok(!/\b6522\b/.test(row), 'raw minor units never reach the printer')
})

test('formats large amounts', () => {
  const ops = renderReceiptTemplate({
    ...receipt,
    subtotal: 1234567,
    insurance: 8900
  }, company, printer)

  const text = opsText(ops)
  assert.ok(text.some((t) => t.includes('$12,345.67')), 'large subtotal formatted')
  assert.ok(text.some((t) => t.includes('$12,434.67')), 'grand total formatted')
})

test('uses 58 mm profile when paper width is 58', () => {
  const ops = renderReceiptTemplate(receipt, company, { characterWidth: 32, paperWidthMm: 58 })
  const bytes = encodeEscPos(ops, profiles['generic-escpos-58'])
  assert.ok(Buffer.isBuffer(bytes))
  assert.ok(bytes.length > 0)
})

test('template constant has version 1 and blocks', () => {
  assert.equal(RECEIPT_TEMPLATE.version, 1)
  assert.ok(Array.isArray(RECEIPT_TEMPLATE.blocks))
  assert.ok(RECEIPT_TEMPLATE.blocks.length > 0)
})
