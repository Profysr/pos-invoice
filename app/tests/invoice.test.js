import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildShippingReceiptFields,
  formatMoney,
  normalizeShippingReceiptDraft,
  parseMoneyToMinorUnits,
  sanitizeMoneyInput,
  storedShippingReceiptToDraft
} from '../src/shared/invoice.js'

test('sanitizes money input down to digits and two decimal places', () => {
  assert.equal(sanitizeMoneyInput('$76'), '76')
  assert.equal(sanitizeMoneyInput('1,234.56'), '1234.56')
  assert.equal(sanitizeMoneyInput('7.6.2'), '7.62')
  assert.equal(sanitizeMoneyInput('1.123'), '1.12')
  assert.equal(sanitizeMoneyInput('.5'), '.5')
  assert.equal(sanitizeMoneyInput('-1'), '')
  assert.equal(sanitizeMoneyInput('abc'), '')
})

test('parses money into integer minor units', () => {
  assert.equal(parseMoneyToMinorUnits('1234'), 123400)
  assert.equal(parseMoneyToMinorUnits('1,234.56'), 123456)
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

test('builds structured shipping fields and combines the sender contact', () => {
  const fields = buildShippingReceiptFields({
    senderName: 'DE MOSS',
    senderStreet: '5800 Corporate Dr',
    senderCity: 'Houston',
    senderState: 'TX',
    senderZip: '77036',
    senderContactArea: '800',
    senderContactPrefix: '275',
    senderContactLine: '8777',
    destCity: 'DANBURY',
    destState: 'CT',
    destZip: '06810',
    weightLb: '14',
    weightOz: '6.0'
  })

  assert.equal(fields.senderContact, '(800)275-8777')
  assert.equal(fields.shippingFrom, 'DE MOSS\n5800 Corporate Dr\nHouston\nTX 77036\n(800)275-8777')
  assert.equal(fields.destinationAddress, 'DANBURY, CT 06810')
  assert.equal(fields.packageWeight, '14 lb 6.0 oz')
})

test('clears a stored sender contact when its input parts are emptied', () => {
  const draft = storedShippingReceiptToDraft({ senderContact: '(800)275-8777' })
  draft.senderContactArea = ''
  draft.senderContactPrefix = ''
  draft.senderContactLine = ''

  const fields = buildShippingReceiptFields(draft)
  assert.equal(fields.senderContact, '')
  assert.equal(fields.shippingFrom, '')
})

test('normalizes a shipping receipt draft for persistence', () => {
  const { invoice, items } = normalizeShippingReceiptDraft(
    {
      invoiceNumber: 'INV-2026-0001',
      date: '2026-08-10',
      time: '18:06',
      trackingNumber: '9201990367007536409945',
      price: '65.22',
      senderName: 'DE MOSS',
      senderStreet: '5800 Corporate Dr',
      senderCity: 'Houston',
      senderState: 'TX',
      senderZip: '77036',
      senderContact: '(800)275-8777',
      expectedDeliveryDate: '2026-08-13',
      service: 'Priority Mail',
      destCity: 'DANBURY',
      destState: 'CT',
      destZip: '06810',
      weightLb: '14',
      weightOz: '6.0',
      insuranceLabel: 'Up to $100.00 included',
      insuranceAmount: '25.00',
      currency: 'usd'
    },
    'receipt-1'
  )

  assert.equal(invoice.currency, 'USD')
  assert.equal(invoice.senderName, 'DE MOSS')
  assert.equal(invoice.senderStreet, '5800 Corporate Dr')
  assert.equal(invoice.senderCity, 'Houston')
  assert.equal(invoice.senderState, 'TX')
  assert.equal(invoice.senderZip, '77036')
  assert.equal(invoice.senderContact, '(800)275-8777')
  assert.equal(invoice.destinationCity, 'DANBURY')
  assert.equal(invoice.destinationState, 'CT')
  assert.equal(invoice.destinationZip, '06810')
  assert.equal(invoice.destinationAddress, 'DANBURY, CT 06810')
  assert.equal(invoice.packageWeight, '14 lb 6.0 oz')
  assert.equal(invoice.shippingFrom, 'DE MOSS\n5800 Corporate Dr\nHouston\nTX 77036\n(800)275-8777')
  assert.equal(invoice.insurance, 0)
  assert.equal('insuranceLabel' in invoice, false)
  assert.equal('insuranceAmount' in invoice, false)
  assert.equal(items.length, 1)
  assert.equal(items[0].description, 'Priority Mail')
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
    senderName: 'DE MOSS',
    senderStreet: '5800 Corporate Dr',
    senderCity: 'Houston',
    senderState: 'TX',
    senderZip: '77036',
    senderContact: '(800)275-8777',
    expectedDeliveryDate: '2026-08-13',
    shippingService: 'Priority Mail',
    destinationCity: 'DANBURY',
    destinationState: 'CT',
    destinationZip: '06810',
    packageWeight: '14 lb 6.0 oz'
  }

  const draft = storedShippingReceiptToDraft(stored)
  assert.equal(draft.price, '65.22')
  assert.equal(draft.trackingNumber, '9201990367007536409945')
  assert.equal(draft.senderName, 'DE MOSS')
  assert.equal(draft.senderStreet, '5800 Corporate Dr')
  assert.equal(draft.senderCity, 'Houston')
  assert.equal(draft.senderState, 'TX')
  assert.equal(draft.senderZip, '77036')
  assert.equal(draft.senderContact, '(800)275-8777')
  assert.equal(draft.senderContactArea, '800')
  assert.equal(draft.senderContactPrefix, '275')
  assert.equal(draft.senderContactLine, '8777')
  assert.equal(draft.destCity, 'DANBURY')
  assert.equal(draft.destState, 'CT')
  assert.equal(draft.destZip, '06810')
  assert.equal(draft.weightLb, '14')
  assert.equal(draft.weightOz, '6.0')
  assert.equal('insuranceAmount' in draft, false)
})

test('splits legacy receipt fields into structured draft values', () => {
  const draft = storedShippingReceiptToDraft({
    shippingFrom: 'DE MOSS\n5800 Corporate Dr\nHouston\nTX 77036\n(800)275-8777',
    destinationAddress: 'DANBURY CT 06810',
    packageWeight: '14 lb 6.0 oz'
  })

  assert.equal(draft.senderName, 'DE MOSS')
  assert.equal(draft.senderStreet, '5800 Corporate Dr')
  assert.equal(draft.senderCity, 'Houston')
  assert.equal(draft.senderState, 'TX')
  assert.equal(draft.senderZip, '77036')
  assert.equal(draft.senderContact, '(800)275-8777')
  assert.equal(draft.senderContactArea, '800')
  assert.equal(draft.senderContactPrefix, '275')
  assert.equal(draft.senderContactLine, '8777')
  assert.equal(draft.destCity, 'DANBURY')
  assert.equal(draft.destState, 'CT')
  assert.equal(draft.destZip, '06810')
  assert.equal(draft.weightLb, '14')
  assert.equal(draft.weightOz, '6.0')
})
