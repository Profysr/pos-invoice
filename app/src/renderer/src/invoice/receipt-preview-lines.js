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
    const lines = opsToReceiptLines(ops, {
      width: profile.columns.a,
      logo: Boolean(company.logoDataUrl)
    })

    const tableHeaderLines = new Set(String(data.tableHeader).split('\n'))
    let itemStart = 0
    for (const item of data.items) {
      if (!item.product) continue
      const markedProduct = `${item.product}@`
      const itemIndex = lines.findIndex(
        (line, index) => index >= itemStart && line.text?.includes(markedProduct)
      )
      if (itemIndex < 0) continue
      lines[itemIndex].text = lines[itemIndex].text.replace(markedProduct, item.product)
      lines[itemIndex].boldPrefix = item.product
      itemStart = itemIndex + 1
    }
    for (const line of lines) {
      if (tableHeaderLines.has(line.text)) line.tableHeader = true
    }

    // Footer lines are the centered text lines after the last divider. Style them larger with more line spacing to match the reference.
    let lastDividerIndex = -1
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].type === 'divider') lastDividerIndex = i
    }
    for (let i = lastDividerIndex + 1; i < lines.length; i += 1) {
      const line = lines[i]
      if (line.type && line.type !== 'text') continue
      line.footer = true
    }
    return {
      lines,
      error: ''
    }
  } catch (error) {
    return {
      lines: [],
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
