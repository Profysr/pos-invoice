import { nativeImage } from 'electron'

/**
 * Convert a logo file into a 1-bit-per-pixel raster for ESC/POS `GS v 0`.
 *
 * shortcut: fixed gray threshold, no dithering — upgrade to Floyd-Steinberg
 * only if the client's logo prints with too much loss of detail.
 */
export function rasterizeLogo(logoPath, { widthDots = 400, threshold = 140 } = {}) {
  if (!logoPath) return null

  const image = nativeImage.createFromPath(logoPath)
  if (image.isEmpty()) return null

  const resized = image.resize({ width: Math.max(1, Math.round(widthDots)), quality: 'best' })
  const { width, height } = resized.getSize()
  const bitmap = resized.toBitmap()
  const bytesPerRow = Math.ceil(width / 8)
  const data = Buffer.alloc(bytesPerRow * height)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      if (bitmap[offset + 3] < 128) continue
      const blue = bitmap[offset]
      const green = bitmap[offset + 1]
      const red = bitmap[offset + 2]
      const gray = (red * 299 + green * 587 + blue * 114) / 1000
      if (gray < threshold) data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }

  return { data, bytesPerRow, widthDots: width, heightDots: height }
}
