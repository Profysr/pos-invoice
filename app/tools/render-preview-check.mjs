import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildReceiptPrintLines } from '../src/main/receipt-printing.js'
import { receiptLinesToHtml } from '../src/main/printing.js'

const appRoot = dirname(fileURLToPath(import.meta.url))
const logoPath = join(appRoot, '../resources/receipt-logo.png')
const logoDataUrl = `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`
const printer = { characterWidth: 42, paperWidthMm: 80, printableWidthMm: 72 }

const lines = buildReceiptPrintLines(
  {
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
    insuranceLabel: 'Up to $100.00 included',
    currency: 'USD'
  },
  { logoPath, logoDataUrl },
  printer
)

const outputPath = join(appRoot, '../preview-check.html')
writeFileSync(outputPath, receiptLinesToHtml(lines, printer, logoDataUrl))
console.log('lines:', lines.length, '->', outputPath)
