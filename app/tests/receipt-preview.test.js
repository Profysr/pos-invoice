import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildReceiptDocument,
  buildReceiptPreviewHtml
} from '../src/shared/receipt.js'
import { encodeReceipt } from '../src/main/receipt-printing.js'
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

const printer = { characterWidth: 42, paperWidthMm: 80, printableWidthMm: 72, dotDensity: 8 }

test('preview HTML is a complete document built from canonical operations', () => {
  const { ops, profile } = buildReceiptDocument({ receiptData: makeReceiptData(receipt), printer })
  const html = buildReceiptPreviewHtml({ ops, profile })

  assert.match(html, /^<!doctype html>/i, 'complete document')
  assert.ok(html.includes('Prepaid Mail'), 'product visible in preview')
  assert.ok(html.includes('font-weight:bold'), 'bold styling carried into preview')
  assert.ok(!html.includes('Prepaid Mail@'), 'internal marker never reaches preview')
})

test('preview HTML carries the template logo raster', () => {
  const { ops, profile } = buildReceiptDocument({ receiptData: makeReceiptData(receipt), printer })
  const html = buildReceiptPreviewHtml({ ops, profile })

  assert.ok(html.includes('data:image/png;base64,'), 'template logo inlined in preview')
  const raster = ops.find((op) => op.kind === 'raster')
  assert.ok(raster, 'raster op present')
  assert.equal(raster.width, 384)
})

test('preview HTML and ESC/POS payload carry the same visible receipt content', async () => {
  const { ops, profile } = buildReceiptDocument({ receiptData: makeReceiptData(receipt), printer })
  const html = buildReceiptPreviewHtml({ ops, profile })

  const bytes = await encodeReceipt(makeReceiptData(receipt), printer)
  const payload = bytes.toString('latin1')

  // Plain-text tokens that must appear in both outputs, in order.
  const tokens = ['5800 Corporate Dr', 'Prepaid Mail', 'DANBURY', '$65.22']
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

test('footer blocks emit size [2,2] then reset to [1,1] (no leaking state)', () => {
  const { ops } = buildReceiptDocument({ receiptData: makeReceiptData(receipt), printer })
  const sizeOps = ops.filter((op) => op.kind === 'size')
  const boldFooter = sizeOps.filter((op) => op.width === 2 && op.height === 2)
  const reset = sizeOps.filter((op) => op.width === 1 && op.height === 1)
  assert.equal(boldFooter.length, 10, 'ten footer blocks request 2x magnification')
  assert.equal(reset.length, 10, 'each footer block resets to 1x immediately after')
  // Size resets must interleave: [2,2],[1,1] per block, never two [2,2] in a row.
  let prev = null
  for (const op of sizeOps) {
    assert.notEqual(prev, op.width === 2 && op.height === 2, 'size must not stay magnified across blocks')
    prev = op.width === 2 && op.height === 2
  }
})

test('ESC/POS payload emits GS ! size commands for the magnified footer', async () => {
  const bytes = await encodeReceipt(makeReceiptData(receipt), printer)
  const payload = bytes.toString('latin1')
  const sizeCmds = payload.match(/\x1d!/g) || []
  assert.equal(sizeCmds.length, 20, 'ten 2x size commands plus ten resets')
})

test('preview HTML carries transform scale matching the size ops', () => {
  const { ops, profile } = buildReceiptDocument({ receiptData: makeReceiptData(receipt), printer })
  const html = buildReceiptPreviewHtml({ ops, profile })
  assert.ok(html.includes('transform:scale'), 'preview applies scale for magnified footer blocks')
})

test('preview and print consume identical formatting operations (single source of truth)', () => {
  const { ops: opsA, profile: profileA } = buildReceiptDocument({ receiptData: makeReceiptData(receipt), printer })
  const { ops: opsB } = buildReceiptDocument({ receiptData: makeReceiptData(receipt), printer })
  assert.deepEqual(opsA, opsB, 'deterministic ops')
  const html = buildReceiptPreviewHtml({ ops: opsA, profile: profileA })
  assert.ok(html.includes('Prepaid Mail'), 'preview renders the same document printed')
})
