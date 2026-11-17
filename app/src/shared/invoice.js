const MONEY_PATTERN = /^(\d*)(?:\.(\d{1,2}))?$/

function requiredText(value, field) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error(`${field} is required`)
  return text
}

function optionalText(value, field) {
  if (value == null) return ''
  if (typeof value !== 'string') throw new Error(`${field} must be text`)
  return value.trim()
}

export function parseMoneyToMinorUnits(value, field = 'Amount') {
  const text = String(value ?? '')
    .trim()
    .replace(/,/g, '')
  const match = MONEY_PATTERN.exec(text)
  if (!match || (!match[1] && !match[2])) {
    throw new Error(`${field} must be a non-negative amount with up to two decimals`)
  }

  const whole = match[1] || '0'
  const fraction = (match[2] || '').padEnd(2, '0')
  const minorUnits = Number(whole) * 100 + Number(fraction)
  if (!Number.isSafeInteger(minorUnits)) throw new Error(`${field} is too large`)
  return minorUnits
}

export function formatMoney(minorUnits, currency = 'USD', locale = 'en-US') {
  const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : 'USD'
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: safeCurrency,
      currencyDisplay: 'symbol'
    })
      .format(minorUnits / 100)
      .replace(/[\u00a0\u202f]/g, ' ')
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${safeCurrency}`
  }
}

export function normalizeShippingReceiptDraft(values, id) {
  const invoice = {
    id: requiredText(id, 'Receipt id'),
    invoiceNumber: requiredText(values?.invoiceNumber, 'Reference number'),
    invoiceDate: requiredText(values?.date, 'Date'),
    invoiceTime: requiredText(values?.time, 'Time'),
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerAddress: '',
    currency: requiredText(values?.currency ?? 'USD', 'Currency').toUpperCase(),
    insurance:
      values?.insuranceAmount == null || String(values.insuranceAmount).trim() === ''
        ? 0
        : parseMoneyToMinorUnits(values.insuranceAmount, 'Insurance amount'),
    shippingService: optionalText(values?.service, 'Shipping service'),
    destinationAddress: optionalText(values?.destination, 'Destination'),
    packageWeight: optionalText(values?.weight, 'Weight'),
    expectedDeliveryDate: optionalText(values?.expectedDeliveryDate, 'Expected delivery'),
    trackingNumber: requiredText(values?.trackingNumber, 'Tracking number'),
    notes: '',
    shippingFrom: requiredText(values?.shippingFrom, 'Shipping from'),
    insuranceLabel: optionalText(values?.insuranceLabel, 'Insurance label')
  }

  if (invoice.currency.length !== 3) throw new Error('Currency must have three letters')

  const price = parseMoneyToMinorUnits(values?.price, 'Price')
  const items = [
    {
      id: `${invoice.id}-service`,
      description: invoice.shippingService || 'Prepaid Mail',
      quantityMilli: 1000,
      unitPrice: price
    }
  ]

  return { invoice, items }
}

// Convert a stored receipt back into the editable draft values.
export function storedShippingReceiptToDraft(invoice) {
  if (!invoice) throw new Error('Receipt is missing')
  return {
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.invoiceDate,
    time: invoice.invoiceTime,
    currency: invoice.currency,
    trackingNumber: invoice.trackingNumber,
    price: ((Number(invoice.subtotal) || 0) / 100).toFixed(2),
    shippingFrom: invoice.shippingFrom || '',
    expectedDeliveryDate: invoice.expectedDeliveryDate || '',
    service: invoice.shippingService || '',
    destination: invoice.destinationAddress || '',
    weight: invoice.packageWeight || '',
    insuranceLabel: invoice.insuranceLabel || '',
    insuranceAmount: ((Number(invoice.insurance) || 0) / 100).toFixed(2)
  }
}
