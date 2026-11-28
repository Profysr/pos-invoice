// Industry-standard character grids for the supported paper widths.
// printableWidthMm = paper − 8 mm margins; characterWidth is the Font A grid.
export const PAPER_PRESETS = {
  80: { paperWidthMm: 80, printableWidthMm: 72, characterWidth: 48 },
  58: { paperWidthMm: 58, printableWidthMm: 50, characterWidth: 32 }
}

// Unknown widths fall back to the 80 mm grid.
export function paperPreset(paperWidthMm) {
  return PAPER_PRESETS[Number(paperWidthMm)] || PAPER_PRESETS[80]
}
