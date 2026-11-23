import assert from 'node:assert/strict'
import test from 'node:test'
import { render as renderNode } from 'retail-print-kit'
import { render as renderBrowser } from 'retail-print-kit/browser'
import {
  RECEIPT_TEMPLATE,
  buildReceiptViewModel
} from '../src/shared/receipt-template-core.js'
import {
  encodeReceipt
} from '../src/main/receipt-printing.js'
import { buildReceiptPreviewLines } from '../src/renderer/src/invoice/receipt-preview-lines.js'

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

const company = {
  name: 'Example',
  defaultCurrency: 'USD',
  logoDataUrl: 'data:image/png;base64,AA=='
}

test('browser and main-process template renders produce identical operations', () => {
  const printer = { characterWidth: 42, paperWidthMm: 80 }
  const [data, profile] = buildReceiptViewModel(receipt, company, printer)

  assert.deepEqual(
    renderBrowser(RECEIPT_TEMPLATE, data, profile),
    renderNode(RECEIPT_TEMPLATE, data, profile)
  )
})

test('supports 80 mm character grid (58 mm disabled in settings)', () => {
  for (const printer of [
    { characterWidth: 48, paperWidthMm: 80 }
  ]) {
    const preview = buildReceiptPreviewLines(receipt, company, printer)
    const [, profile] = buildReceiptViewModel(receipt, company, printer)

    assert.equal(preview.error, '')
    assert.equal(profile.paper, printer.paperWidthMm)
    for (const line of preview.lines) {
      if (line.type) continue
      assert.ok(
        line.text.length <= printer.characterWidth,
        `line exceeds ${printer.characterWidth} columns: ${JSON.stringify(line.text)}`
      )
    }
  }
})

test('preserves alignment, indentation, spacing, tables and bold sections', () => {
  const preview = buildReceiptPreviewLines(receipt, company, {
    characterWidth: 42,
    paperWidthMm: 80
  })
  const lines = preview.lines

  assert.equal(lines.find((line) => line.text === 'DE MOSS')?.align, 'center')
  assert.equal(lines.find((line) => line.text?.includes('DE 5800'))?.align, 'center')
  assert.equal(lines.find((line) => line.text === 'Tracking #:')?.bold, true)
  assert.equal(lines.find((line) => line.text?.startsWith('  DANBURY'))?.text, '  DANBURY CT 06810')
  assert.equal(lines.find((line) => line.text?.startsWith('  Weight:'))?.text, '  Weight: 14 lb 6.0 oz')
  const headerIndex = lines.findIndex((line) => line.text?.includes('Product') && line.bold)
  const productIndex = lines.findIndex((line) => line.text?.includes('Prepaid Mail'))
  assert.ok(headerIndex >= 0 && productIndex >= 0)
  assert.equal(lines[headerIndex - 1]?.type, 'divider', 'table has a top border')
  assert.equal(lines[productIndex - 1]?.type, 'divider', 'table has a bottom border')
  assert.equal(lines.filter((line) => line.tableHeader).length, 2, 'table header lines are marked')
  assert.equal(lines[productIndex].boldPrefix, 'Prepaid Mail', 'service type is marked for bolding')
  assert.ok(!lines[productIndex].text.includes('@'), 'internal service marker is removed')
  const grandTotalIndex = lines.findIndex((line) => line.text?.includes('Grand Total:'))
  assert.ok(grandTotalIndex >= 0)
  assert.equal(
    lines.slice(grandTotalIndex + 1).filter((line) => line.type === 'divider').length,
    2
  )
  assert.ok(lines.filter((line) => line.text === '').length >= 3)
  assert.ok(lines.some((line) => line.type === 'divider'))
})

test('footer lines after last divider are marked for larger styling', () => {
  const preview = buildReceiptPreviewLines(receipt, company, {
    characterWidth: 42,
    paperWidthMm: 80
  })
  const lines = preview.lines
  const footerLines = lines.filter((line) => line.footer)
  assert.deepEqual(
    footerLines.map((line) => line.text),
    [
      '',
      'Text your tracking number to 28777',
      '(2USPS) to get the latest',
      'status.Standard Message and Date',
      'Rates may apply.You may also visit',
      'www.usps.com USPS Tracking or call',
      '1-800-222-1811.',
      '',
      'Save this receipt as evidence of',
      'insurance. For information on',
      'filing an insurance claim go to',
      'https://www.usps.com/help/claims.ht',
      'm',
      'or call 1-800-222-1811.',
      ''
    ]
  )
  // All footer lines are centered and fit within 85% of the printer grid.
  assert.ok(footerLines.every((line) => line.text === '' || line.align === 'center'), 'footer lines centered')
  assert.ok(
    footerLines.every((line) => line.text.length <= Math.floor(42 * 0.85)),
    'footer lines fit within 85% of the printer width'
  )
})

test('omits optional shipping fields while keeping fixed insurance', () => {
  const preview = buildReceiptPreviewLines(
    {
      ...receipt,
      destinationAddress: '',
      packageWeight: ''
    },
    company,
    { characterWidth: 42, paperWidthMm: 80 }
  )
  const text = preview.lines.map((line) => line.text ?? '').join('\n')

  assert.doesNotMatch(text, /Weight:/)
  assert.doesNotMatch(text, /DANBURY/)
  const insurance = preview.lines.find((line) => line.text?.includes('Up to $100.00 included'))
  assert.match(insurance?.text ?? '', /^  Up to \$100\.00 included\s+\$0\.00/)
})

test('wraps long product descriptions to the printer width', () => {
  const preview = buildReceiptPreviewLines(
    {
      ...receipt,
      items: [
        {
          id: 'item-1',
          position: 0,
          description: 'A very long shipping service description that exceeds the line width',
          quantityMilli: 1000,
          unitPrice: 6522,
          lineTotal: 6522
        }
      ]
    },
    company,
    { characterWidth: 42, paperWidthMm: 80 }
  )
  const productLines = preview.lines.filter((line) => line.text?.includes('very long'))

  assert.ok(productLines.length > 0)
  assert.ok(productLines.every((line) => line.text.length <= 42))
})

test('includes the logo marker in preview and Windows print lines', () => {
  const preview = buildReceiptPreviewLines(receipt, company, {
    characterWidth: 42,
    paperWidthMm: 80
  })

  assert.equal(preview.lines[0].type, 'logo')
})

test('every visible preview line is present in the encoded ESC/POS payload', async () => {
  const printer = { characterWidth: 42, paperWidthMm: 80 }
  const preview = buildReceiptPreviewLines(receipt, {}, printer)
  const bytes = await encodeReceipt(receipt, {}, printer)
  const payload = bytes.toString('latin1')
  let cursor = 0

  for (const line of preview.lines) {
    const expected = line.type === 'divider'
      ? line.character.repeat(printer.characterWidth)
      : line.text
    if (!expected) continue
    const parts = line.boldPrefix
      ? [line.boldPrefix, line.text.slice(line.boldPrefix.length)]
      : [expected]
    for (const part of parts) {
      if (!part) continue
      const index = payload.indexOf(part, cursor)
      assert.ok(index >= 0, `encoded payload is missing ${JSON.stringify(part)}`)
      cursor = index + part.length
    }
  }
})

test('the template emits no QR, barcode or raster operations', () => {
  const preview = buildReceiptPreviewLines(receipt, company, {
    characterWidth: 42,
    paperWidthMm: 80
  })
  const [, profile] = buildReceiptViewModel(receipt, company, {
    characterWidth: 42,
    paperWidthMm: 80
  })
  const ops = renderNode(RECEIPT_TEMPLATE, buildReceiptViewModel(receipt, company, {
    characterWidth: 42,
    paperWidthMm: 80
  })[0], profile)

  assert.equal(preview.error, '')
  assert.ok(!ops.some((op) => ['qr', 'barcode', 'raster'].includes(op.kind)))
})

test('surfaces preview errors instead of falling back to another receipt layout', () => {
  const brokenReceipt = {}
  Object.defineProperty(brokenReceipt, 'subtotal', {
    get() {
      throw new Error('Receipt data is unavailable')
    }
  })

  const preview = buildReceiptPreviewLines(brokenReceipt, company, {
    characterWidth: 42,
    paperWidthMm: 80
  })

  assert.deepEqual(preview.lines, [])
  assert.match(preview.error, /Receipt data is unavailable/)
})
