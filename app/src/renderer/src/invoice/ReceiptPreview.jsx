import './ReceiptPreview.css'

const MM_TO_PX = 3.78 // ≈ CSS px per mm at 96dpi
const CHAR_RATIO = 0.55 // monospace advance width as a fraction of the font size

function normalizeEntry(entry) {
  if (typeof entry === 'string') {
    return {
      text: entry,
      align: 'left',
      bold: false,
      underline: 0,
      font: 'a',
      widthScale: 1,
      heightScale: 1,
      type: 'text'
    }
  }
  return {
    text: entry?.text ?? '',
    align: entry?.align === 'center' || entry?.align === 'right' ? entry.align : 'left',
    bold: Boolean(entry?.bold),
    underline: Number(entry?.underline) === 2 ? 2 : Number(entry?.underline) ? 1 : 0,
    font: entry?.font === 'b' ? 'b' : 'a',
    widthScale: Math.max(1, Math.min(8, Number(entry?.widthScale) || 1)),
    heightScale: Math.max(1, Math.min(8, Number(entry?.heightScale) || 1)),
    type: entry?.type ?? 'text',
    footer: Boolean(entry?.footer)
  }
}

/**
 * ReceiptPreview — physical thermal-paper preview. Renders the canonical
 * `receiptLines` prop only; no formatting engine, no ESC/POS. Paper width
 * (58 or 80 mm) arrives via props from the printer profile settings.
 *
 * Props:
 * - receiptLines: array of string | styled text entries | divider | logo
 * - error: preview error message; shown instead of a receipt
 * - paperWidth: 58 | 80 (mm)
 * - characterWidth: characters per line (matches the printer profile)
 * - logoDataUrl: image used for the { type: 'logo' } line
 */
function ReceiptPreview({
  receiptLines = [],
  error = '',
  paperWidth = 80,
  characterWidth = 48,
  logoDataUrl = ''
}) {
  const paperPx = Math.round(paperWidth * MM_TO_PX)
  const fontSize = Math.max(7, Math.min(14, Math.floor((paperPx - 16) / (characterWidth * CHAR_RATIO))))

  if (error) {
    return (
      <div className="receipt-preview-area" data-paper-width={paperWidth}>
        <div className="receipt-error" role="alert">
          Receipt preview unavailable: {error}
        </div>
      </div>
    )
  }

  return (
    <div className="receipt-preview-area" data-paper-width={paperWidth}>
      <div className="receipt-paper" style={{ width: paperPx, fontSize: `${fontSize}px` }}>
        {receiptLines.length === 0 ? (
          <div className="receipt-line">— receipt preview —</div>
        ) : (
          receiptLines.map((entry, index) => {
            const { text, align, bold, underline, font, widthScale, heightScale, type, footer } =
              normalizeEntry(entry)
            if (type === 'logo') {
              return logoDataUrl ? (
                <img key={index} className="receipt-logo" src={logoDataUrl} alt="" />
              ) : null
            }
            if (type === 'divider') {
              return <div key={index} className="receipt-line receipt-divider" />
            }
            if (text === '') {
              return <div key={index} className="receipt-line receipt-gap" />
            }
            const classes = [
              'receipt-line',
              `align-${align}`,
              bold ? 'bold' : '',
              underline === 2 ? 'underline-double' : underline ? 'underline' : '',
              font === 'b' ? 'font-b' : '',
              footer ? 'receipt-footer' : ''
            ]
              .filter(Boolean)
              .join(' ')
            const scaled = widthScale !== 1 || heightScale !== 1
            const style = scaled
              ? {
                  transform: `scale(${widthScale}, ${heightScale})`,
                  transformOrigin: `${align} top`
                }
              : undefined
            return (
              <div key={index} className={classes} style={style}>
                {text}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default ReceiptPreview
