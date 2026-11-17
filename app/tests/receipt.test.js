import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeInvoiceDraft } from '../src/shared/invoice.js'
import { buildReceiptLines, wrapText } from '../src/shared/receipt.js'

test('wraps long receipt text to the configured character width', () => {
  const lines = wrapText('one two three four five six seven eight nine ten', 12)
  assert.ok(lines.length > 1)
  assert.ok(lines.every((line) => line.length <= 12))
})

test('builds canonical receipt lines from invoice and company data', () => {
  const { invoice, items } = normalizeInvoiceDraft(
    {
      invoiceNumber: 'INV-2026-0001',
      invoiceDate: '2026-11-17',
      invoiceTime: '10:30',
      customerName: 'Bilal Ahmad',
      currency: 'USD',
      insurance: '10.00',
      notes: 'Thank you',
      items: [{ id: 'item-1', description: 'LED bulb 12W', qty: '4', unitPrice: '450.00' }]
    },
    'invoice-1'
  )

  const lines = buildReceiptLines({
    invoice: { ...invoice, items },
    company: { name: 'Ahmad Traders', phone: '+92 300' },
    printer: { characterWidth: 32, paperWidthMm: 80 }
  })

  const text = lines.map((line) => line.text).join('\n')
  assert.match(text, /Ahmad Traders/)
  assert.match(text, /INV-2026-0001/)
  assert.match(text, /Bilal Ahmad/)
  assert.match(text, /LED bulb 12W/)
  assert.match(text, /Insurance/)
  assert.match(text, /TOTAL/)
  assert.match(text, /USD 1,810\.00/)
  assert.match(text, /Thank you/)
  assert.ok(lines.every((line) => typeof line.text === 'string'))
})
