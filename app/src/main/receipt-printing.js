import { encodeEscPos, NetTransport, opsToHtml, render } from 'retail-print-kit'
import { RECEIPT_TEMPLATE, buildReceiptViewModel } from '../shared/receipt-template-core.js'
import { buildReceiptDocument, sanitizeReceiptText } from '../shared/receipt-document.js'
import { logoWidthDots } from '../shared/receipt-layout.js'
import { loadLogoBitmap, prepareLogoBitmap } from './logo-bitmap.js'

export { logoWidthDots }

function boldItemNamesInOps(ops, items) {
  const result = [...ops]
  let searchFrom = 0
  for (const item of items) {
    const product = String(item?.product ?? '')
    if (!product) continue
    const markedProduct = `${product}@`
    const index = result.findIndex(
      (op, opIndex) =>
        opIndex >= searchFrom && op.kind === 'text' && op.text.includes(markedProduct)
    )
    if (index < 0) continue
    const remainder = result[index].text.slice(markedProduct.length)
    result.splice(
      index,
      1,
      { kind: 'style', style: { bold: true, underline: 0 } },
      { kind: 'text', text: product },
      { kind: 'style', style: { bold: false, underline: 0 } },
      { kind: 'text', text: remainder }
    )
    searchFrom = index + 4
  }
  return result
}

/**
 * Adapter kept for encodeReceipt's injectable rasterizer contract: it returns
 * the legacy { data, bytesPerRow, widthDots, heightDots } shape until Phase 5
 * rewires encodeReceipt onto buildReceiptDocument's SerializedBitmap.
 */
async function defaultRasterizeLogo(logoPath, { widthDots = 400 } = {}) {
  const bitmap = await loadLogoBitmap(logoPath, widthDots)
  if (!bitmap) return null
  return {
    data: Buffer.from(bitmap.bits),
    bytesPerRow: Math.ceil(bitmap.width / 8),
    widthDots: bitmap.width,
    heightDots: bitmap.height
  }
}

/**
 * Rasterize a company logo file into a retail-print-kit bitmap.
 * Returns null when there is no logo path.
 */
export async function rasterizeReceiptLogo(logoPath, { widthDots = 400 } = {}) {
  if (!logoPath) return null
  return defaultRasterizeLogo(logoPath, { widthDots })
}

/**
 * Build a retail-print-kit `NetTransport` for LAN (JetDirect port 9100) printing.
 *
 * This is a verified factory for the new print path; it does not replace the
 * existing `sendNetwork` transport used by `src/main/printing.js`.
 */
export function createNetTransport(profile) {
  return new NetTransport(profile.networkHost, {
    port: Number(profile.networkPort) || 9100,
    timeout: Number(profile.timeoutMs) || 5000
  })
}

/**
 * Render a receipt to ESC/POS bytes using retail-print-kit.
 *
 * @param {object} receipt
 * @param {object} company
 * @param {object} printer - { characterWidth, paperWidthMm, dotDensity, printableWidthMm }
 * @param {object} options
 * @param {object|null} options.logo - pre-rasterized bitmap { widthDots, heightDots, data }
 * @param {string} options.logoPath - logo file path to rasterize (Electron only)
 * @param {function} options.rasterizeLogo - fn(logoPath, {widthDots}) => bitmap|null
 * @returns {Promise<Buffer>} ESC/POS bytes ready to send over LAN
 */
export async function encodeReceipt(receipt, company, printer, options = {}) {
  const { logo, logoPath, rasterizeLogo = defaultRasterizeLogo } = options

  let logoBitmap = logo
  if (!logoBitmap && logoPath) {
    logoBitmap = await rasterizeLogo(logoPath, { widthDots: logoWidthDots(printer) })
  }

  const [data, profile] = buildReceiptViewModel(receipt, company, printer)
  let ops = boldItemNamesInOps(render(RECEIPT_TEMPLATE, data, profile), data.items)

  // The template `image` block does not interpolate width/height/data, so a runtime logo is prepended as a raw ESC/POS GS v 0 raster op instead. rasterizeLogo() reports its size as widthDots/heightDots.
  if (logoBitmap) {
    ops.unshift({
      kind: 'raster',
      width: logoBitmap.widthDots,
      height: logoBitmap.heightDots,
      bits: new Uint8Array(logoBitmap.data)
    })
  }

  // ESC @ initialization, matching the existing escPosBytes output and retail-print-kit's Printer.open() convention. Double init is harmless.
  ops.unshift({ kind: 'init' })

  // Sanitize text operations before encoding so characters printers choke on (curly quotes, ×, control chars, NBSP) never reach the ESC/POS stream.
  for (const op of ops) {
    if (op.kind === 'text') {
      op.text = sanitizeReceiptText(op.text)
    }
  }

  // Automatic paper cut after every LAN receipt, matching the legacy escPosBytes() terminating cut (GS V 65 feed-and-cut).
  ops.push({ kind: 'cut', partial: false, feed: 3 })

  return encodeEscPos(ops, profile)
}

/**
 * Send a pre-encoded ESC/POS buffer to a LAN printer.
 *
 * Lifecycle is open -> write -> close; `close()` runs in a `finally` so the
 * socket is released on success and on every failure (refused, timeout,
 * mid-stream disconnect). The transport itself never rejects from `close()`,
 * so it cannot mask the original error.
 *
 * Returns the same `{ ok, bytes, message }` shape the existing `sendNetwork`
 * produced, keeping the invoice:print response text unchanged.
 */
export async function sendBytesLan(bytes, printer) {
  // Legacy sendNetwork() rejected a missing host; NetTransport would otherwise silently fall back to localhost.
  if (!printer?.networkHost) throw new Error('Network printer host is missing')

  const transport = createNetTransport(printer)
  try {
    await transport.open()
    await transport.write(bytes)
  } finally {
    await transport.close()
  }
  return {
    ok: true,
    bytes: bytes.length,
    message: 'Data sent to printer. Physical output is not guaranteed.'
  }
}

/**
 * Encode a receipt and send it to a LAN printer in one call.
 * This is the entry point used by the invoice:print network branch.
 */
export async function sendReceiptLan(receipt, company, printer, options = {}) {
  const bytes = await encodeReceipt(receipt, company, printer, options)
  return sendBytesLan(bytes, printer)
}

/**
 * Render an HTML receipt for Windows system printing from the canonical
 * receipt document, so bolding, logo and sanitization come from the same
 * operations as LAN ESC/POS output.
 */
export async function buildReceiptPrintHtml(receipt, company, printer, options = {}) {
  const logoBitmap = await prepareLogoBitmap(options.logoPath, printer)
  const { ops, profile } = buildReceiptDocument({ receipt, company, printer, logoBitmap })
  // No cutter on a Windows page: the canonical cut op would print as a dashed rule.
  return opsToHtml(ops.filter((op) => op.kind !== 'cut'), profile)
}

export { buildReceiptViewModel }
