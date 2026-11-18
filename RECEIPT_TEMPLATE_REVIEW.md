# Receipt Template Implementation — Inspection Report

**Scope:** `invoice-gen/app/src/` (renderer + main + shared) and `app/tests/`. No code was modified. Report describes what is actually implemented.

---

## 1. Template Architecture

The receipt is **not** a React component tree, canvas, or single HTML template. It is a **canonical line array** produced in `shared/receipt.js` and consumed three different ways, each with its own renderer:

| Consumer | File | Rendering technology |
|---|---|---|
| Live preview | `renderer/src/invoice/ReceiptPreview.jsx` + `.css` | React + HTML/CSS monospace block |
| Windows system printer | `main/printing.js` `receiptLinesToHtml()` + `main/system-print.js` `printSystem()` | Standalone HTML document printed via Electron `webContents.print()` in an offscreen `BrowserWindow` |
| LAN ESC/POS printer | `main/printing.js` `escPosBytes()` + `sendNetwork()` | Raw ESC/POS byte stream over TCP socket (port 9100) |

The line model (documented at `shared/receipt.js:67-75`) is:
- `{ text, align: 'left'|'center'|'right', bold }` — a text line
- `{ type: 'divider', character }` — dashed rule
- `{ type: 'logo' }` — logo raster, resolved per-consumer

There is **one** template function: `buildShippingReceiptLines()` (`shared/receipt.js:76`). Despite the `invoice_items` table existing in SQLite (`main/database.js:72-81`), the template never iterates multiple items — it hardcodes a single row (`shippingService || 'Prepaid Mail'`, qty 1). Migration v2's comment at `main/database.js:106` confirms: "The shipping receipt is the only template now."

---

## 2. Data Flow — Form → Receipt Content

**Entry point:** `renderer/src/pages/NewInvoicePage.jsx`
- `NewInvoicePage` calls `window.invoiceApi.getBootstrap()` (`preload/index.js:5`, `main/index.js:146-155`) to load company + printer profile + next invoice number.
- `NewInvoiceEditor` creates a `@mantine/form` (`InvoiceForm.jsx:69`, controlled mode) and a `receipt` memo (`NewInvoicePage.jsx:108-127`) flattening form values into:
  ```js
  { invoiceDate, invoiceTime, trackingNumber, subtotal, insurance, total,
    shippingFrom, shippingService, destinationAddress, packageWeight,
    expectedDeliveryDate, insuranceLabel, currency }
  ```
  `subtotal`/`insurance` come from `safeMoney()` (`NewInvoicePage.jsx:56-62`) which wraps `parseMoneyToMinorUnits` (`shared/invoice.js:23-37`) and returns `0` on invalid input.
- `receiptLines` memo (`NewInvoicePage.jsx:129-137`) calls `buildShippingReceiptLines({ receipt, company: bootstrap.company, printer: bootstrap.printer })`.

**`buildShippingReceiptLines`** (`shared/receipt.js:76-165`), the heart of the template:
1. `width = characterWidth` from printer profile (default 48); `currency` from receipt/company/USD fallback.
2. `price = subtotal`, `insurance`, `total = price + insurance`.
3. If `company.logoPath || company.logoDataUrl` → push `{ type: 'logo' }` (line 85).
4. `shippingFrom` (company sender block, prefilled from Settings — **not editable in the form**) split on `\n`, each line centered via `optionalLine()` (lines 87-89).
5. Blank line, then date + time combined via `formatColumns()` (left=date, right=time, line 94-101).
6. `{ type: 'divider' }` (line 102).
7. Table header row `['Product','Qty','Unit Price','Price']` bold via `formatTableRow()` (lines 103-108), divider (line 108).
8. Single item row: `[shippingService || 'Prepaid Mail', '1', '', money(price)]` (lines 110-113).
9. Blank line (116).
10. Optional lines: destination address (`'  '` prefix), weight (`'  Weight: '` prefix), Expected Delivery Date label + value, Tracking # label + grouped value (lines 118-134). **These are not wrapped.**
11. Blank line (136).
12. Insurance row via `formatColumns(insuranceLabel, money(insurance))` if `insuranceLabel || insurance > 0` (lines 137-142).
13. `Total` row, divider, `Grand Total:` bold row, divider (lines 146-153).
14. Blank line, then footer paragraphs `FOOTER_TRACKING` and `FOOTER_INSURANCE` (lines 4-7 constants), each wrapped via `wrapText()` and centered, followed by a blank line (lines 157-162).

**Helpers:**
- `wrapText(input, width)` (`shared/receipt.js:9-34`) — word-wrap on whitespace to character width; empty paragraph yields `['']`.
- `formatColumns(left, right, width)` (`shared/receipt.js:36-42`) — left field padded, right field right-aligned; guarantees ≤ `width`.
- `formatTableRow(cells, width)` (`shared/receipt.js:45-60`) — 4 columns with fixed proportions: product 40%, qty boundary ≥ 50%, unit ≥ 80%; numeric columns right-padded.
- `optionalLine(lines, text, align, bold)` (`shared/receipt.js:62-65`) — skips empty/whitespace text (optional fields omitted entirely).
- Money: `formatMoney(minorUnits, currency)` (`shared/invoice.js:39-52`) via `Intl.NumberFormat`, currency symbol, NBSP→space.
- Dates/time/tracking: `shared/dates.js` — `formatReceiptDate` (`Mon 08/10/2026`), `formatReceiptTime` (12h), `groupTrackingNumber` (groups digits in 4s).

**Print payload** (`NewInvoicePage.jsx:142-192`, `handlePrint`): validates form, calls `normalizeShippingReceiptDraft(form.getValues(), invoiceId)` (`shared/invoice.js:54-92`) which produces `{ invoice, items }` (single item), then `window.invoiceApi.printInvoice(payload)` → `main/index.js:233-316` `invoice:print` handler:
- Saves invoice + items to SQLite (`database.saveInvoice`), sets print_status `printing`.
- Rebuilds lines via `buildShippingReceiptLines({ receipt: saved, company, printer })`.
- Branches on `printer.connectionType`: network → ESC/POS bytes over TCP; system → Windows print.

---

## 3. Live Preview

- `ReceiptPreview` (`ReceiptPreview.jsx:30-63`) receives `receiptLines`, `paperWidth` (58/80 mm), `characterWidth`, `logoDataUrl`.
- Geometry (`ReceiptPreview.jsx:31-32`):
  ```js
  const paperPx = Math.round(paperWidth * MM_TO_PX)   // MM_TO_PX = 3.78 (CSS px/mm @96dpi)
  const fontSize = Math.max(7, Math.min(14, Math.floor((paperPx - 16) / (characterWidth * CHAR_RATIO))))
  // CHAR_RATIO = 0.55 (monospace advance as fraction of font size)
  ```
  So font size is derived to fit `characterWidth` glyphs across the paper width minus 16px padding, clamped to 7–14px.
- Renders: each line as `.receipt-line` div with `align-${align}` and optional `bold` class; `type:'logo'` → ``; `type:'divider'` → dashed border; empty text → `.receipt-gap`; zero lines → `— receipt preview —`.
- CSS (`ReceiptPreview.css:16-26`): `font-family: Consolas, Courier New, DejaVu Sans Mono, monospace`; `line-height: 1.45`; `white-space: pre-wrap`; `word-break: break-word`.
- **Synchronization:** pure React data flow — `form.values` change → `receipt` memo → `receiptLines` memo → `ReceiptPreview` re-render. There is **no** explicit sync protocol, event bus, or print/preview normalization. The preview runs in the renderer; the actual print paths (Windows HTML, ESC/POS bytes) run in the main process and are **not** the same code that renders the preview.

---

## 4. Printing Pipeline

### 4a. Windows (installed/system) printers

Orchestrated in `main/index.js:271-274`:
```js
const logoDataUrl = (await withLogoDataUrl(company)).logoDataUrl
result = await printSystem(lines, printer, logoDataUrl)
```
`printSystem` (`main/system-print.js:4-43`):
1. Picks an owner window (`BrowserWindow.getFocusedWindow()` or first visible).
2. Creates a hidden `BrowserWindow` (`show: false`, sandboxed).
3. Generates HTML via `receiptLinesToHtml(lines, printer, logoDataUrl)` (`main/printing.js:154-179`) — a standalone `<!doctype html>` document:
   - `@page { size: ${paperWidth}mm auto; margin: 2mm }`
   - `body { width: ${printableWidth}mm; font: 12px Consolas,... }`
   - Each line → `<div style="text-align:...;font-weight:...;white-space:pre-wrap">`; logo → ``; divider → dashed border.
4. `window.loadURL('data:text/html;charset=utf-8,…')`.
5. `window.webContents.print({ silent, deviceName: printer.systemPrinterName, printBackground: true, margins: { marginType: 'none' } })`.
6. Destroys the offscreen window and restores focus to the owner.

`printSystem` returns `{ ok, message }` on success. The `invoice:print` handler (`main/index.js:276-294`) then sets `print_status = 'succeeded'`, writes a `print_history` row, and returns `{ invoice, print: { status, message, printerName } }`. On failure it sets status `failed`, records `errorMessage`, and returns `print.status = 'failed'`. The renderer shows a green or red notification accordingly (`NewInvoicePage.jsx:170-191`).

Key detail: `silent: true` is used only by the **Test** button (`main/index.js:220`). Real user prints use `silent: false`, which triggers the Windows print dialog. The margins option `{ marginType: 'none' }` tells Electron to ignore the printer's hardware margins and use the `@page` margin defined in the generated HTML (2mm).

### 4b. LAN ESC/POS printers (network path)

Orchestrated in `main/index.js:259-270`:
```js
const dotDensity = Number(printer.dotDensity) || 8
const printableDots = Math.round((Number(printer.printableWidthMm) || 72) * dotDensity)
const logo = rasterizeLogo(logoPath, { widthDots: Math.round(printableDots * 0.7) })
const bytes = escPosBytes(lines, printer.characterWidth, {
  cut: printer.cutAfterPrint,
  feed: printer.feedLinesAfterPrint,
  encoding: printer.encoding,
  logo,
  printableDots
})
result = await sendNetwork(printer, bytes)
```

**`escPosBytes`** (`main/printing.js:34-98`) builds a `Buffer`:
- Opens with `ESC @` (initialize printer), then selects code page via `ESC t n` if the encoding is in the `codePages` map (`cp437`, `cp850`, `cp860`, `cp863`, `cp865`, `win1252`, `cp852`, `cp858`).
- For each line:
  - `type: 'feed'` → writes `line.lines` empty lines.
  - `type: 'divider'` → repeats `character` to `width`, followed by newline.
  - `type: 'logo'` → if logo data exists, sets left alignment, writes pad spaces (rough center: `(printableDots - logo.widthDots) / 2` dots converted to spaces at 12 dots/char), then emits `GS v 0` raster command with `bytesPerRow`, `heightDots`, and the raw 1bpp bitmap. Uses `writeBuffer` to keep stream order.
  - Text lines → `ESC a n` (alignment: 0/1/2), `ESC E n` (bold on/off), `ESC - n` (underline off), then `wrapText(text, width)` chunks each followed by `0x0a` newline.
- Ends with `feed` blank lines, then `GS V 48` (cut) if `cut: true`.

**`sendNetwork`** (`main/printing.js:100-138`) opens a raw TCP `net.Socket` to `networkHost:networkPort` (default 9100), sets a timeout, writes the buffer, and resolves on socket `close` with `{ ok, message, bytes }`. It explicitly notes physical output is not guaranteed — no ACK/NAK from the printer is read back.

**`rasterizeLogo`** (`main/logo-raster.js:9-33`): loads the logo via Electron `nativeImage.createFromPath`, resizes to `widthDots` (default 400), converts to 1-bit-per-pixel using a fixed gray threshold of 140 (no dithering), packs MSB-first into rows. Documented shortcut: fixed threshold, no dithering.

---

## 5. Dimensions & Formatting

**Paper presets** (`shared/paper.js:3-6`):
```js
80: { paperWidthMm: 80, printableWidthMm: 72, characterWidth: 48 }
58: { paperWidthMm: 58, printableWidthMm: 50, characterWidth: 32 }
```
8 mm side margins assumed (4 mm each). `paperPreset()` falls back to 80 mm for unknown widths.

**Preview sizing** (`ReceiptPreview.jsx:31-32`): `paperPx = mm × 3.78` (96 dpi). Font size derived from `(paperPx − 16) / (characterWidth × 0.55)`, clamped 7–14 px. So at 80 mm / 48 chars: `(302 − 16) / 26.4 ≈ 10.8 → 10px`. At 58 mm / 32 chars: `(219 − 16) / 17.6 ≈ 11.5 → 11px`.

**Character-grid guarantees:**
- `wrapText` guarantees each wrapped chunk ≤ `width` chars.
- `formatColumns` guarantees ≤ `width`.
- `formatTableRow` slices each cell to its column width, so the concatenated row ≤ `width`.
- The printer test asserts every non-typed line ≤ 42 chars for a 42-char config (`receipt.test.js:65-71`).

**Typography:** Preview uses Consolas/Courier New/DejaVu Sans Mono monospace, `line-height: 1.45`, `white-space: pre-wrap`, `word-break: break-word`. Windows HTML path uses `font: 12px Consolas, "Courier New", monospace` at `printableWidth mm` body width. ESC/POS path relies on the printer's internal Font A grid (12 dots/char assumed).

**Alignment:** CSS `text-align` in preview and HTML path; `ESC a n` in ESC/POS (left=0, center=1, right=2).

**Bold:** `font-weight: 700` in preview; `font-weight: 700` inline in HTML path; `ESC E 1` in ESC/POS.

**Spacing:** blank `{ text: '' }` lines become `.receipt-gap` (0.7em height) in preview, empty divs in HTML path, and `write('')` newlines in ESC/POS. Dividers are dashed borders (preview/HTML) or repeated `-` chars (ESC/POS).

**Wrapping:** Only footer paragraphs and ESC/POS text lines are wrapped via `wrapText`. The address, weight, expected-delivery, and tracking lines are emitted unwrapped — they can exceed `characterWidth` on narrow paper.

---

## 6. Code Structure — Files & Responsibilities

**Shared (isomorphic, runs in renderer and main):**
- `shared/receipt.js` — `buildShippingReceiptLines()` (the single template), `wrapText()`, `formatColumns()`, `formatTableRow()`, `optionalLine()`. Canonical line model.
- `shared/invoice.js` — `parseMoneyToMinorUnits()`, `formatMoney()`, `sanitizeMoneyInput()`, `normalizeShippingReceiptDraft()` (form → `{invoice, items}`), `storedShippingReceiptToDraft()` (stored → draft).
- `shared/dates.js` — `formatReceiptDate()`, `formatReceiptTime()`, `groupTrackingNumber()`, `parseLocalDate()`.
- `shared/paper.js` — `PAPER_PRESETS`, `paperPreset()`.
- `shared/shipping-services.js` — `SHIPPING_SERVICES` list, default.

**Renderer (React + Mantine):**
- `renderer/src/pages/NewInvoicePage.jsx` — page shell, bootstraps via `invoiceApi.getBootstrap()`, holds form + `receipt` + `receiptLines` memos, `handlePrint` (validates → `printInvoice`).
- `renderer/src/pages/InvoiceForm.jsx` — the editable form fields (date, time, tracking, price, service, destination, weight, expected delivery, insurance label/amount). `shippingFrom` is NOT a form field; it comes from company settings.
- `renderer/src/pages/ReceiptPreview.jsx` + `.css` — live physical-paper preview.
- `renderer/src/App.jsx` — shell/sidebar/toolbar/view routing.
- `renderer/src/settings/SettingsModal.jsx` — company + printer sections.
- `renderer/src/settings/CompanyMetadataSection.jsx` — company name/address/phone/email/currency/logo.
- `renderer/src/settings/PrinterSettingsSection.jsx` — connection type, network/host/port, system printer, paper width (58/80), printable width, character width, dot density, encoding, cut/feed, test print.
- `renderer/src/preload/index.js` — `contextBridge.exposeInMainWorld('invoiceApi', {...})` exposing 14 IPC methods.

**Main (Electron/Node):**
- `main/index.js` — app lifecycle, window creation, IPC handlers including `invoice:bootstrap`, `invoice:print` (the print orchestrator), `printer:test`, logo choose, DB-backed CRUD.
- `main/printing.js` — `escPosBytes()` (ESC/POS encoder), `sendNetwork()` (TCP), `sanitizeEscPosText()`, `receiptLinesToHtml()` (Windows HTML generator).
- `main/system-print.js` — `printSystem()` (offscreen BrowserWindow + `webContents.print`).
- `main/logo-raster.js` — `rasterizeLogo()` (1bpp ESC/POS raster).
- `main/database.js` — SQLite store (company, printer profiles, invoices, invoice_items, print_history), migrations v1/v2.

**Libraries:** React 19, Mantine 9, `@tabler/icons-react`, `iconv-lite` (ESC/POS code pages), Electron 45 (nativeImage, webContents.print, net.Socket), `node:sqlite`.

---

## 7. Known Limitations (from inspection)

1. **Single item only.** Despite `invoice_items` table supporting multiple rows, `normalizeShippingReceiptDraft` builds exactly one item (`shippingService || 'Prepaid Mail'`, qty 1). Multi-item receipts are not supported by the template.

2. **Preview/print divergence.** `ReceiptPreview` (React/CSS) and the Windows print path (`receiptLinesToHtml` + Electron `webContents.print`) are separate implementations. ESC/POS is a third. Font metrics, wrapping, and divider rendering differ across the three; what you see in preview is not byte-identical to what prints.

3. **Unwrapped optional fields.** Destination address, weight, expected delivery, and tracking lines bypass `wrapText` (`shared/receipt.js:118-134`), so long values can exceed `characterWidth` and overflow narrow (58 mm) paper.

4. **Preview font-size heuristic.** `CHAR_RATIO = 0.55` and `MM_TO_PX = 3.78` are approximations; actual glyph advance varies by font and OS, so lines may not align perfectly to the character grid on screen.

5. **Logo handling asymmetry.** Preview renders the logo as an `` (scaled by CSS). ESC/POS rasterizes it via `rasterizeLogo` (fixed threshold 140, no dithering, width capped at 70% of printable dots). Windows HTML renders it as an `` inline. Three different representations.

6. **No printable-area preview clipping.** The preview draws at full `paperWidth` with 8px CSS padding; it does not simulate the 2mm `@page` margin or hardware printable area used by the Windows path.

7. **ESC/POS fire-and-forget.** `sendNetwork` resolves on socket close and explicitly states physical output is not guaranteed — no printer status/Ack is read back.

8. **Network test uses different lines than real print.** `printer:test` builds its own 4-line test job rather than reusing `buildShippingReceiptLines`, so a passing test doesn't validate the actual template encoding.

9. **Windows print dialog on real prints.** `silent: false` means every user print triggers the native print dialog; there's no silent default-printer path for production receipts.

10. **`shippingFrom` not editable in the form.** It's populated from company settings at bootstrap (`companyShippingBlock`) and can't be overridden per-receipt in the UI.

11. **Migration v2 deletes all invoice/print data.** `main/database.js:106-110` wipes `invoice_items`, `print_history`, `invoices` on migration — data-loss risk on schema upgrades.

12. **`dotDensity` stored but only used for ESC/POS logo sizing.** Not used in preview or Windows HTML, so logo scale differs between ESC/POS and other paths.

---

*End of report. Nothing was modified during this inspection.*