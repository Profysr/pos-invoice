import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildShippingReceiptLines } from '../src/shared/receipt.js'

const appRoot = dirname(fileURLToPath(import.meta.url))
const logoPath = join(appRoot, '../resources/receipt-logo.png')
const logoDataUrl = `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`

const lines = buildShippingReceiptLines({
  receipt: {
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
  company: { logoPath, logoDataUrl },
  printer: { characterWidth: 42, paperWidthMm: 80 }
})

const escape = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  )

const body = lines
  .map((line) => {
    if (line.type === 'logo') return `<img src="${logoDataUrl}" style="display:block;margin:0 auto 6px;max-width:70%">`
    if (line.type === 'divider') return '<div style="border-bottom:1px dashed #000;height:0;margin:3px 0"></div>'
    const align = line.align === 'center' ? 'center' : line.align === 'right' ? 'right' : 'left'
    const weight = line.bold ? 700 : 400
    return `<div style="text-align:${align};font-weight:${weight};white-space:pre-wrap">${escape(line.text) || '&nbsp;'}</div>`
  })
  .join('')

writeFileSync(
  join(appRoot, '../preview-check.html'),
  `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; padding: 0; background: #fff; }
    body { width: 302px; margin: 12px; font: 10px/1.45 Consolas, "Courier New", monospace; color: #000; }
  </style></head><body>${body}</body></html>`
)
console.log('lines:', lines.length, '->', join(appRoot, '../preview-check.html'))
