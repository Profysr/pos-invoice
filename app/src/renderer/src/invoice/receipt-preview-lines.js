import { render } from 'retail-print-kit/browser'
import {
  RECEIPT_TEMPLATE,
  buildReceiptViewModel
} from '../../../shared/receipt-template-core.js'
import { opsToReceiptLines } from '../../../shared/receipt-ops-lines.js'

/**
 * Build the canonical receipt lines used by the React preview.
 *
 * The browser build of retail-print-kit is renderer-safe and produces the same
 * operations as the main-process build. Errors are returned to the UI instead
 * of falling back to a second receipt layout.
 */
export function buildReceiptPreviewLines(receipt = {}, company = {}, printer = {}) {
  try {
    const [data, profile] = buildReceiptViewModel(receipt, company, printer)
    const ops = render(RECEIPT_TEMPLATE, data, profile)
    return {
      lines: opsToReceiptLines(ops, {
        width: profile.columns.a,
        logo: Boolean(company.logoDataUrl)
      }),
      error: ''
    }
  } catch (error) {
    return {
      lines: [],
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
