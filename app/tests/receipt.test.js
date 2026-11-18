import assert from 'node:assert/strict'
import test from 'node:test'
import { buildShippingReceiptLines, wrapText } from '../src/shared/receipt.js'

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

function build(overrides = {}) {
  return buildShippingReceiptLines({
    receipt: { ...receipt, ...overrides },
    company: { name: 'Example', logoPath: 'C:/logo.png' },
    printer: { characterWidth: 42, paperWidthMm: 80 }
  })
}

test('wraps long receipt text to the configured character width', () => {
  const lines = wrapText('one two three four five six seven eight nine ten', 12)
  assert.ok(lines.length > 1)
  assert.ok(lines.every((line) => line.length <= 12))
})

test('builds the shipping receipt template', () => {
  const lines = build()
  const text = lines.map((line) => line.text ?? '').join('\n')

  assert.ok(lines.some((line) => line.type === 'logo'))
  // Header rule was replaced by a blank line; four section rules remain.
  assert.ok(lines.filter((line) => line.type === 'divider').length >= 4)
  // Section spacing: blank lines around header, body and footer blocks.
  assert.ok(
    lines.filter((line) => line.text === '').length >= 4,
    'expected blank lines between receipt sections'
  )
  assert.match(text, /DE MOSS/)
  assert.match(text, /Mon 08\/10\/2026/)
  assert.match(text, /6:06 PM/)
  assert.match(text, /Product\s+Qty\s+Unit Price\s+Price/)
  assert.match(text, /Prepaid Mail\s+1\s+\$65\.22/)
  assert.match(text, /DANBURY CT 06810/)
  assert.match(text, /Weight: 14 lb 6\.0 oz/)
  assert.match(text, /Expected Delivery Date:/)
  assert.match(text, /Thu 08\/13\/2026/)
  assert.match(text, /Tracking #:/)
  assert.match(text, /9201 9903 6700 7536 4099 45/)
  assert.match(text, /Up to \$100\.00 included\s+\$0\.00/)
  assert.match(text, /Total\s+\$65\.22/)
  assert.match(text, /Grand Total:\s+\$65\.22/)
  assert.match(text, /Text your tracking number to 28777/)
  assert.match(text, /Save this receipt as evidence of/)
  assert.match(text, /insurance claim go to/)
})

test('keeps every printed line inside the printer character width', () => {
  const lines = build({ shippingFrom: 'DE MOSS\nDE 5800 Corporate Dr Houston\nTX 77036' })
  for (const line of lines) {
    if (line.type) continue
    assert.ok(line.text.length <= 42, `line too long: ${line.text}`)
  }
})

test('omits optional shipping details that are not filled in', () => {
  const lines = build({
    destinationAddress: '',
    packageWeight: '',
    insuranceLabel: '',
    insurance: 0
  })
  const text = lines.map((line) => line.text ?? '').join('\n')

  assert.doesNotMatch(text, /Weight:/)
  assert.doesNotMatch(text, /DANBURY/)
  assert.doesNotMatch(text, /Up to \$100\.00/)
})
