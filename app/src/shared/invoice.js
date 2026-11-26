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

// Keep only what a money amount can hold: digits, one decimal point and two decimals.
export function sanitizeMoneyInput(value) {
  const raw = String(value ?? '')
  if (raw.trim().startsWith('-')) return ''
  const cleaned = raw.replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot === -1) return cleaned
  return cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2)
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

// "9201990367007536409945" -> "9201 9903 6700 7536 4099 45"
export function groupTrackingNumber(value) {
  const text = String(value ?? '').trim();
  if (!text || !/^\d+$/.test(text)) return text;
  return text.replace(/(\d{4})(?=\d)/g, '$1 ');
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

function formatSenderContact(values) {
  const hasContactParts = ['senderContactArea', 'senderContactPrefix', 'senderContactLine'].some(
    (key) => values?.[key] != null
  )
  if (hasContactParts) {
    const area = optionalText(values?.senderContactArea, 'Sender contact area code')
    const prefix = optionalText(values?.senderContactPrefix, 'Sender contact prefix')
    const line = optionalText(values?.senderContactLine, 'Sender contact line number')
    return area || prefix || line ? `(${area})${prefix}-${line}` : ''
  }
  return optionalText(values?.senderContact, 'Sender contact')
}

export function buildShippingReceiptFields(values) {
  const senderName = optionalText(values?.senderName, 'Sender name')
  const senderStreet = optionalText(values?.senderStreet, 'Sender street')
  const senderCity = optionalText(values?.senderCity, 'Sender city')
  const senderState = optionalText(values?.senderState, 'Sender state')
  const senderZip = optionalText(values?.senderZip, 'Sender ZIP')
  const senderContact = formatSenderContact(values)
  const destinationCity = optionalText(values?.destCity, 'Destination city')
  const destinationState = optionalText(values?.destState, 'Destination state')
  const destinationZip = optionalText(values?.destZip, 'Destination ZIP')
  const weightLb = optionalText(values?.weightLb, 'Weight pounds')
  const weightOz = optionalText(values?.weightOz, 'Weight ounces')
  const destinationStateZip = [destinationState, destinationZip].filter(Boolean).join(' ')

  return {
    senderName,
    senderStreet,
    senderCity,
    senderState,
    senderZip,
    senderContact,
    destinationCity,
    destinationState,
    destinationZip,
    shippingFrom: [
      senderName,
      [senderStreet, senderCity].filter(Boolean).join(' '),
      [senderState, senderZip].filter(Boolean).join(' '),
      senderContact
    ]
      .filter(Boolean)
      .join('\n'),
    destinationAddress: [destinationCity, destinationStateZip].filter(Boolean).join(', '),
    packageWeight: [weightLb && `${weightLb} lb`, weightOz && `${weightOz} oz`]
      .filter(Boolean)
      .join(' ')
  }
}

function splitPackageWeight(value) {
  const match = String(value ?? '')
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s+lb\s+(\d+(?:\.\d+)?)\s+oz$/i)
  return { weightLb: match?.[1] || '', weightOz: match?.[2] || '' }
}

function splitSenderContact(value) {
  const match = String(value ?? '')
    .trim()
    .match(/^\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})$/)
  return {
    senderContactArea: match?.[1] || '',
    senderContactPrefix: match?.[2] || '',
    senderContactLine: match?.[3] || ''
  }
}

export function normalizeShippingReceiptDraft(values, id) {
  const shipping = buildShippingReceiptFields(values)
  const invoice = {
    id: requiredText(id, 'Receipt id'),
    invoiceNumber: requiredText(values?.invoiceNumber, 'Reference number'),
    invoiceDate: requiredText(values?.date, 'Date'),
    invoiceTime: requiredText(values?.time, 'Time'),
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerAddress: '',
    currency: 'USD',
    insurance: 0,
    shippingService: optionalText(values?.service, 'Shipping service'),
    ...shipping,
    expectedDeliveryDate: optionalText(values?.expectedDeliveryDate, 'Expected delivery'),
    trackingNumber: requiredText(values?.trackingNumber, 'Tracking number'),
    notes: ''
  }

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

/**
 * Build template-ready receipt data from raw invoice form values.
 *
 * This is the single data-preparation function used by both preview and
 * printing. It accepts raw form values (or a DB-shaped invoice) and returns
 * one predictable object whose field names match the placeholders in
 * receipt-template.json.
 *
 * Money is kept as integer minor units (the database representation) and
 * formatted only by the template's `money:$` filter at render time.
 * Dates are passed as raw ISO strings; the template's `date` filter handles
 * display formatting. Tracking numbers are grouped here because no template
 * filter exists for that.
 *
 * @param {object} values - raw Mantine form values or DB-shaped invoice
 * @returns {object} template-ready data object
 */
export function makeReceiptData(values) {
  // Detect DB-shaped invoice (has invoiceDate) vs form values (has date)
  const isDbInvoice = values.invoiceDate !== undefined

  const senderContact = formatSenderContact(values)

  const shippingFrom = [
    values.senderName,
    [values.senderStreet, values.senderCity].filter(Boolean).join(' '),
    [values.senderState, values.senderZip].filter(Boolean).join(' '),
    senderContact
  ]
    .filter(Boolean)
    .join('\n')

  const destinationStateZip = [values.destState || values.destinationState, values.destZip || values.destinationZip]
    .filter(Boolean)
    .join(' ')
  const destinationAddress = [values.destCity || values.destinationCity, destinationStateZip]
    .filter(Boolean)
    .join(', ')

  const packageWeight = values.packageWeight
    ? values.packageWeight
    : [values.weightLb && `${values.weightLb} lb`, values.weightOz && `${values.weightOz} oz`]
        .filter(Boolean)
        .join(' ')

  const price = isDbInvoice
    ? Number(values.subtotal) || 0
    : parseMoneyToMinorUnits(values.price, 'Price')

  const service = values.service || values.shippingService || 'Prepaid Mail'
  const item = {
    name: service,
    description: service,
    qty: '1',
    unitPrice: '',
    price: price / 100
  }

  return {
    store: {
      address: values.senderStreet || '',
      city: values.senderCity || '',
      state: values.senderState || '',
      zip: values.senderZip || '',
      contact: senderContact
    },
    date: isDbInvoice ? values.invoiceDate : (values.date || ''),
    time: isDbInvoice ? values.invoiceTime : (values.time || ''),
    items: [item],
    shipping: {
      destination: destinationAddress,
      expectedDelivery: values.expectedDeliveryDate || '',
      trackingNumber: groupTrackingNumber(values.trackingNumber || '')
    },
    total: price / 100,
    grandTotal: price / 100,
    shippingFrom,
    destinationAddress,
    packageWeight
  }
}

// Convert a stored receipt back into the editable draft values.
export function storedShippingReceiptToDraft(invoice) {
  if (!invoice) throw new Error('Receipt is missing')
  const weight = splitPackageWeight(invoice.packageWeight)
  const contact = splitSenderContact(invoice.senderContact || '')

  return {
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.invoiceDate,
    time: invoice.invoiceTime,
    currency: invoice.currency,
    trackingNumber: invoice.trackingNumber,
    price: ((Number(invoice.subtotal) || 0) / 100).toFixed(2),
    senderName: invoice.senderName || '',
    senderStreet: invoice.senderStreet || '',
    senderCity: invoice.senderCity || '',
    senderState: invoice.senderState || '',
    senderZip: invoice.senderZip || '',
    senderContact: invoice.senderContact || '',
    ...contact,
    expectedDeliveryDate: invoice.expectedDeliveryDate || '',
    service: invoice.shippingService || '',
    destCity: invoice.destinationCity || '',
    destState: invoice.destinationState || '',
    destZip: invoice.destinationZip || '',
    weightLb: weight.weightLb,
    weightOz: weight.weightOz
  }
}
