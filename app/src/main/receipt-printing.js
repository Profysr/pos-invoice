import { encodeEscPos } from 'retail-print-kit'
import { buildReceiptDocument } from '../shared/receipt-document.js'
import { prepareLogoBitmap } from './logo-bitmap.js'
import { createPrinterTransport, sendBytes } from './printer-transport.js'

/**
 * Build a receipt document from the canonical shared operations and encode it
 * as ESC/POS bytes. The logo bitmap (when a logoPath is given) is prepared
 * once from the stored logo path and printer dimensions, so preview and print
 * use the same bitmap.
 *
 * @param {object} receipt - stored invoice
 * @param {object} company - company metadata (may include logoPath)
 * @param {object} printer - printer profile { characterWidth, paperWidthMm, printableWidthMm, dotDensity, ... }
 * @param {object} options - { logoPath? }
 * @returns {Promise<Buffer>} ESC/POS bytes ready to send over LAN or USB
 */
export async function encodeReceipt(receipt, company, printer, options = {}) {
  const { logoPath } = options
  let logoBitmap = null
  if (logoPath) {
    logoBitmap = await prepareLogoBitmap(logoPath, printer)
  }
  const { ops, profile } = buildReceiptDocument({ receipt, company, printer, logoBitmap })
  return encodeEscPos(ops, profile)
}

/**
 * Encode a receipt and send it to the configured printer in one call:
 * build canonical ops → encode ESC/POS → open → write → close.
 *
 * @returns {Promise<{ ok, bytes, message }>}
 */
export async function sendReceipt(receipt, company, printer, options = {}) {
  const bytes = await encodeReceipt(receipt, company, printer, options)
  const transport = createPrinterTransport(printer)
  return sendBytes(transport, bytes)
}
