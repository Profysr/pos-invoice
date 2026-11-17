import { calculateInvoiceTotals, formatMoney, formatQuantityMilli } from './invoice.js'

export function wrapText(input, width) {
  const safeWidth = Math.max(1, Number(width) || 48)
  return String(input ?? '')
    .split('\n')
    .flatMap((paragraph) => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean)
      if (words.length === 0) return ['']

      const lines = []
      let line = ''
      for (const word of words) {
        if (!line) {
          line = word
          continue
        }
        if (`${line} ${word}`.length <= safeWidth) {
          line += ` ${word}`
          continue
        }
        lines.push(line)
        line = word
      }
      if (line) lines.push(line)
      return lines
    })
}

function formatColumns(left, right, width) {
  const rightText = String(right ?? '')
  const leftText = String(left ?? '')
  if (rightText.length >= width) return rightText.slice(-width)
  const leftWidth = Math.max(0, width - rightText.length - 1)
  return `${leftText.slice(0, leftWidth).padEnd(leftWidth)} ${rightText}`
}

function optionalLine(lines, text, align = 'left', bold = false) {
  const value = String(text ?? '').trim()
  if (value) lines.push({ text: value, align, bold })
}

export function buildReceiptLines({ invoice, company = {}, printer = {} }) {
  const width = Math.max(16, Number(printer.characterWidth) || 48)
  const currency = invoice.currency || company.defaultCurrency || 'USD'
  const totals = calculateInvoiceTotals(invoice.items || [], invoice.insurance || 0)
  const money = (minorUnits) => formatMoney(minorUnits, currency)
  const lines = []

  optionalLine(lines, company.name, 'center', true)
  optionalLine(lines, company.address, 'center')
  optionalLine(lines, company.phone ? `Tel: ${company.phone}` : '', 'center')
  optionalLine(lines, company.email, 'center')
  lines.push({ text: '', align: 'left' })

  lines.push({ text: formatColumns('Invoice:', invoice.invoiceNumber, width), align: 'left' })
  lines.push({
    text: formatColumns(
      'Date:',
      [invoice.invoiceDate, invoice.invoiceTime].filter(Boolean).join(' '),
      width
    ),
    align: 'left'
  })
  optionalLine(lines, formatColumns('Customer:', invoice.customerName, width))
  optionalLine(lines, formatColumns('Phone:', invoice.customerPhone, width))
  optionalLine(lines, formatColumns('Address:', invoice.customerAddress, width))
  lines.push({ text: '-'.repeat(width), align: 'left' })

  for (const item of totals.items) {
    for (const text of wrapText(item.description, width)) {
      lines.push({ text, align: 'left' })
    }
    lines.push({
      text: formatColumns(
        `x${formatQuantityMilli(item.quantityMilli)} @ ${money(item.unitPrice)}`,
        money(item.lineTotal),
        width
      ),
      align: 'left'
    })
  }

  lines.push({ text: '-'.repeat(width), align: 'left' })
  lines.push({
    text: formatColumns('Subtotal', money(totals.subtotal), width),
    align: 'left'
  })
  if (totals.insurance > 0) {
    lines.push({
      text: formatColumns('Insurance', money(totals.insurance), width),
      align: 'left'
    })
  }
  lines.push({
    text: formatColumns('TOTAL', money(totals.total), width),
    align: 'center',
    bold: true
  })
  lines.push({ text: '-'.repeat(width), align: 'left' })

  optionalLine(lines, formatColumns('Shipping:', invoice.shippingService, width))
  optionalLine(lines, formatColumns('Destination:', invoice.destinationAddress, width))
  optionalLine(lines, formatColumns('Weight:', invoice.packageWeight, width))
  optionalLine(lines, formatColumns('Delivery:', invoice.expectedDeliveryDate, width))
  optionalLine(lines, formatColumns('Tracking:', invoice.trackingNumber, width))

  if (invoice.notes) {
    lines.push({ text: 'Notes:', align: 'left', bold: true })
    for (const text of wrapText(invoice.notes, width)) {
      lines.push({ text, align: 'left' })
    }
  }

  lines.push({ text: '', align: 'left' })
  lines.push({ text: 'Thank you for your business', align: 'center', bold: true })
  return lines
}
