# Legacy Removal & Receipt Unification Plan

Status: **Phase 5 implementation complete; automated validation passed** (2026-11-22)  
Scope: `app/` (Electron invoice + thermal receipt app)

## 1. Why this plan exists

Before Phase 5, the app carried **two independent receipt implementations**:

```
LEGACY (src/shared/receipt.js)                 NEW (retail-print-kit 0.4.0)
buildShippingReceiptLines()  ──┬──> React ReceiptPreview   (renderer preview)
  content + layout + styling  │───> receiptLinesToHtml() ──> printSystem() (Windows)
                               └───> escPosBytes()        ──> printer:test only

RECEIPT_TEMPLATE ─> render() ─> ops ─> encodeEscPos() ─> sendReceiptLan()  (actual LAN print)
                      │
                      └──> nothing: the preview never saw these ops
```

This caused visible drift: the preview and Windows print used the legacy layout, while the LAN
printer used the template layout. Receipt content also existed twice, so every styling change had
to be made twice.

The resulting architecture is:

```
RECEIPT_TEMPLATE ─> buildReceiptViewModel() ─> render() ─> ops
                                                        ├──> encodeEscPos()  ─> LAN ESC/POS bytes
                                                        └──> opsToReceiptLines()
                                                              ├──> React preview   (renderer)
                                                              ├──> receiptLinesToHtml() ─> Windows print
                                                              └──> (legacy escPosBytes fallback)
```

The template core is renderer-safe and the renderer imports `retail-print-kit/browser`. Its `render`
output is identical to the main-process package build; this is covered by an automated equality
test.

## 2. Decisions already taken (user-approved)

| Decision | Choice | Reason |
|---|---|---|
| Preview target | Match the **LAN ESC/POS** output | One receipt definition; the printed receipt is the source of truth |
| Renderer | **ops -> canonical line model adapter** (not `opsToHtml`) | Keeps `ReceiptPreview.jsx` and the logo path, is testable under `node --test`, and the same adapter output also feeds `receiptLinesToHtml()` |
| Package import | Package-free template core + `retail-print-kit/browser` in the renderer | The package root pulls `node:net`; only `./browser` is renderer-safe |
| Preview failure | **No runtime fallback**; surface the error | A silent fallback would hide divergence from the printer |
| QR / barcode | N/A for Phase 5 | The receipt template emits no `qr`, `barcode`, or `raster` operations |
| Typography | One monospace family plus printer styling | Thermal printers expose character cells and built-in styles, not arbitrary desktop fonts |

## 3. Phase 5 scope (implemented)

- [x] Split the template into a package-free core (`src/shared/receipt-template-core.js`) so the
      renderer never loads `node:net`.
- [x] Add the ops -> canonical line model adapter (`src/shared/receipt-ops-lines.js`). It preserves
      alignment, bold, underline, printer font A/B, and width/height scaling.
- [x] Add the renderer preview builder (`src/renderer/src/invoice/receipt-preview-lines.js`).
- [x] Point the React preview at the ops-based builder (both pages), with an explicit error state.
- [x] Point the **Windows system print** at the same ops-based builder (mechanism untouched:
      `printSystem()` -> `receiptLinesToHtml()` -> `webContents.print`).
- [x] Delete the legacy receipt content builder `buildShippingReceiptLines()` and its helpers.
- [x] Retarget the legacy layout tests onto the canonical model and add preview/printing parity tests.
- [x] Make the table heading, tracking label, and grand total bold by using styled `text` blocks.
- [x] Split long footer words so the 58 mm layout does not overflow.
- [ ] Phase 7: switch `printer:test` (legacy LAN branch) to retail-print-kit ops, then delete
      `escPosBytes()` from `src/main/printing.js` and the legacy line model entirely.

## 4. What is deliberately kept (and why)

| Kept | Reason |
|---|---|
| `src/main/printing.js` (`escPosBytes`, `receiptLinesToHtml`) | `escPosBytes` remains the fallback encoder for `printer:test`; `receiptLinesToHtml` remains the Windows print mechanism and now consumes adapter lines |
| `src/main/system-print.js` | Windows system printing must stay unchanged mechanically |
| `src/shared/receipt.js` -> `wrapText()` | Still used by the template to wrap footer paragraphs |
| SQLite schema, IPC contracts | Hard constraint; untouched |

## 5. Styling / sizing flexibility (small edits)

All receipt design now lives in two places:

| Concern | Where to change it | Example |
|---|---|---|
| Section order, labels, alignment, columns | `src/shared/receipt-template-core.js` -> `RECEIPT_TEMPLATE` | Add a notes block, move totals, change column widths (`0.4/0.12/0.28/0.2`) |
| Dates, times, tracking, money, item mapping | `src/shared/receipt-template-core.js` -> `buildReceiptViewModel()` | Format a phone number, change the item quantity unit |
| Paper width / character grid | printer settings (`paperWidthMm`, `characterWidth`) -> `buildReceiptViewModel()` profile | 58 mm x 32 cols, 80 mm x 48 cols |
| Screen size of the preview | `src/renderer/src/invoice/ReceiptPreview.jsx` (`MM_TO_PX`, `CHAR_RATIO`) | Preview scale only; does not affect the printer |
| Bold / underline | Styled `text` blocks in `RECEIPT_TEMPLATE` | `{ type: 'text', value: '{{grandTotalRow}}', style: 'b' }` |
| Indentation / vertical spacing | Leading spaces in `text` values and `newline` blocks | `'  {{trackingNumber}}'`, `{ type: 'newline', count: 1 }` |

### Style limitation

`retail-print-kit` 0.4.0 ignores per-cell `style` on `row` and `table` blocks. The table heading
and grand total therefore use pre-padded `text` blocks, while the item rows remain a `table` block.
A single product name cannot be bold without replacing the table renderer with custom padded text;
that trade-off remains a later styling refinement.

### Non-reproducible reference details

The reference PDF (`pdf-detail.md`) is 76.2 mm wide and mixes Consolas, Bookman Old Style, and
Calibri. Thermal ESC/POS output is monospaced only, so the separator font and phone-number font
cannot be reproduced exactly. The CSS dashed rule used by the preview is the closest practical
approximation.

## 6. Verification checklist

- [x] `npm test` - **70/70 passed**.
- [x] `npm run lint` - **0 errors**; the repository still reports Prettier/CRLF warnings.
- [x] `npm run build` - main, preload, and renderer bundles built successfully; the renderer resolves
      `retail-print-kit/browser`.
- [x] Browser and main-process renders produce identical operations.
- [x] Preview and Windows print produce identical canonical lines.
- [x] Every visible preview line occurs, in order, in the encoded ESC/POS payload.
- [x] 58 mm and 80 mm grids, optional fields, long descriptions, tables, logo, alignment, spacing,
      and bold sections covered.
- [x] Windows print path still produces HTML from the canonical lines.
- [x] Preview rendering does not share state with or interfere with either print path.
- [ ] Physical printer test (BC86AC / SNC-830) - **not performed**, hardware unavailable.

## 7. Risks and limitations

- The HTML preview is not byte-exact with physical output: printer firmware controls glyph shapes,
  line spacing, and raster/logo rendering.
- The preview now shows what the template prints, so its layout intentionally differs from the old
  legacy preview in some spacing and table details.
- The Windows system print now uses the template layout, so Windows receipts change appearance while
  retaining the same printing mechanism.
- Hardware behaviour of the new layout is unverified; only the byte stream, preview, and build were
  tested.
