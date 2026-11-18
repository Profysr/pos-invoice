# Technical Validation — Areas 1–2 (Preview/Print Consistency; Dimensions)

**Source inspected:** `app/src/shared/receipt.js`, `app/src/renderer/src/invoice/ReceiptPreview.jsx` + `.css`, `app/src/main/printing.js`, `app/src/main/system-print.js`, `app/src/main/logo-raster.js`, `app/src/main/index.js`, `app/src/shared/paper.js`, `app/src/tests/receipt.test.js`.

---

## Area 1 — Preview vs Windows HTML vs ESC/POS output consistency

### 1.1 Three independent renderers for the same line array

**Files/functions:**
- `app/src/renderer/src/invoice/ReceiptPreview.jsx` (React preview)
- `app/src/main/printing.js:154` `receiptLinesToHtml()` (Windows HTML)
- `app/src/main/printing.js:34` `escPosBytes()` (ESC/POS encoder)

**Actual behavior:**
The canonical `receiptLines` array from `buildShippingReceiptLines()` is consumed by three separate rendering paths with no shared formatting engine:
- Preview renders each line as a DOM `.receipt-line` div using CSS `text-align`, `font-weight`, `white-space: pre-wrap`, monospace font stack (Consolas/Courier New/DejaVu Sans Mono), `line-height: 1.45`.
- Windows HTML path generates a standalone `<!doctype html>` document with inline styles: `text-align`, `font-weight`, `white-space:pre-wrap`, `font: 12px Consolas,...`, body width = `printableWidth mm`, `@page margin: 2mm`.
- ESC/POS path emits printer control codes: `ESC a n` for alignment, `ESC E n` for bold, `ESC - n` for underline (always off), then wraps text via `wrapText()` and appends `0x0a` newlines.

**Consistency gap:** There is no single source of truth for line rendering. A line that fits in the preview may overflow in ESC/POS (different glyph advance, no word-wrap fallback for some fields), and the Windows HTML path uses a fixed 12px font while the preview derives font size dynamically from paper width and character count.

**Reproducible failure scenario:** A long destination address (e.g. 60 characters) on 58 mm paper (32 char width):
- Preview: unwrapped, may overflow visually but CSS `word-break: break-word` may split it.
- ESC/POS: `write(value)` is called per `wrapText` chunk — wait, actually looking at the code, `escPosBytes` line 91: `for (const value of wrapText(line?.text ?? '', width)) write(value)`. So ESC/POS does wrap text lines. But `formatColumns` and `formatTableRow` output is pre-formatted to exactly `width`, then `wrapText` is applied again on line 91. For a line already exactly `width` chars with no spaces, `wrapText` returns it as-is (single chunk), so it fits. For a line longer than `width` with no spaces (e.g. a tracking number), `wrapText` returns it as one chunk > width — overflow.

### 1.2 Bold/underline semantics differ

**File:** `app/src/main/printing.js:90`

**Actual behavior:** ESC/POS emits `ESC E n` (bold) and `ESC - n` (underline, hardcoded to 0/off). Preview and HTML use CSS `font-weight: 700` for bold. There is no underline support anywhere. A receipt line marked bold renders as bold in preview/HTML but ESC/POS bold depends on the printer's Font A bold implementation, which varies by ESC/POS clone.

**Reproducible failure scenario:** Print "Grand Total:" to a generic ESC/POS printer that ignores `ESC E` — the total line prints at normal weight, visually indistinguishable from the "Total" line above it.

**Recommended minimal fix:** Document that ESC/POS bold is printer-dependent; no code change needed unless the client requires guaranteed emphasis. If required, add double-strike (`ESC G`) or redundant emphasis.

**Architectural change required?** No.

---

## Area 2 — Printable width, character capacity, margins and physical dimensions

### 2.1 Paper presets assume 8 mm side margins

**File:** `app/src/shared/paper.js:3-6`

```js
80: { paperWidthMm: 80, printableWidthMm: 72, characterWidth: 48 }
58: { paperWidthMm: 58, printableWidthMm: 50, characterWidth: 32 }
```

**Actual behavior:** `printableWidthMm` is paper − 8 mm (4 mm each side). `characterWidth` is the Font A grid (48 for 80 mm, 32 for 58 mm). These are stored in the `printer_profiles` table and editable via `PrinterSettingsSection.jsx`.

**Verification:** `paperPreset(80)` returns printable 72 mm / 48 chars; `paperPreset(58)` returns 50 mm / 32 chars; unknown widths fall back to 80 mm (`paper.js:10`).

**Risk:** The user can override `printableWidthMm` and `characterWidth` independently in Settings. If a user sets 80 mm paper but `characterWidth: 60`, lines formatted to 60 chars may exceed the physical printable width at 203 dpi (80 mm ≈ 642 dots; 60 chars × 12 dots = 720 dots > 642).

**Reproducible failure scenario:** User sets paper width 80 mm, character width 60. `buildShippingReceiptLines` formats to width 60. ESC/POS emits 60-char lines to a printer whose physical printable width is 576 dots (48 chars). Lines wrap or clip on the physical paper.

**Recommended minimal fix:** Add validation in `PrinterSettingsSection.buildProfile` or `database.savePrinter` that `characterWidth * dotsPerChar <= printableWidthMm * dotDensity` (dots per char defaults to 12 in `escPosBytes`). Or derive `characterWidth` from `printableWidthMm` and `dotDensity` rather than allowing independent input.

**Architectural change required?** No — validation only.

### 2.2 Preview font-size heuristic does not match physical printable area

**File:** `app/src/renderer/src/invoice/ReceiptPreview.jsx:31-32`

**Actual behavior:** `paperPx = paperWidth × 3.78` (96 dpi). `fontSize = clamp((paperPx − 16) / (characterWidth × 0.55), 7, 14)`. The 16 px is padding (8 px each side from `.receipt-paper { padding: 12px 8px }` plus container), and `CHAR_RATIO = 0.55` is an assumed monospace advance ratio.

**Risk:** At 80 mm / 48 chars: `(302 − 16) / (48 × 0.55) = 286 / 26.4 ≈ 10.8 → 10 px`. But actual Consolas advance at 10 px may not be exactly 5.5 px, so 48 chars may not fill the paper width. The preview does not simulate the 2 mm `@page` margin used by Windows print, nor hardware printable margins.

**Reproducible failure scenario:** Preview shows 48 chars fitting neatly; Windows HTML print at `printableWidth: 72 mm` with 12 px font may fit fewer characters per physical line because 12 px Consolas advance > preview's assumed ratio.

**Recommended minimal fix:** Note as a known limitation; the preview is advisory, not WYSIWYG. To improve, sync preview `fontSize` to the Windows HTML path (12 px at printable width) or add a "preview scale" setting.

**Architectural change required?** No.

### 2.3 Windows HTML `@page` size vs body width mismatch

**File:** `app/src/main/printing.js:175-177`

```html
@page { size: ${paperWidth}mm auto; margin: 2mm; }
body { width: ${printableWidth}mm; ... }
```

**Actual behavior:** Page size is `paperWidth mm` (e.g. 80 mm) with 2 mm margin on all sides. Body width is `printableWidth mm` (e.g. 72 mm). `margins: { marginType: 'none' }` is passed to `webContents.print`, telling Electron to ignore hardware margins.

**Verification:** This is internally consistent — body width (72 mm) fits within page (80 mm) − 2 mm margins each side = 76 mm available. There is 4 mm slack.

**Risk:** `size: ${paperWidth}mm auto` means height is automatic based on content. For thermal printers using roll paper with auto-cut, this is fine. For cut-sheet Windows printers, the receipt prints on a full page with the receipt content in the top-left 80 mm × auto region — likely not what a Windows laser printer user expects, but the app targets thermal receipt printers.

**Reproducible failure scenario:** Printing to a Windows laser printer (not thermal) produces a small receipt in the corner of a Letter/A4 page with large empty margins. This is expected behavior for the target use case, not a bug.

**Recommended minimal fix:** None required; document that Windows system printing is intended for thermal receipt printers with matching paper size configured in Windows.

**Architectural change required?** No.

### 2.4 `dotDensity` only affects ESC/POS logo sizing

**File:** `app/src/main/index.js:260-262`, `app/src/main/printing.js:77-79`

**Actual behavior:** `printableDots = printableWidthMm × dotDensity` is used to center the ESC/POS logo raster and size it (70% of printable dots). `dotDensity` is stored in `printer_profiles` (default 8, range 4–16) but is not used in preview or Windows HTML.

**Risk:** Logo appears at different relative sizes on ESC/POS vs Windows HTML vs preview. ESC/POS logo width = 70% of printable dots; HTML logo = max-width 70% of container; preview logo = max-width 70% of `.receipt-paper`. Coincidentally similar percentages, but dot density affects absolute ESC/POS size only.

**Reproducible failure scenario:** Same company logo printed via ESC/POS at dotDensity 8 vs 16 produces physically different-sized logos on the receipt; preview and Windows HTML show a third size.

**Recommended minimal fix:** Document the discrepancy; no functional bug. If logo size consistency is required, unify logo sizing to a percentage of printable width across all three paths.

**Architectural change required?** No.

---

*End of Areas 1–2. Next: Areas 3–4 (wrapping/alignment/long values; logo consistency).*
