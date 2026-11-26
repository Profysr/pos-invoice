import assert from 'node:assert/strict'
import test from 'node:test'
import { renderReceiptTemplate, RECEIPT_TEMPLATE } from '../src/shared/receipt.js'
import { encodeEscPos, profiles } from 'retail-print-kit'
import { makeReceiptData } from '../src/shared/invoice.js'

const receipt = {
  senderName: 'DE MOSS',
  senderStreet: '5800 Corporate Dr',
  senderCity: 'Houston',
  senderState: 'TX',
  senderZip: '77036',
  invoiceDate: '2026-08-10',
  invoiceTime: '18:06',
  trackingNumber: '9201990367007536409945',
  subtotal: 6522,
  shippingService: 'Prepaid Mail',
  expectedDeliveryDate: '2026-08-13',
  destinationCity: 'DANBURY',
  destinationState: 'CT',
  destinationZip: '06810',
  currency: 'USD'
}

const printer = { characterWidth: 42, paperWidthMm: 80 }

function opsText(ops) {
  return ops
    .filter((op) => op.kind === 'text')
    .map((op) => op.text.replace(/\n$/, ''))
}

function render(receiptData, printerOverride) {
  return renderReceiptTemplate(receiptData, printerOverride || printer)
}

test('renders the full shipping receipt with all sections', () => {
  const ops = render(makeReceiptData(receipt))
  const text = opsText(ops)

  assert.ok(text.some((t) => t.includes('5800 Corporate Dr')), 'sender address present')
  assert.ok(text.some((t) => t.includes('8/10/2026')), 'date present')
  assert.ok(text.some((t) => t.includes('6:06 PM') || t.includes('18:06')), 'time present')
  assert.ok(text.some((t) => t.includes('Product')), 'table header present')
  assert.ok(text.some((t) => t.includes('Prepaid Mail')), 'product present')
  assert.ok(text.some((t) => t.includes('DANBURY')), 'destination present')
  assert.ok(text.some((t) => t.includes('Expected Delivery Date:')), 'delivery present')
  assert.ok(text.some((t) => t.includes('Tracking #:')), 'tracking present')
  assert.ok(text.some((t) => t.includes('Up to $100.00 included')), 'fixed insurance present')
  assert.ok(text.some((t) => t.includes('$0.00')), 'fixed insurance amount present')
  assert.ok(text.some((t) => t.includes('$65.22')), 'total present')
  assert.ok(text.some((t) => t.includes('Text your tracking number to 28777')), 'footer present')

  const insuranceIndex = text.findIndex((t) => t.includes('Up to $100.00 included'))
  const totalIndex = text.findIndex((t) => t.includes('Total'))
  assert.ok(insuranceIndex >= 0 && insuranceIndex < totalIndex, 'insurance is printed before Total')
})

test('date and time render on one row: date left, time right', () => {
  const ops = render(makeReceiptData(receipt))
  const text = opsText(ops)
  const dateTimeIndex = text.findIndex((t) => t.includes('8/10/2026'))
  assert.ok(dateTimeIndex >= 0, 'date/time row present')
  const row = text[dateTimeIndex]
  assert.ok(row.startsWith('Mon 08/10/2026'), 'date starts the row: ' + JSON.stringify(row))
  assert.ok(row.endsWith('6:06 PM') || row.endsWith('18:06'), 'time ends the row: ' + JSON.stringify(row))
})

test('table columns align to reference positions', () => {
  const ops = render(makeReceiptData(receipt))
  const text = opsText(ops)
  const header = text.find((t) => t.includes('Product'))
  assert.ok(header, 'header row present')
  assert.ok(header.startsWith('Product'), 'Product starts at left edge: ' + JSON.stringify(header))
  assert.ok(header.includes('Qty'), 'Qty column present')
  assert.ok(header.includes('Unit'), 'Unit Price column present')
  assert.ok(header.endsWith('Price'), 'Price ends the row: ' + JSON.stringify(header))
})

test('shipment section indentation matches reference levels', () => {
  const ops = render(makeReceiptData(receipt))
  const text = opsText(ops)
  const dest = text.find((t) => t.includes('DANBURY'))
  assert.ok(dest, 'destination present')
  assert.ok(dest.startsWith('  DANBURY'), 'destination indented ~2 spaces: ' + JSON.stringify(dest))
})

test('encodes to valid ESC/POS bytes for the 80 mm generic profile', () => {
  const ops = render(makeReceiptData(receipt))
  const bytes = encodeEscPos(ops, profiles['generic-escpos'])
  assert.ok(Buffer.isBuffer(bytes))
  assert.ok(bytes.length > 0)
  assert.ok(bytes.toString('latin1').includes('Prepaid Mail'))
})

test('omits optional shipping details while keeping fixed insurance', () => {
  const ops = render(
    makeReceiptData({ ...receipt, destinationCity: '', destinationState: '', destinationZip: '' })
  )
  const text = opsText(ops)
  assert.ok(!text.some((t) => t.includes('DANBURY')), 'destination omitted')
  assert.ok(text.some((t) => t.includes('Up to $100.00 included')), 'fixed insurance kept')
  assert.ok(text.some((t) => t.includes('$0.00')), 'fixed insurance amount kept')
})

test('keeps the fixed insurance row on one line at supported paper widths', () => {
  for (const characterWidth of [32, 42, 48]) {
    const text = opsText(
      render(makeReceiptData(receipt), { characterWidth, paperWidthMm: 80 })
    )
    assert.ok(
      text.some((t) => t.includes('Up to $100.00 included') && t.includes('$0.00')),
      `insurance row is not on one line at ${characterWidth} columns`
    )
  }
})

test('wraps long product descriptions to the printer width', () => {
  const ops = render(
    makeReceiptData({ ...receipt, shippingService: 'A very long shipping service description that exceeds the line width' })
  )
  const lines = ops
    .filter((op) => op.kind === 'text')
    .flatMap((op) => op.text.replace(/\n$/, '').split('\n'))
  assert.ok(lines.some((t) => t.includes('very long')), 'long product text rendered')
})

test('maps a single stored line item onto the table columns', () => {
  const ops = render(makeReceiptData(receipt))
  const text = opsText(ops)
  const row = text.find((t) => t.includes('Prepaid Mail'))
  assert.ok(row, 'product description rendered')
  assert.ok(row.includes('$65.22'), `price rendered as money: ${JSON.stringify(row)}`)
  assert.equal(row.match(/\$65\.22/g)?.length, 1, 'unit price column is empty')
})

test('uses 58 mm profile when paper width is 58', () => {
  const ops = render(makeReceiptData(receipt), { characterWidth: 32, paperWidthMm: 58 })
  const bytes = encodeEscPos(ops, profiles['generic-escpos-58'])
  assert.ok(Buffer.isBuffer(bytes))
  assert.ok(bytes.length > 0)
})

test('template constant has version 1 and blocks', () => {
  assert.equal(RECEIPT_TEMPLATE.version, 1)
  assert.ok(Array.isArray(RECEIPT_TEMPLATE.blocks))
  assert.ok(RECEIPT_TEMPLATE.blocks.length > 0)
})
