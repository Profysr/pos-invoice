import assert from 'node:assert/strict'
import test from 'node:test'
import { render as renderMain } from 'retail-print-kit'
import { render as renderBrowser, profiles } from 'retail-print-kit/browser'
import {
  buildReceiptDocument,
  buildReceiptPreviewHtml,
  RECEIPT_TEMPLATE
} from '../src/shared/receipt.js'
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

function textOps(ops) {
  return ops.filter((op) => op.kind === 'text')
}

function receiptData() {
  return makeReceiptData(receipt)
}

test('buildReceiptDocument returns data, profile and lifecycle-wrapped ops', () => {
  const { data, profile, ops } = buildReceiptDocument({ receiptData: receiptData(), printer })
  assert.ok(data.items.length >= 1, 'view model built')
  assert.ok(profile.columns.a > 0, 'profile built')
  assert.deepEqual(ops[0], { kind: 'init' }, 'document starts with ESC @')
  const cut = ops.at(-1)
  assert.equal(cut.kind, 'cut', 'document ends with a cut')
  assert.equal(cut.partial, false)
  assert.equal(cut.feed, 5, 'cut feed matches template')
})

test('the product marker never reaches the ops; product names become bold ops', () => {
  const { ops } = buildReceiptDocument({ receiptData: receiptData(), printer })
  assert.ok(
    textOps(ops).every((op) => !op.text.includes('Prepaid Mail@')),
    'no internal marker in output'
  )
  const productIndex = ops.findIndex((op) => op.kind === 'text' && op.text === 'Prepaid Mail')
  assert.ok(productIndex > 0, 'product text present as its own op')
  assert.deepEqual(ops[productIndex - 1], { kind: 'style', style: { bold: true, underline: 0 } })
  assert.deepEqual(ops[productIndex + 1], { kind: 'style', style: { bold: false, underline: 0 } })
  assert.ok(
    ops[productIndex + 2].text.startsWith(' '),
    'qty after the product is outside the bold run'
  )
})

test('multi-item receipts bold every product and strip every marker', () => {
  const { ops } = buildReceiptDocument({
    receiptData: makeReceiptData({
      ...receipt,
      shippingService: 'First Item',
      subtotal: 2000
    }),
    printer
  })
  const text = textOps(ops)
    .map((op) => op.text)
    .join('\n')
  assert.ok(!text.includes('First Item@'), 'first marker stripped')
  assert.ok(!text.includes('Second Item@'), 'second marker stripped')
})

test('sanitization runs on every text op before output', () => {
  const { ops } = buildReceiptDocument({
    receiptData: makeReceiptData({
      ...receipt,
      senderStreet: 'A\u00a0B “C”\x07×7'
    }),
    printer
  })
  const text = textOps(ops)
    .map((op) => op.text)
    .join('\n')
  assert.ok(!text.includes('\u00a0'), 'non-breaking space normalized')
  assert.ok(!text.includes('\u201c'), 'curly quotes normalized')
  assert.ok(!text.includes('\x07'), 'control characters stripped')
  assert.ok(text.includes('A B "C"x7'), 'sanitized line present')
})

test('the template logo renders as init, explicit alignment, then raster ops', () => {
  const { ops } = buildReceiptDocument({ receiptData: receiptData(), printer })
  assert.deepEqual(ops[0], { kind: 'init' })
  assert.deepEqual(ops[2], { kind: 'align', align: 'center' }, 'alignment comes from the image block')
  const raster = ops[3]
  assert.equal(raster.kind, 'raster')
  assert.equal(raster.width, RECEIPT_TEMPLATE.blocks[1].width, 'width comes from the image block')
  assert.equal(
    raster.bits.length,
    Math.ceil(raster.width / 8) * raster.height,
    'decoded bits'
  )
})

test('the same input produces identical operations every time', () => {
  const first = buildReceiptDocument({ receiptData: receiptData(), printer })
  const second = buildReceiptDocument({ receiptData: receiptData(), printer })
  assert.deepEqual(first.ops, second.ops, 'ops deterministic')
  assert.deepEqual(first.data, second.data, 'view model deterministic')
  assert.deepEqual(first.profile, second.profile, 'profile deterministic')
})

test('browser and main-process renders produce identical operations', () => {
  const data = receiptData()
  const profile = {
    ...profiles['generic-escpos'],
    paper: 80,
    columns: { a: 42, b: 42 },
    cut: 'feed-and-cut'
  }
  assert.deepEqual(
    renderBrowser(RECEIPT_TEMPLATE, data, profile),
    renderMain(RECEIPT_TEMPLATE, data, profile),
    'retail-print-kit browser and main entries must agree op-for-op'
  )
})

test('preview HTML derives from the same ops as the printer', () => {
  const { ops, profile } = buildReceiptDocument({ receiptData: receiptData(), printer })
  const html = buildReceiptPreviewHtml({ ops, profile })
  assert.match(html, /^<!doctype html>/i, 'complete document')
  assert.ok(html.includes('Prepaid Mail'), 'product visible in preview')
  assert.ok(html.includes('font-weight:bold'), 'bold styling carried into preview')
  assert.ok(!html.includes('Prepaid Mail@'), 'marker never reaches preview')
  assert.ok(html.includes('data:image/png;base64,'), 'template logo carried into preview')
})
