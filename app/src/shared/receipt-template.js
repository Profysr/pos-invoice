import { render } from 'retail-print-kit'
import { RECEIPT_TEMPLATE, buildReceiptViewModel } from './receipt-template-core.js'
export { RECEIPT_TEMPLATE, buildReceiptViewModel }

/**
 * Render the declarative receipt template into retail-print-kit ops.
 *
 * @param {object} receipt
 * @param {object} company
 * @param {object} printer - { characterWidth, paperWidthMm }
 * @returns {import('retail-print-kit').Op[]}
 */
export function renderReceiptTemplate(receipt, company, printer) {
  const [data, profile] = buildReceiptViewModel(receipt, company, printer)
  return render(RECEIPT_TEMPLATE, data, profile)
}
