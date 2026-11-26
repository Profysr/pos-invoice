import { encodeEscPos } from 'retail-print-kit'
import { buildReceiptDocument } from '../shared/receipt.js'
import { makeReceiptData } from '../shared/invoice.js'
import { createPrinterTransport, sendBytes } from './printer-transport.js'

/**
 * Build a receipt document from template-ready data and encode it
 * as ESC/POS bytes.
 *
 * @param {object} receiptData - template-ready data from makeReceiptData()
 * @param {object} printer - printer profile { characterWidth, paperWidthMm, ... }
 * @returns {Promise<Buffer>} ESC/POS bytes ready to send over LAN or USB
 */
export async function encodeReceipt(receiptData, printer) {
  const { ops, profile } = buildReceiptDocument({ receiptData, printer })
  return encodeEscPos(ops, profile)
}

/**
 * Encode a receipt and send it to the configured printer in one call:
 * build canonical ops → encode ESC/POS → open → write → close.
 *
 * Accepts a DB-shaped invoice; converts it to template-ready data via
 * makeReceiptData() before rendering.
 *
 * @returns {Promise<{ ok, bytes, message }>}
 */
export async function sendReceipt(receipt, company, printer) {
  const receiptData = makeReceiptData(receipt)
  const bytes = await encodeReceipt(receiptData, printer)
  const transport = createPrinterTransport(printer)
  return sendBytes(transport, bytes)
}
