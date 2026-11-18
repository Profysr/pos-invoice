# Receipt Workflow Investigation — Part C: Receipt Design Analysis

**Source:** `app/src/shared/receipt.js`, `app/src/shared/dates.js`, `app/src/shared/invoice.js`, `app/src/tests/receipt.test.js`.

**Limitation:** I could not read `amzon biling1.pdf` directly (this environment does not support PDF input). The comparison below describes the current template's actual output in detail, based on the source code and tests, and identifies where it would differ from a typical USPS-style reference receipt. If you can extract text or images from the PDF, I can refine this comparison.

---

## C.1 Current Template Output — Exact Layout

`buildShippingReceiptLines()` (`app/src/shared/receipt.js:76-165`) produces this sequence of line objects (in order):

| # | Line type | Content | Alignment | Bold? | Notes |
|---|-----------|---------|-----------|-------|-------|
| 1 | `logo` | (company logo) | center | — | Only if `company.logoPath || company.logoDataUrl` |
| 2-N | `text` | `shippingFrom` lines, split on `\n` | center | — | Company sender block from Settings |
| N+1 | `text` | `''` (blank) | left | — | Section spacer |
| N+2 | `text` | `formatColumns(date, time, width)` | left | — | Date left, time right on same line |
| N+3 | `divider` | `'-' × width` | — | — | Dashed rule |
| N+4 | `text` | `formatTableRow(['Product','Qty','Unit Price','Price'], width)` | left | yes | Table header |
| N+5 | `divider` | `'-' × width` | — | — | Dashed rule |
| N+6 | `text` | `formatTableRow([service || 'Prepaid Mail', '1', '', money(price)], width)` | left | — | Single item row |
| N+7 | `text` | `''` (blank) | left | — | Section spacer |
| N+8 | `text` | `'  ' + destinationAddress` (optional) | left | — | Only if destinationAddress non-empty |
| N+9 | `text` | `'  Weight: ' + packageWeight` (optional) | left | — | Only if packageWeight non-empty |
| N+10 | `text` | `'Expected Delivery Date:'` | left | — | Label only |
| N+11 | `text` | `'  ' + formattedDate` (optional) | left | — | Only if expectedDeliveryDate non-empty |
| N+12 | `text` | `'Tracking #:'` | left | — | Label only |
| N+13 | `text` | `'  ' + groupedTracking` (optional) | left | — | Only if trackingNumber digits |
| N+14 | `text` | `''` (blank) | left | — | Section spacer |
| N+15 | `text` | `formatColumns(insuranceLabel || 'Insurance', money(insurance), width)` (optional) | left | — | Only if insuranceLabel || insurance > 0 |
| N+16 | `text` | `formatColumns('Total', money(total), width)` | left | — | |
| N+17 | `divider` | `'-' × width` | — | — | |
| N+18 | `text` | `formatColumns('Grand Total:', money(total), width)` | left | yes | |
| N+19 | `divider` | `'-' × width` | — | — | |
| N+20 | `text` | `''` (blank) | left | — | Footer spacer |
| N+21+ | `text` | `wrapText(FOOTER_TRACKING, width)` chunks | center | — | USPS tracking footer paragraph |
| | `text` | `''` (blank) | left | — | |
| N+22+ | `text` | `wrapText(FOOTER_INSURANCE, width)` chunks | center | — | USPS insurance footer paragraph |
| | `text` | `''` (blank) | left | — | |

**Footer constants** (`app/src/shared/receipt.js:4-7`):
- `FOOTER_TRACKING` — "Text your tracking number to 28777 (2USPS) to get the latest status. Standard Message and Date Rates may apply. You may also visit www.usps.com USPS Tracking or call 1-800-222-1811."
- `FOOTER_INSURANCE` — "Save this receipt as evidence of insurance. For information on filing an insurance claim go to https://www.usps.com/help/claims.html or call 1-800-222-1811."

---

## C.2 Typographic & Structural Characteristics

**Fonts:**
- Preview: `font-family: 'Consolas', 'Courier New', 'DejaVu Sans Mono', monospace`; `font-size: 11px` base in CSS, dynamically derived 7–14px; `line-height: 1.45`; `white-space: pre-wrap`.
- Windows HTML: `font: 12px Consolas, "Courier New", monospace`; body width = `printableWidth mm`.
- ESC/POS: printer's internal Font A (monospace, fixed character grid).

**Alignment:**
- Sender block: centered.
- Date/time row: date left, time right (via `formatColumns`).
- Table header + data: left-aligned text, but columns use padding for pseudo-alignment.
- Address/weight/delivery/tracking: left-aligned, with two-space indent prefix.
- Insurance/Total/Grand Total: `formatColumns` puts label left, amount right.
- Footer paragraphs: centered.

**Separators:**
- `{ type: 'divider', character: '-' }` → width-wide dashed line.
- Blank `{ text: '' }` lines → section spacers (0.7em gap in preview, empty line elsewhere).

**Money formatting:**
- `formatMoney(minorUnits, currency)` via `Intl.NumberFormat` with currency symbol, e.g. `$65.22`, `$0.00`.
- Insurance defaults to `$0.00` even when insurance is 0 but `insuranceLabel` is set.

**Date/time:**
- `formatReceiptDate('2026-08-10')` → `'Mon 08/10/2026'` (weekday + MM/DD/YYYY).
- `formatReceiptTime('18:06')` → `'6:06 PM'` (12-hour clock).
- Date and time appear on the same line, separated by `formatColumns`.

**Tracking number:**
- `groupTrackingNumber('9201990367007536409945')` → `'9201 9903 6700 7536 4099 45'` (groups of 4 digits).
- Non-digit tracking numbers (e.g. '1Z999AA10123456784') are returned unchanged.

**Optional field handling:**
- `optionalLine()` skips empty/whitespace text entirely — no placeholder line is printed.
- Address, weight, expected delivery, tracking are emitted with a `'  '` (two-space) indent prefix.
- Insurance row shows label + amount; if insurance is 0 but label exists, still prints `label $0.00`.

---

## C.3 What the Template Does NOT Do (vs a typical USPS receipt)

Based on the source code, the current template:

1. **Does not print customer name/address.** The `customerName`, `customerPhone`, `customerEmail`, `customerAddress` fields exist in the database schema (`database.js:52-55`) but are never populated from the form and never appear on the receipt.

2. **Does not print a per-itemized list with multiple line items.** The database `invoice_items` table supports multiple rows, but `normalizeShippingReceiptDraft()` builds exactly one item (`shippingService || 'Prepaid Mail'`, qty 1). A USPS-style receipt typically lists each service/product separately.

3. **Does not show subtotal/tax/insurance as separate lines.** It shows `price` (subtotal), `insurance`, and `total = price + insurance`, but no tax line. Insurance appears as its own row only when `insuranceLabel || insurance > 0`.

4. **Does not show payment method, cash, change, or card details.** No such fields exist in the form or template.

5. **Does not show employee/cashier ID, register number, or terminal ID.** No such fields exist.

6. **Does not show store location or store number.** Only company name/address/phone from Settings.

7. **Does not show a barcode or QR code.** ESC/POS has no barcode commands in `escPosBytes()`. The tracking number is printed as grouped text only.

8. **Does not show "Thank you" or custom footer text.** Only the two hardcoded USPS footer paragraphs (tracking + insurance).

9. **Does not show a receipt/invoice number prominently.** The `invoiceNumber` is stored in the database but does not appear in `buildShippingReceiptLines()` output at all. It is not on the receipt.

10. **Does not wrap address/weight/tracking lines.** These bypass `wrapText()`, so long values can exceed `characterWidth`. Only footer paragraphs and ESC/POS text lines are wrapped.

---

## C.4 Likely Differences vs `amzon biling1.pdf`

Since I cannot read the PDF, here is what I can infer about a typical USPS-style reference receipt versus the current template:

| Element | Current Template | Typical USPS Receipt (inferred) |
|---------|-----------------|---------------------------------|
| Header | Company logo + sender block (centered) | USPS logo + retail location address |
| Date/Time | Same line: date left, time right | Usually separate, prominent |
| Receipt # | **Not printed** | Usually prominent near top |
| Customer info | **Not printed** | Often printed (name/address for shipping) |
| Items | Single line: service, qty 1, price | Multiple itemized lines possible |
| Columns | Product | Qty | Unit Price | Price | Similar column structure |
| Subtotal | `price` (subtotal) | Subtotal line typical |
| Insurance | Separate row if label or amount > 0 | Insurance fee line typical |
| Total | `Total` + `Grand Total:` (bold) | Total line typical |
| Tracking | Label + grouped number | Tracking number prominent, often near top/bottom |
| Footer | Two hardcoded USPS paragraphs (tracking + insurance) | May have different/short footer |
| Barcode | **None** | USPS receipts often have barcode |
| Payment info | **None** | Cash/card/change typical |

**Confirmed differences from code evidence:**
- Receipt number missing from output (not in `buildShippingReceiptLines`).
- Customer name/address missing from output.
- Multi-item support missing (single hardcoded item).
- Barcode missing.
- No tax line.

---

*End of Part C. Next: Part D (printing analysis).*
