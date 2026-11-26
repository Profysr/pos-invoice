import assert from 'node:assert/strict'
import test from 'node:test'
import { render as renderMain } from 'retail-print-kit'
import { render as renderBrowser } from 'retail-print-kit/browser'
import {
  buildReceiptDocument,
  buildReceiptPreviewHtml,
  RECEIPT_TEMPLATE,
  buildReceiptViewModel
} from '../src/shared/receipt.js'

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

function textOps(ops) {
  return ops.filter((op) => op.kind === 'text')
}

test('buildReceiptDocument returns data, profile and lifecycle-wrapped ops', () => {
  const { data, profile, ops } = buildReceiptDocument({ receipt, company, printer })
  assert.ok(data.items.length >= 1, 'view model built')
  assert.ok(profile.columns.a > 0, 'profile built')
  assert.deepEqual(ops[0], { kind: 'init' }, 'document starts with ESC @')
  const cut = ops.at(-1)
  assert.equal(cut.kind, 'cut', 'document ends with a cut')
  assert.equal(cut.partial, false)
  assert.equal(cut.feed, 3)
})

test('the product marker never reaches the ops; product names become bold ops', () => {
  const { ops } = buildReceiptDocument({ receipt, company, printer })
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
    receipt: {
      ...receipt,
      items: [
        { id: 'i1', position: 0, description: 'First Item', quantityMilli: 1000, unitPrice: 1000, lineTotal: 1000 },
        { id: 'i2', position: 1, description: 'Second Item', quantityMilli: 2000, unitPrice: 500, lineTotal: 1000 }
      ]
    },
    company,
    printer
  })
  const text = textOps(ops)
    .map((op) => op.text)
    .join('\n')
  assert.ok(!text.includes('First Item@'), 'first marker stripped')
  assert.ok(!text.includes('Second Item@'), 'second marker stripped')
  for (const product of ['First Item', 'Second Item']) {
    const index = ops.findIndex((op) => op.kind === 'text' && op.text === product)
    assert.ok(index > 0, `${product} present`)
    assert.deepEqual(ops[index - 1], { kind: 'style', style: { bold: true, underline: 0 } })
  }
})

test('sanitization runs on every text op before output', () => {
  const { ops } = buildReceiptDocument({
    receipt: { ...receipt, shippingFrom: 'A\u00a0B “C”\x07×7' },
    company,
    printer
  })
  const text = textOps(ops)
    .map((op) => op.text)
    .join('\n')
  assert.ok(!text.includes('\u00a0'), 'non-breaking space normalized')
  assert.ok(!text.includes('\u201c'), 'curly quotes normalized')
  assert.ok(!text.includes('\x07'), 'control characters stripped')
  assert.ok(text.includes('A B "C"x7'), 'sanitized line present: ' + JSON.stringify(text.slice(0, 80)))
})

test('the template logo renders as init, explicit alignment, then raster ops', () => {
  const { ops } = buildReceiptDocument({ receipt, company, printer })
  assert.deepEqual(ops[0], { kind: 'init' })
  assert.deepEqual(ops[1], { kind: 'align', align: 'center' }, 'alignment comes from the image block')
  const raster = ops[2]
  assert.equal(raster.kind, 'raster')
  assert.equal(raster.width, RECEIPT_TEMPLATE.blocks[0].width, 'width comes from the image block')
  assert.equal(raster.bits.length, Math.ceil(raster.width / 8) * raster.height, 'decoded bits')
})

test('the same input produces identical operations every time', () => {
  const first = buildReceiptDocument({ receipt, company, printer })
  const second = buildReceiptDocument({ receipt, company, printer })
  assert.deepEqual(first.ops, second.ops, 'ops deterministic')
  assert.deepEqual(first.data, second.data, 'view model deterministic')
  assert.deepEqual(first.profile, second.profile, 'profile deterministic')
})

test('browser and main-process renders produce identical operations', () => {
  const [data, profile] = buildReceiptViewModel(receipt, company, printer)
  assert.deepEqual(
    renderBrowser(RECEIPT_TEMPLATE, data, profile),
    renderMain(RECEIPT_TEMPLATE, data, profile),
    'retail-print-kit browser and main entries must agree op-for-op'
  )
})

test('preview HTML derives from the same ops as the printer', () => {
  const { ops, profile } = buildReceiptDocument({ receipt, company, printer })
  const html = buildReceiptPreviewHtml({ ops, profile })
  assert.match(html, /^<!doctype html>/i, 'complete document')
  assert.ok(html.includes('Prepaid Mail'), 'product visible in preview')
  assert.ok(html.includes('font-weight:bold'), 'bold styling carried into preview')
  assert.ok(!html.includes('Prepaid Mail@'), 'marker never reaches preview')
  assert.ok(html.includes('data:image/png;base64,'), 'template logo carried into preview')
})
