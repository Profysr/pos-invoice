import { encodeEscPos, NetTransport, render } from 'retail-print-kit'
import { RECEIPT_TEMPLATE, buildReceiptViewModel } from '../shared/receipt-template-core.js'
import { opsToReceiptLines } from '../shared/receipt-ops-lines.js'

/**
 * Lazily rasterize a company logo using the existing Electron `nativeImage`
 * implementation in src/main/logo-raster.js (main process only).
 *
 * The import is dynamic so this module loads under plain Node in tests;
 * rasterization itself only runs under Electron.
 */
async function defaultRasterizeLogo(logoPath, options = {}) {
  const { rasterizeLogo } = await import('./logo-raster.js')
  return rasterizeLogo(logoPath, options)
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
 * Dot width for a logo raster, mirroring the existing print path:
 *   printableDots = printableWidthMm * dotDensity; logo = 70% of printable.
 */
export function logoWidthDots(printer) {
  return Math.round(((Number(printer.printableWidthMm) || 72) * (Number(printer.dotDensity) || 8)) * 0.7)
}

/**
 * Build canonical receipt lines for the Windows system-print path.
 * The template and operations are shared with LAN printing and the preview.
 */
export function buildReceiptPrintLines(receipt, company = {}, printer = {}) {
  const [data, profile] = buildReceiptViewModel(receipt, company, printer)
  const ops = render(RECEIPT_TEMPLATE, data, profile)
  return opsToReceiptLines(ops, {
    width: profile.columns.a,
    logo: Boolean(company.logoPath || company.logoDataUrl)
  })
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
  let ops = render(RECEIPT_TEMPLATE, data, profile)

  // The template `image` block does not interpolate width/height/data, so a
  // runtime logo is prepended as a raw ESC/POS GS v 0 raster op instead.
  // rasterizeLogo() reports its size as widthDots/heightDots.
  if (logoBitmap) {
    ops.unshift({
      kind: 'raster',
      width: logoBitmap.widthDots,
      height: logoBitmap.heightDots,
      bits: new Uint8Array(logoBitmap.data)
    })
  }

  // ESC @ initialization, matching the existing escPosBytes output and
  // retail-print-kit's Printer.open() convention. Double init is harmless.
  ops.unshift({ kind: 'init' })

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
  // Legacy sendNetwork() rejected a missing host; NetTransport would otherwise
  // silently fall back to localhost.
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

export { buildReceiptViewModel }
