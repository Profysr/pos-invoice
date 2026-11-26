import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildReceiptDocument,
  buildReceiptPreviewHtml
} from '../src/shared/receipt.js'
import { encodeReceipt } from '../src/main/receipt-printing.js'

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
  currency: 'USD'
}

const company = { name: 'Example', defaultCurrency: 'USD' }
const printer = { characterWidth: 42, paperWidthMm: 80, printableWidthMm: 72, dotDensity: 8 }

test('preview HTML is a complete document built from canonical operations', () => {
  const { ops, profile } = buildReceiptDocument({ receipt, company, printer })
  const html = buildReceiptPreviewHtml({ ops, profile })

  assert.match(html, /^<!doctype html>/i, 'complete document')
  assert.ok(html.includes('Prepaid Mail'), 'product visible in preview')
  assert.ok(html.includes('font-weight:bold'), 'bold styling carried into preview')
  assert.ok(!html.includes('Prepaid Mail@'), 'internal marker never reaches preview')
})

test('preview HTML carries the template logo raster', () => {
  const { ops, profile } = buildReceiptDocument({ receipt, company, printer })
  const html = buildReceiptPreviewHtml({ ops, profile })

  assert.ok(html.includes('data:image/png;base64,'), 'template logo inlined in preview')
  const raster = ops.find((op) => op.kind === 'raster')
  assert.ok(raster, 'raster op present')
  assert.equal(raster.width, 384)
})

test('preview HTML and ESC/POS payload carry the same visible receipt content', async () => {
  const { ops, profile } = buildReceiptDocument({ receipt, company, printer })
  const html = buildReceiptPreviewHtml({ ops, profile })

  const bytes = await encodeReceipt(receipt, company, printer)
  const payload = bytes.toString('latin1')

  // Plain-text tokens that must appear in both outputs, in order.
  const tokens = ['DE MOSS', 'Prepaid Mail', 'DANBURY CT 06810', 'Weight: 14 lb 6.0 oz', '$65.22']
  let cursor = 0
  for (const token of tokens) {
    assert.ok(html.includes(token), `preview HTML missing ${token}`)
    const index = payload.indexOf(token, cursor)
    assert.ok(index >= 0, `ESC/POS payload missing ${token}`)
    cursor = index + token.length
  }

  assert.ok(!html.includes('Prepaid Mail@'), 'marker not in preview')
  assert.ok(!payload.includes('Prepaid Mail@'), 'marker not in ESC/POS')
})
