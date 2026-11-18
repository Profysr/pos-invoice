# Technical Validation — Areas 3–4 (Wrapping/Alignment/Long Values; Logo Consistency)

**Source inspected:** `app/src/shared/receipt.js`, `app/src/main/printing.js`, `app/src/renderer/src/invoice/ReceiptPreview.jsx`, `app/src/main/system-print.js`, `app/src/tests/receipt.test.js`.

---

## Area 3 — Text wrapping, column alignment and long-value handling

### 3.1 Optional fields bypass `wrapText` and can overflow character width

**File:** `app/src/shared/receipt.js:118-134`

**Actual behavior:**
```js
optionalLine(lines, receipt.destinationAddress ? `  ${receipt.destinationAddress}` : '')
optionalLine(lines, receipt.packageWeight ? `  Weight: ${receipt.packageWeight}` : '')
lines.push({ text: 'Expected Delivery Date:', align: 'left' })
optionalLine(lines, formatReceiptDate(receipt.expectedDeliveryDate) ? `  ${formatReceiptDate(receipt.expectedDeliveryDate)}` : '')
lines.push({ text: 'Tracking #:', align: 'left' })
optionalLine(lines, groupTrackingNumber(receipt.trackingNumber) ? `  ${groupTrackingNumber(receipt.trackingNumber)}` : '')
```

`optionalLine` pushes `{ text, align, bold }` without wrapping. In `escPosBytes` line 91, text lines are wrapped via `wrapText(text, width)`, so ESC/POS will wrap these. But `buildShippingReceiptLines` test at `receipt.test.js:65-71` asserts `line.text.length <= 42` for all non-typed lines — yet these optional lines are NOT pre-truncated to width in `buildShippingReceiptLines`. The test passes only because the test fixture values are short.

**Verification gap:** `wrapText` in `escPosBytes` handles wrapping, so ESC/POS won't emit lines > width. But `formatColumns` and `formatTableRow` output (which ARE exactly width) then get `wrapText` applied again on line 91 — for a line exactly `width` with no spaces, `wrapText` returns it as one chunk (fits). For a line exactly `width` WITH spaces, `wrapText` could split it mid-table-row, corrupting column alignment.

**Reproducible failure scenario:** `destinationAddress` = "VERY LONG ADDRESS STREET NAME THAT EXCEEDS THE CHARACTER LIMIT ON NARROW PAPER" (50+ chars) on 58 mm paper (width 32).
- ESC/POS: wraps to multiple lines — acceptable, but the `"  "` prefix means wrapped continuation lines lose the indent.
- Preview: unwrapped `{ text, align: 'left' }`; CSS `word-break: break-word` may split mid-word, but `white-space: pre-wrap` preserves spaces — visual overflow possible.
- Windows HTML: same as preview, inline style `white-space:pre-wrap`.

**Recommended minimal fix:** Apply `wrapText` to optional long fields when building lines, or document that long values wrap in ESC/POS but may overflow in preview/HTML. Simplest: in `buildShippingReceiptLines`, wrap destination/weight/tracking values via `wrapText(value, width)` and push each chunk as a separate line.

**Architectural change required?** No.

### 3.2 `formatColumns` right-field overflow truncates silently

**File:** `app/src/shared/receipt.js:36-42`

```js
function formatColumns(left, right, width) {
  const rightText = String(right ?? '')
  const leftText = String(left ?? '')
  if (rightText.length >= width) return rightText.slice(-width)
  const leftWidth = Math.max(0, width - rightText.length - 1)
  return `${leftText.slice(0, leftWidth).padEnd(leftWidth)} ${rightText}`
}
```

**Actual behavior:** If `rightText.length >= width`, the entire left field is dropped and only the last `width` chars of the right field are returned. No indicator of truncation.

**Reproducible failure scenario:** `insuranceLabel` = "A very long insurance label that exceeds width" and `money(insurance)` = "$1,234.56" (10 chars), width = 32. `rightText` (10) < width, so leftWidth = 32 − 10 − 1 = 21. Left is sliced to 21 chars. Fine. But if `rightText` itself is 40 chars (e.g. a long currency symbol or formatted amount), the label disappears entirely and only the last 32 chars of the amount print.

**More likely real scenario:** `formatColumns('Total', money(total), width)` where total is formatted as "$1,234.56" — fits fine. The risk is theoretical with extreme currency formats.

**Recommended minimal fix:** Add a fallback that preserves at least the left label and truncates the right field with an ellipsis or indicator, rather than dropping the label entirely.

**Architectural change required?** No.

### 3.3 `formatTableRow` fixed proportions break on narrow paper

**File:** `app/src/shared/receipt.js:45-60`

```js
const productEnd = Math.round(width * 0.4)
const qtyEnd = Math.max(productEnd + 5, Math.round(width * 0.5))
const unitEnd = Math.max(qtyEnd + 10, Math.round(width * 0.8))
```

**Actual behavior:** At width 32 (58 mm): productEnd = 13, qtyEnd = max(18, 16) = 18, unitEnd = max(28, 26) = 28. Columns: product [0,13), qty [13,18), unit [18,28), price [28,32). Price column is only 4 chars wide — too narrow for "$999.99" (8 chars).

**Verification:** `formatTableRow` slices each cell to its column size (`text.slice(0, size)`), so no overflow — but price gets truncated to 4 chars: "$99" or similar.

**Reproducible failure scenario:** Price = 99999 (minor units → "$999.99"), width = 32. Price part [28,32) = 4 chars → "$999" sliced to "$99" then trimmed. Receipt shows wrong price.

**Wait, let me re-check:** `money(price)` returns e.g. "$999.99". `part(cells[3], unitEnd, width, 'right')` = `text.slice(0, 4).padStart(4)` = "$999".slice(0,4) = "$999".padStart(4) = "$999". So price shows "$999" instead of "$999.99" — data corruption by truncation.

**Recommended minimal fix:** On narrow paper, drop the "Unit Price" column or reduce product column width to give price more room. Or format price without currency symbol in the table row (symbol already in header/context).

**Architectural change required?** No — column proportion constants can be adjusted.

### 3.4 `wrapText` re-applied to already-formatted columns corrupts alignment

**File:** `app/src/main/printing.js:91`, `app/src/shared/receipt.js:36-60`

**Actual behavior:** In `escPosBytes`, every text line (including output from `formatColumns` and `formatTableRow`, which are already exactly `width` chars and space-padded) passes through `wrapText(line.text, width)`. `wrapText` splits on whitespace:
```js
const words = paragraph.trim().split(/\s+/).filter(Boolean)
```
`.trim()` removes the padding spaces that `formatColumns`/`formatTableRow` relied on for alignment. Then words are reassembled with single spaces. A line like `"Product    Qty  Unit Price  Price"` (space-padded columns) becomes `"Product Qty Unit Price Price"` — column alignment destroyed in ESC/POS output.

**Wait, let me verify.** `formatTableRow` returns:
```js
part(cells[0], 0, productEnd, 'left') +  // padded to productEnd
part(cells[1], productEnd, qtyEnd, 'right') +  // padded
part(cells[2], qtyEnd, unitEnd, 'right') +  // padded
part(cells[3], unitEnd, width, 'right')  // padded
```
Then `.trimEnd()`. So internal padding spaces between columns remain (e.g. "Product  1  $65.22  $65.22" with padding). Then `wrapText` does `paragraph.trim().split(/\s+/)` — collapses all internal whitespace to single spaces. Output: "Product 1 $65.22 $65.22" — alignment LOST.

**But the test passes** because `receipt.test.js:65-71` only checks line length ≤ 42, not column alignment.

**Reproducible failure scenario:** Print a receipt via ESC/POS. The table header "Product Qty Unit Price Price" and data row "Prepaid Mail 1 $65.22 $65.22" print left-aligned with single spaces, not column-aligned. The receipt looks ragged.

**Recommended minimal fix:** In `escPosBytes`, skip `wrapText` for lines that are already pre-formatted (table rows, formatColumns output), or wrap at the character level without collapsing internal spaces. Alternatively, in `buildShippingReceiptLines`, pre-wrap table content and pass wrapped lines directly, bypassing `wrapText` in `escPosBytes` for pre-formatted lines.

**Architectural change required?** No.

### 3.5 Tracking number grouping may exceed width after wrapping

**File:** `app/src/shared/dates.js:32-36` `groupTrackingNumber`, `app/src/shared/receipt.js:128-134`

**Actual behavior:** `groupTrackingNumber("9201990367007536409945")` → "9201 9903 6700 7536 4099 45" (29 chars with spaces). On width 32 with `"  "` prefix = 31 chars — fits barely. On width 24 (unusual but possible), it overflows.

**Reproducible failure scenario:** Tracking number 22+ digits on 58 mm paper (32 width): `"  9201 9903 6700 7536 4099 45"` = 31 chars ≤ 32 — fits. But if the user configures width 24, it overflows. ESC/POS `wrapText` would split it at spaces — acceptable but tracking number becomes hard to read.

**Recommended minimal fix:** Document minimum width 32 for grouped tracking numbers; or allow tracking number to wrap across lines with continuation indent.

**Architectural change required?** No.

---

## Area 4 — Logo sizing and rendering consistency

### 4.1 Three different logo representations across renderers

**Files:**
- `app/src/renderer/src/invoice/ReceiptPreview.jsx:42-46` — ``
- `app/src/main/printing.js:159-163` — `` inline in HTML
- `app/src/main/printing.js:72-88` + `app/src/main/logo-raster.js:9-33` — ESC/POS `GS v 0` 1bpp raster

**Actual behavior:**
- Preview: `max-width: 70%`, `display: block`, `margin: 0 auto 6px`, `height: auto`. Scaled by CSS to container.
- Windows HTML: `<img src="..." style="display:block;margin:0 auto 6px;max-width:70%">`. Same CSS, but rendered at 12px font context.
- ESC/POS: `rasterizeLogo` resizes to `widthDots = Math.round(printableDots * 0.7)`, converts to 1bpp with fixed threshold 140, no dithering. Emitted as `GS v 0` with `bytesPerRow` and `heightDots`.

**Risk:** A color logo with anti-aliased edges:
- Preview/HTML: anti-aliased, grayscale, renders nicely.
- ESC/POS: hard threshold at gray=140, no dithering — fine lines and light grays disappear, text may become unreadable. Documented shortcut in `logo-raster.js:8`: "fixed gray threshold, no dithering — upgrade to Floyd-Steinberg only if the client's logo prints with too much loss of detail."

**Reproducible failure scenario:** Company logo is a light-gray watermark or thin-line logo. On ESC/POS thermal printer, it prints as blank or illegible speckles.

**Recommended minimal fix:** Add dithering (Floyd-Steinberg) to `rasterizeLogo`, or at minimum make threshold configurable per printer profile. The shortcut comment already acknowledges this.

**Architectural change required?** No — enhancement to existing function.

### 4.2 ESC/POS logo centering is approximate

**File:** `app/src/main/printing.js:75-81`

```js
const leftPadDots = Math.max(0, Math.round((Number(printableDots) - Number(logo.widthDots || 0)) / 2))
const padSpaces = Math.max(0, Math.round(leftPadDots / Math.max(1, Number(dotsPerChar))))
chunks.push(ESC, 0x61, 0x00)  // left alignment
if (padSpaces > 0) write(' '.repeat(padSpaces))
```

**Actual behavior:** Logo is "centered" by emitting pad spaces (12 dots per char assumed). This is approximate — space width on thermal printers may not equal 12 dots exactly, and `ESC a 0` (left alignment) is set before the pad spaces, so any alignment command is overridden.

**Reproducible failure scenario:** Logo widthDots = 400, printableDots = 576 (80 mm at 8 dot/mm). leftPadDots = 88. padSpaces = 88/12 = 7. 7 spaces × 12 dots = 84 dots, not 88. Logo is off-center by 4 dots — visually negligible but not exact.

**Larger issue:** `dotsPerChar` defaults to 12 in `escPosBytes` options but `dotDensity` from printer profile (4–16) is not passed as `dotsPerChar`. So if dotDensity = 16, `printableDots` = 58 mm × 16 = 800 dots, but pad spaces still use 12 dots/char — centering math is wrong for non-standard dot densities.

**Reproducible failure scenario:** Printer profile dotDensity = 16, printableWidthMm = 50 (58 mm). printableDots = 800. logo widthDots = 560. leftPadDots = 120. padSpaces = 120/12 = 10 spaces = 120 dots at 12 dots/char — but actual char width at dotDensity 16 is 16 dots, so 10 spaces = 160 dots. Logo offset wrong by 40 dots.

**Recommended minimal fix:** Pass `dotsPerChar: dotDensity` from the printer profile to `escPosBytes`, or compute padSpaces using `dotDensity` not hardcoded 12.

**Architectural change required?** No — pass through existing `dotDensity` field.

### 4.3 Preview logo vs actual print size mismatch

**File:** `app/src/renderer/src/invoice/ReceiptPreview.jsx:32-33`, `app/src/main/printing.js:262`

**Actual behavior:** Preview derives font size from paper width and character width; logo is CSS-scaled (max-width 70%). ESC/POS logo widthDots = `printableDots * 0.7`. These are conceptually similar (70%) but the preview shows the logo at native resolution scaled by CSS, while ESC/POS rasterizes at a fixed dot width. A detailed logo looks crisp in preview but blocky/pixelated on ESC/POS.

**Recommended minimal fix:** Document as known limitation; no code change unless logo fidelity is a requirement.

**Architectural change required?** No.

---

*End of Areas 3–4. Next: Areas 5–7 (encoding/code pages; printing behavior/error detection; migration data-loss).*
