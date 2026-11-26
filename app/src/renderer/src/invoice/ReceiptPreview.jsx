import { buildReceiptDocument, buildReceiptPreviewHtml } from '../../../shared/receipt.js'

/** CSS px per dot at the preview's 96 dpi baseline (retail-print-kit uses 8px cells). */
const CELL_PX = 8

/**
 * ReceiptPreview — renders the canonical receipt document (the same operations
 * used for ESC/POS printing) as on-screen HTML inside an isolated iframe.
 *
 * The iframe keeps the library's preview CSS out of the app and makes the
 * preview truly independent of the app's styles. It is not a second layout
 * implementation: every line, alignment, bold run and logo raster comes from
 * `buildReceiptDocument`.
 *
 * Props:
 * - receiptData: template-ready data from makeReceiptData()
 * - printer: { paperWidthMm, characterWidth, ... }
 * - error: preview error message; shown instead of a receipt
 */
function ReceiptPreview({
  receiptData = {},
  printer = {},
  error = ''
}) {
  const paperWidthMm = Number(printer?.paperWidthMm) || 80
  const characterWidth = Number(printer?.characterWidth) || 48

  let previewHtml = ''
  if (!error) {
    try {
      const { ops, profile } = buildReceiptDocument({ receiptData, printer })
      previewHtml = buildReceiptPreviewHtml({ ops, profile })
    } catch (renderError) {
      error = renderError instanceof Error ? renderError.message : String(renderError)
      previewHtml = ''
    }
  }

  if (error) {
    return (
      <div className="receipt-preview-area" data-paper-width={paperWidthMm}>
        <div className="receipt-error" role="alert">
          Receipt preview unavailable: {error}
        </div>
      </div>
    )
  }

  const paperPx = Math.round(characterWidth * CELL_PX)
  // The .paper block in opsToHtml adds padding: 12px top/bottom, cell px left/right.
  const iframeWidthPx = paperPx + CELL_PX * 2
  // Thermal receipts are tall and narrow (~1:2.5 width:height). Give the iframe enough height for a full receipt without vertical squishing; the outer container scrolls if the receipt exceeds this.
  const iframeHeightPx = Math.max(500, Math.round(paperPx * 2.5))

  return (
    <div className="receipt-preview-area" data-paper-width={paperWidthMm}>
      <iframe
        className="receipt-preview-frame"
        title="Receipt preview"
        srcDoc={previewHtml}
        width={iframeWidthPx}
        height={iframeHeightPx}
        sandbox="allow-same-origin"
        style={{
          display: 'block',
          border: 'none',
          background: '#f5f5f5',
          boxShadow: '0 1px 4px rgba(240, 240, 240, 0.2)',
          width: `100%`
        }}
      />
    </div>
  )
}

export default ReceiptPreview
