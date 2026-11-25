/**
 * Shared receipt layout calibration — one place for logo size and position.
 * Changing any value here affects both preview and print output.
 */
export const RECEIPT_LOGO = {
  /** Logo width as a ratio of printable width. */
  widthRatio: 0.7,
  /** Horizontal alignment: 'left' | 'center' | 'right'. */
  align: 'center',
  /** Vertical position: 'top' | 'middle' | 'bottom'. */
  position: 'top'
}

/**
 * Dot width for a logo raster:
 *   printableDots = printableWidthMm * dotDensity; logo = widthRatio * printableDots.
 */
export function logoWidthDots(printer) {
  return Math.round(
    ((Number(printer.printableWidthMm) || 72) * (Number(printer.dotDensity) || 8)) *
      RECEIPT_LOGO.widthRatio
  )
}
