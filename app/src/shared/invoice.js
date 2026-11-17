const MONEY_PATTERN = /^(\d*)(?:\.(\d{1,2}))?$/
const QUANTITY_PATTERN = /^(\d*)(?:\.(\d{1,3}))?$/

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

export function parseQuantityToMilli(value, field = 'Quantity') {
  const text = String(value ?? '')
    .trim()
    .replace(/,/g, '')
  const match = QUANTITY_PATTERN.exec(text)
  if (!match || (!match[1] && !match[2])) {
    throw new Error(`${field} must be a positive number with up to three decimals`)
  }

  const whole = match[1] || '0'
  const fraction = (match[2] || '').padEnd(3, '0')
  const quantityMilli = Number(whole) * 1000 + Number(fraction)
  if (!Number.isSafeInteger(quantityMilli)) throw new Error(`${field} is too large`)
  if (quantityMilli <= 0) throw new Error(`${field} must be greater than zero`)
  return quantityMilli
}

export function calculateLineTotal(quantityMilli, unitPriceMinor) {
  if (!Number.isSafeInteger(quantityMilli) || quantityMilli <= 0) {
    throw new Error('Quantity must be a positive integer in thousandths')
  }
  if (!Number.isSafeInteger(unitPriceMinor) || unitPriceMinor < 0) {
    throw new Error('Unit price must be a non-negative integer in minor units')
  }
  return Math.round((quantityMilli * unitPriceMinor) / 1000)
}

export function calculateInvoiceTotals(items, insuranceMinor = 0) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Invoice must contain at least one line item')
  }
  if (!Number.isSafeInteger(insuranceMinor) || insuranceMinor < 0) {
    throw new Error('Insurance must be a non-negative integer in minor units')
  }

  const normalizedItems = items.map((item) => ({
    ...item,
    lineTotal: calculateLineTotal(item.quantityMilli, item.unitPrice)
  }))
  const subtotal = normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0)
  return {
    items: normalizedItems,
    subtotal,
    insurance: insuranceMinor,
    total: subtotal + insuranceMinor
  }
}

export function formatMoney(minorUnits, currency = 'USD', locale = 'en-US') {
  const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : 'USD'
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: safeCurrency,
      currencyDisplay: 'code'
    })
      .format(minorUnits / 100)
      .replace(/[\u00a0\u202f]/g, ' ')
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${safeCurrency}`
  }
}

export function formatQuantityMilli(quantityMilli) {
  const whole = Math.floor(quantityMilli / 1000)
  const fraction = quantityMilli % 1000
  if (fraction === 0) return String(whole)
  return `${whole}.${String(fraction).padStart(3, '0').replace(/0+$/, '')}`
}

// Convert a stored invoice (integer minor units / scaled quantities) back into
// the editable draft values expected by normalizeInvoiceDraft.
export function storedInvoiceToDraft(invoice) {
  if (!invoice || !Array.isArray(invoice.items) || invoice.items.length === 0) {
    throw new Error('Invoice has no line items')
  }
  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    invoiceTime: invoice.invoiceTime,
    customerName: invoice.customerName,
    customerPhone: invoice.customerPhone,
    customerAddress: invoice.customerAddress,
    currency: invoice.currency,
    insurance: (invoice.insurance / 100).toFixed(2),
    shippingService: invoice.shippingService,
    destinationAddress: invoice.destinationAddress,
    packageWeight: invoice.packageWeight,
    expectedDeliveryDate: invoice.expectedDeliveryDate || '',
    trackingNumber: invoice.trackingNumber,
    notes: invoice.notes,
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      qty: formatQuantityMilli(item.quantityMilli),
      unitPrice: (item.unitPrice / 100).toFixed(2)
    }))
  }
}

export function normalizeInvoiceDraft(values, id) {
  const invoice = {
    id: requiredText(id, 'Invoice id'),
    invoiceNumber: requiredText(values?.invoiceNumber, 'Invoice number'),
    invoiceDate: requiredText(values?.invoiceDate, 'Invoice date'),
    invoiceTime: requiredText(values?.invoiceTime, 'Invoice time'),
    customerName: requiredText(values?.customerName, 'Customer name'),
    customerPhone: optionalText(values?.customerPhone, 'Customer phone'),
    customerEmail: '',
    customerAddress: optionalText(values?.customerAddress, 'Customer address'),
    currency: requiredText(values?.currency, 'Currency').toUpperCase(),
    insurance:
      values?.insurance == null || String(values.insurance).trim() === ''
        ? 0
        : parseMoneyToMinorUnits(values.insurance, 'Insurance'),
    shippingService: optionalText(values?.shippingService, 'Shipping service'),
    destinationAddress: optionalText(values?.destinationAddress, 'Destination address'),
    packageWeight: optionalText(values?.packageWeight, 'Package weight'),
    expectedDeliveryDate: optionalText(values?.expectedDeliveryDate, 'Expected delivery date'),
    trackingNumber: optionalText(values?.trackingNumber, 'Tracking number'),
    notes: optionalText(values?.notes, 'Notes')
  }

  if (invoice.currency.length !== 3) throw new Error('Currency must have three letters')
  if (!Array.isArray(values?.items) || values.items.length === 0) {
    throw new Error('Add at least one line item before printing')
  }

  const items = values.items.map((item, index) => ({
    id: requiredText(item?.id, `Item ${index + 1} id`),
    description: requiredText(item?.description, `Item ${index + 1} description`),
    quantityMilli: parseQuantityToMilli(item?.qty, `Item ${index + 1} quantity`),
    unitPrice: parseMoneyToMinorUnits(item?.unitPrice, `Item ${index + 1} unit price`)
  }))

  return { invoice, items }
}
