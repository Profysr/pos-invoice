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
  const senderStateZip = [senderState, senderZip].filter(Boolean).join(' ')
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
      senderStreet,
      senderCity,
      senderStateZip,
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

function legacySenderFields(value) {
  const lines = String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const fields = {
    senderName: '',
    senderStreet: '',
    senderCity: '',
    senderState: '',
    senderZip: '',
    senderContact: ''
  }
  if (!lines.length) return fields

  fields.senderName = lines.shift()
  if (/^(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})$/.test(lines.at(-1) || '')) {
    fields.senderContact = lines.pop()
  }

  const stateZipPattern = /^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/
  const stateZipIndex = lines.findIndex((line) => stateZipPattern.test(line))
  if (stateZipIndex !== -1) {
    const [, state, zip] = lines[stateZipIndex].match(stateZipPattern)
    fields.senderState = state.toUpperCase()
    fields.senderZip = zip
    lines.splice(stateZipIndex, 1)
  }

  if (lines.length) fields.senderStreet = lines.shift()
  if (lines.length) fields.senderCity = lines.shift()
  return fields
}

function legacyDestinationFields(value) {
  const match = String(value ?? '')
    .trim()
    .match(/^(.+?)[,\s]+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/)
  if (!match) return { destCity: '', destState: '', destZip: '' }
  return { destCity: match[1], destState: match[2].toUpperCase(), destZip: match[3] }
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
    currency: requiredText(values?.currency ?? 'USD', 'Currency').toUpperCase(),
    insurance: 0,
    shippingService: optionalText(values?.service, 'Shipping service'),
    ...shipping,
    expectedDeliveryDate: optionalText(values?.expectedDeliveryDate, 'Expected delivery'),
    trackingNumber: requiredText(values?.trackingNumber, 'Tracking number'),
    notes: ''
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
  const legacySender = legacySenderFields(invoice.shippingFrom)
  const legacyDestination = legacyDestinationFields(invoice.destinationAddress)
  const weight = splitPackageWeight(invoice.packageWeight)
  const senderContact =
    invoice.senderContact || invoice.sender_contact || legacySender.senderContact
  const contact = splitSenderContact(senderContact)

  return {
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.invoiceDate,
    time: invoice.invoiceTime,
    currency: invoice.currency,
    trackingNumber: invoice.trackingNumber,
    price: ((Number(invoice.subtotal) || 0) / 100).toFixed(2),
    senderName: invoice.senderName || invoice.sender_name || legacySender.senderName,
    senderStreet: invoice.senderStreet || invoice.sender_street || legacySender.senderStreet,
    senderCity: invoice.senderCity || invoice.sender_city || legacySender.senderCity,
    senderState: invoice.senderState || invoice.sender_state || legacySender.senderState,
    senderZip: invoice.senderZip || invoice.sender_zip || legacySender.senderZip,
    senderContact,
    ...contact,
    expectedDeliveryDate: invoice.expectedDeliveryDate || '',
    service: invoice.shippingService || '',
    destCity: invoice.destinationCity || invoice.destination_city || legacyDestination.destCity,
    destState: invoice.destinationState || invoice.destination_state || legacyDestination.destState,
    destZip: invoice.destinationZip || invoice.destination_zip || legacyDestination.destZip,
    weightLb: weight.weightLb,
    weightOz: weight.weightOz
  }
}
