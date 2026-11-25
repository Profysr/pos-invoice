import { buildReceiptDocument, buildReceiptPreviewHtml } from '../../../shared/receipt-document.js'

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
 * - receipt: stored invoice / view-model source
 * - company: company metadata
 * - printer: { paperWidthMm, characterWidth, ... }
 * - logoBitmap: serialized logo bitmap { width, height, data } or null
 * - error: preview error message; shown instead of a receipt
 */
function ReceiptPreview({
  receipt = {},
  company = {},
  printer = {},
  logoBitmap = null,
  error = ''
}) {
  const paperWidthMm = Number(printer?.paperWidthMm) || 80
  const characterWidth = Number(printer?.characterWidth) || 48

  let previewHtml = ''
  if (!error) {
    try {
      const { ops, profile } = buildReceiptDocument({ receipt, company, printer, logoBitmap })
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

  return (
    <div className="receipt-preview-area" data-paper-width={paperWidthMm}>
      <iframe
        className="receipt-preview-frame"
        title="Receipt preview"
        srcDoc={previewHtml}
        width={paperPx}
        height={Math.max(300, paperPx)}
        sandbox="allow-same-origin"
      />
    </div>
  )
}

export default ReceiptPreview
