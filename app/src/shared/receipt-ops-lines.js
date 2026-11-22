const ALIGNMENTS = new Set(['left', 'center', 'right'])

function clampScale(value) {
  return Math.max(1, Math.min(8, Number(value) || 1))
}

function dividerCharacter(text, width) {
  const value = String(text ?? '')
  if (!value || value.length !== Number(width)) return null
  const character = value[0]
  if (/\s/.test(character)) return null
  return value.split('').every((item) => item === character) ? character : null
}

/**
 * Convert retail-print-kit operations into the canonical receipt line model.
 *
 * Text, alignment and printer styles are kept in one place so the React
 * preview and the Windows HTML printer can render the same template. Visible
 * operations that the preview cannot represent fail loudly instead of being
 * silently omitted.
 *
 * @param {Array<object>} ops - retail-print-kit operations
 * @param {object} options
 * @param {number} options.width - printer character width
 * @param {boolean} options.logo - prepend a logo marker
 * @returns {Array<object>} canonical receipt lines
 */
export function opsToReceiptLines(ops, { width = 48, logo = false } = {}) {
  const state = {
    align: 'left',
    bold: false,
    underline: 0,
    font: 'a',
    widthScale: 1,
    heightScale: 1
  }
  const lines = []

  const styledLine = (text) => ({
    text,
    align: state.align,
    bold: state.bold,
    underline: state.underline,
    font: state.font,
    widthScale: state.widthScale,
    heightScale: state.heightScale
  })

  const pushText = (text) => {
    const character = dividerCharacter(text, width)
    lines.push(character ? { type: 'divider', character } : styledLine(text))
  }

  for (const op of ops) {
    switch (op.kind) {
      case 'text': {
        const parts = String(op.text ?? '').split('\n')
        if (parts.at(-1) === '' && String(op.text ?? '').endsWith('\n')) parts.pop()
        for (const part of parts) pushText(part)
        break
      }
      case 'newline':
        for (let index = 0; index < (Number(op.count) || 0); index += 1) pushText('')
        break
      case 'feed':
        for (let index = 0; index < (Number(op.lines) || 0); index += 1) pushText('')
        break
      case 'align':
        if (!ALIGNMENTS.has(op.align)) throw new Error(`Unsupported receipt alignment: ${op.align}`)
        state.align = op.align
        break
      case 'style':
        state.bold = Boolean(op.style?.bold)
        state.underline = Number(op.style?.underline) || 0
        break
      case 'font':
        state.font = op.font === 'b' ? 'b' : 'a'
        break
      case 'size':
        state.widthScale = clampScale(op.width)
        state.heightScale = clampScale(op.height)
        break
      case 'init':
      case 'cut':
      case 'drawer':
        break
      case 'qr':
      case 'barcode':
      case 'raster':
      case 'raw':
        throw new Error(`Receipt preview cannot represent ${op.kind} operations`)
      default:
        throw new Error(`Unsupported receipt operation: ${op.kind}`)
    }
  }

  if (logo) lines.unshift({ type: 'logo' })
  return lines
}
