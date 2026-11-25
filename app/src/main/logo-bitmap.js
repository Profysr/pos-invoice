import { loadImage, serializeBitmap } from 'retail-print-kit'
import { logoWidthDots } from '../shared/receipt-layout.js'

/**
 * Load a logo image as a 1-bit bitmap scaled to the given width in dots.
 * Node only; needs the optional `@napi-rs/canvas` package.
 *
 * @param {string|null} logoPath - absolute path to the company logo image
 * @param {number} widthDots - target width in dots
 * @returns {Promise<{ width: number, height: number, bits: Uint8Array } | null>}
 *   Bitmap shape: { width, height, bits }, bits packed MSB first.
 *   Returns null when there is no logo path or the image cannot be loaded.
 */
export async function loadLogoBitmap(logoPath, widthDots) {
  if (!logoPath) return null
  try {
    return await loadImage(logoPath, {
      width: widthDots,
      dither: false,
      threshold: 140
    })
  } catch {
    return null
  }
}

/**
 * Prepare a serialized logo bitmap from the stored logo path and printer dimensions.
 *
 * @param {string|null} logoPath - absolute path to the company logo image
 * @param {object} printer - { printableWidthMm, dotDensity }
 * @returns {Promise<{ width: number, height: number, data: string } | null>}
 *   SerializedBitmap shape: { width, height, data } where data is base64-encoded 1-bit bitmap.
 *   Returns null when there is no logo path or the image cannot be loaded.
 */
export async function prepareLogoBitmap(logoPath, printer) {
  if (!logoPath) return null
  try {
    const widthDots = logoWidthDots(printer)
    const bitmap = await loadImage(logoPath, {
      width: widthDots,
      dither: false,
      threshold: 140
    })
    return serializeBitmap(bitmap)
  } catch {
    return null
  }
}
