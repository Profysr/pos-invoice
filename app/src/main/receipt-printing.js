import { encodeEscPos } from 'retail-print-kit'
import { buildReceiptDocument } from '../shared/receipt.js'
import { createPrinterTransport, sendBytes } from './printer-transport.js'

/**
 * Build a receipt document from the canonical shared operations and encode it
 * as ESC/POS bytes.
 *
 * @param {object} receipt - stored invoice
 * @param {object} company - company metadata
 * @param {object} printer - printer profile { characterWidth, paperWidthMm, printableWidthMm, dotDensity, ... }
 * @returns {Promise<Buffer>} ESC/POS bytes ready to send over LAN or USB
 */
export async function encodeReceipt(receipt, company, printer) {
  const { ops, profile } = buildReceiptDocument({ receipt, company, printer })
  return encodeEscPos(ops, profile)
}

/**
 * Encode a receipt and send it to the configured printer in one call:
 * build canonical ops → encode ESC/POS → open → write → close.
 *
 * @returns {Promise<{ ok, bytes, message }>}
 */
export async function sendReceipt(receipt, company, printer) {
  const bytes = await encodeReceipt(receipt, company, printer)
  const transport = createPrinterTransport(printer)
  return sendBytes(transport, bytes)
}
