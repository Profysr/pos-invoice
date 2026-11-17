import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateInvoiceTotals,
  calculateLineTotal,
  formatMoney,
  formatQuantityMilli,
  normalizeInvoiceDraft,
  parseMoneyToMinorUnits,
  parseQuantityToMilli
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

test('parses decimal quantities into scaled integers', () => {
  assert.equal(parseQuantityToMilli('1'), 1000)
  assert.equal(parseQuantityToMilli('1.25'), 1250)
  assert.equal(parseQuantityToMilli('.5'), 500)
  assert.throws(() => parseQuantityToMilli('0'), /greater than zero/)
  assert.throws(() => parseQuantityToMilli('1.2345'), /three decimals/)
})

test('calculates line and invoice totals with explicit rounding', () => {
  assert.equal(calculateLineTotal(1500, 1000), 1500)
  assert.equal(calculateLineTotal(1250, 999), 1249)

  const totals = calculateInvoiceTotals(
    [
      { quantityMilli: 1500, unitPrice: 1000 },
      { quantityMilli: 1000, unitPrice: 250 }
    ],
    250
  )

  assert.equal(totals.subtotal, 1750)
  assert.equal(totals.insurance, 250)
  assert.equal(totals.total, 2000)
  assert.equal(totals.items[0].lineTotal, 1500)
})

test('formats money and quantities for receipt display', () => {
  assert.equal(formatMoney(1750, 'USD'), 'USD 17.50')
  assert.equal(formatQuantityMilli(1000), '1')
  assert.equal(formatQuantityMilli(1250), '1.25')
  assert.equal(formatQuantityMilli(1050), '1.05')
})

test('normalizes a complete invoice draft for persistence', () => {
  const result = normalizeInvoiceDraft(
    {
      invoiceNumber: 'INV-2026-0001',
      invoiceDate: '2026-11-17',
      invoiceTime: '10:30',
      customerName: 'Bilal Ahmad',
      customerPhone: '+92 300',
      customerAddress: 'Lahore',
      currency: 'pkr',
      insurance: '25.00',
      shippingService: 'TCS',
      destinationAddress: 'Islamabad',
      packageWeight: '2 kg',
      expectedDeliveryDate: '2026-11-18',
      trackingNumber: 'TRACK-1',
      notes: 'Handle carefully',
      items: [
        { id: 'item-1', description: 'LED bulb', qty: '4', unitPrice: '450.00' },
        { id: 'item-2', description: 'Cord', qty: '1', unitPrice: '1250' }
      ]
    },
    'invoice-1'
  )

  assert.equal(result.invoice.currency, 'PKR')
  assert.equal(result.invoice.insurance, 2500)
  assert.equal(result.items[0].quantityMilli, 4000)
  assert.equal(result.items[0].unitPrice, 45000)
  assert.equal(result.items[1].unitPrice, 125000)
})

test('rejects incomplete invoice drafts', () => {
  assert.throws(
    () =>
      normalizeInvoiceDraft(
        {
          invoiceNumber: '',
          invoiceDate: '2026-11-17',
          invoiceTime: '10:30',
          customerName: 'Bilal',
          currency: 'USD',
          items: []
        },
        'invoice-1'
      ),
    /Customer name|Invoice number|at least one/
  )
})
