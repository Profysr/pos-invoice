import './ReceiptPreview.css'

const MM_TO_PX = 3.78 // ≈ CSS px per mm at 96dpi

function normalizeEntry(entry) {
  if (typeof entry === 'string') {
    return { text: entry, align: 'left', bold: false }
  }
  return {
    text: entry?.text ?? '',
    align: entry?.align === 'center' || entry?.align === 'right' ? entry.align : 'left',
    bold: Boolean(entry?.bold)
  }
}

/**
 * ReceiptPreview — physical thermal-paper preview. Renders the canonical
 * `receiptLines` prop only; no formatting engine, no ESC/POS. Paper width
 * (58 or 80 mm) arrives via props from the printer profile settings.
 *
 * Props:
 * - receiptLines: array of string | { text, align: 'left'|'center'|'right', bold }
 * - paperWidth: 58 | 80 (mm)
 */
function ReceiptPreview({ receiptLines = [], paperWidth = 80 }) {
  const paperPx = Math.round(paperWidth * MM_TO_PX)

  return (
    <div className="receipt-preview-area" data-paper-width={paperWidth}>
      <div className="receipt-paper" style={{ width: paperPx }}>
        {receiptLines.length === 0 ? (
          <div className="receipt-line">— receipt preview —</div>
        ) : (
          receiptLines.map((entry, index) => {
            const { text, align, bold } = normalizeEntry(entry)
            if (text === '') {
              return <div key={index} className="receipt-line receipt-gap" />
            }
            return (
              <div key={index} className={`receipt-line align-${align}${bold ? ' bold' : ''}`}>
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
