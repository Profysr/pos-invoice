import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatMoney,
  normalizeShippingReceiptDraft,
  parseMoneyToMinorUnits,
  storedShippingReceiptToDraft
} from '../src/shared/invoice.js'

test('parses money into integer minor units', () => {
  assert.equal(parseMoneyToMinorUnits('1234'), 123400)
  assert.equal(parseMoneyToMinorUnits('1234.5'), 123450)
  assert.equal(parseMoneyToMinorUnits('.5'), 50)
  assert.equal(parseMoneyToMinorUnits('0.00'), 0)
  assert.throws(() => parseMoneyToMinorUnits('-1'), /non-negative/)
  assert.throws(() => parseMoneyToMinorUnits('1.999'), /two decimals/)
  assert.throws(() => parseMoneyToMinorUnits('abc'), /non-negative/)
})

test('formats money with the currency symbol', () => {
  assert.equal(formatMoney(1750, 'USD'), '$17.50')
  assert.equal(formatMoney(6522, 'USD'), '$65.22')
})

test('normalizes a shipping receipt draft for persistence', () => {
  const { invoice, items } = normalizeShippingReceiptDraft(
    {
      invoiceNumber: 'INV-2026-0001',
      date: '2026-08-10',
      time: '18:06',
      trackingNumber: '9201990367007536409945',
      price: '65.22',
      shippingFrom: 'DE MOSS\nDE 5800 Corporate Dr Houston\nTX 77036',
      expectedDeliveryDate: '2026-08-13',
      service: 'Prepaid Mail',
      destination: 'DANBURY CT 06810',
      weight: '14 lb 6.0 oz',
      insuranceLabel: 'Up to $100.00 included',
      insuranceAmount: '0.00',
      currency: 'usd'
    },
    'receipt-1'
  )

  assert.equal(invoice.currency, 'USD')
  assert.equal(invoice.shippingFrom, 'DE MOSS\nDE 5800 Corporate Dr Houston\nTX 77036')
  assert.equal(invoice.insuranceLabel, 'Up to $100.00 included')
  assert.equal(invoice.insurance, 0)
  assert.equal(items.length, 1)
  assert.equal(items[0].description, 'Prepaid Mail')
  assert.equal(items[0].unitPrice, 6522)
})

test('rejects incomplete shipping receipt drafts', () => {
  assert.throws(
    () =>
      normalizeShippingReceiptDraft(
        {
          invoiceNumber: '',
          date: '2026-08-10',
          time: '18:06',
          trackingNumber: '1234',
          price: '65.22',
          shippingFrom: 'DE MOSS'
        },
        'receipt-1'
      ),
    /Reference number/
  )

  assert.throws(
    () =>
      normalizeShippingReceiptDraft(
        {
          invoiceNumber: 'INV-1',
          date: '2026-08-10',
          time: '18:06',
          trackingNumber: '1234',
          price: 'abc',
          shippingFrom: 'DE MOSS'
        },
        'receipt-1'
      ),
    /Price/
  )
})

test('round-trips a stored receipt back into draft values', () => {
  const stored = {
    invoiceNumber: 'INV-2026-0001',
    invoiceDate: '2026-08-10',
    invoiceTime: '18:06',
    currency: 'USD',
    trackingNumber: '9201990367007536409945',
    subtotal: 6522,
    insurance: 0,
    shippingFrom: 'DE MOSS',
    expectedDeliveryDate: '2026-08-13',
    shippingService: 'Prepaid Mail',
    destinationAddress: 'DANBURY CT 06810',
    packageWeight: '14 lb 6.0 oz',
    insuranceLabel: 'Up to $100.00 included'
  }

  const draft = storedShippingReceiptToDraft(stored)
  assert.equal(draft.price, '65.22')
  assert.equal(draft.trackingNumber, '9201990367007536409945')
  assert.equal(draft.shippingFrom, 'DE MOSS')
  assert.equal(draft.insuranceAmount, '0.00')
})
