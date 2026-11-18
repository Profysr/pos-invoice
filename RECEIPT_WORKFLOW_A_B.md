# Receipt Workflow Investigation — Parts A & B

**Source:** `app/src/` (renderer, main, shared), `app/tests/`. No code modified.

---

## A. Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 0: SETTINGS (one-time configuration)                                  │
│                                                                             │
│  SettingsModal (renderer/src/settings/SettingsModal.jsx)                    │
│    ├─ CompanyMetadataSection (CompanyMetadataSection.jsx)                   │
│    │   └─ Saves: company name, address, phone, email, currency, logo path  │
│    └─ PrinterSettingsSection (PrinterSettingsSection.jsx)                   │
│        └─ Saves: connection type, host/port, system printer, paper width,   │
│             character width, encoding, cut/feed, dot density               │
│                                                                             │
│  IPC: company:save, printer:save  →  main/index.js handlers  →  database.js │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: FORM INPUT (renderer)                                              │
│                                                                             │
│  NewInvoicePage (renderer/src/pages/NewInvoicePage.jsx)                     │
│    ├─ Calls window.invoiceApi.getBootstrap() → main/index.js                │
│    │   Returns: company (with logoDataUrl), printer profile, invoice number│
│    │                 date/time, invoiceNumber                              │
│    ├─ NewInvoiceEditor component                                            │
│    │   ├─ @mantine/form (controlled mode): date, time, trackingNumber,     │
│    │   │       price, service, destination, weight, expectedDeliveryDate,  │
│    │   │       insuranceLabel, insuranceAmount, currency                   │
│    │   └─ shippingFrom is NOT a form field — comes from company settings   │
│    │                                                                       │
│    │   Validation (form.validate): date, time, tracking, price required;   │
│    │   tracking must be alphanumeric; price must parse as money            │
│    │                                                                       │
│    │   Form changes → receipt memo (builds receipt object)                 │
│    │   Form changes → receiptLines memo (calls buildShippingReceiptLines)  │
│    │                                                                       │
│    └─ Rendered side-by-side: InvoiceForm (left, 57%) + ReceiptPreview (right)│
│                                                                             │
│  IPC: getBootstrap  →  main/index.js:invoice:bootstrap  →  database.js      │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓  (user clicks Print)
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 2: PRINT PAYLOAD CONSTRUCTION (renderer)                              │
│                                                                             │
│  handlePrint (NewInvoicePage.jsx:142-192)                                   │
│    ├─ form.validate() — block if errors                                     │
│    ├─ normalizeShippingReceiptDraft(form.getValues(), invoiceId)            │
│    │      (shared/invoice.js:54-92)                                        │
│    │   Returns: { invoice: {...}, items: [{id, description, quantityMilli, │
│    │                              unitPrice, lineTotal}] }                 │
│    │   Note: items always contains exactly ONE item                        │
│    │      (shippingService || 'Prepaid Mail', qty=1, price=subtotal)       │
│    └─ window.invoiceApi.printInvoice(payload)                               │
│                                                                             │
│  IPC: printInvoice  →  main/index.js:invoice:print handler                  │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 3: DATABASE SAVE (main)                                               │
│                                                                             │
│  main/index.js:233-316 (invoice:print IPC handler)                          │
│    ├─ database.saveInvoice(payload.invoice, payload.items)                  │
│    │      (database.js:535-641) — upsert invoice, replace all items        │
│    ├─ database.setInvoicePrintStatus(id, 'printing')                        │
│    └─ Fetch printer profile (database.getPrinter('default'))                │
│    └─ Fetch company (database.getCompany())                                 │
│                                                                             │
│  Branches on printer.connectionType:                                        │
│    ├─ 'network'  → ESC/POS path (Stage 4a)                                  │
│    └─ 'system'   → Windows print path (Stage 4b)                            │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 4a: ESC/POS LAN PRINTING (main)                                       │
│                                                                             │
│  main/index.js:259-270                                                      │
│    ├─ rasterizeLogo(logoPath, {widthDots})  (main/logo-raster.js)           │
│    │      → 1-bit-per-pixel bitmap, fixed threshold 140, no dithering      │
│    ├─ escPosBytes(lines, characterWidth, options)  (main/printing.js:34)   │
│    │      → Buffer of ESC/POS command bytes                                 │
│    └─ sendNetwork(profile, buffer)  (main/printing.js:100)                  │
│           → TCP socket to networkHost:networkPort (default 9100)            │
│           → Resolves on socket close (fire-and-forget, no printer ACK)      │
│                                                                             │
│  buildShippingReceiptLines is called again here (lines rebuilt from saved   │
│  receipt + company + printer)                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 4b: WINDOWS SYSTEM PRINTING (main)                                    │
│                                                                             │
│  main/index.js:271-274                                                      │
│    ├─ withLogoDataUrl(company) → logoDataUrl (base64 data URI)              │
│    └─ printSystem(lines, printer, logoDataUrl)  (main/system-print.js:4)    │
│        ├─ Create hidden offscreen BrowserWindow (sandboxed)                 │
│        ├─ receiptLinesToHtml(lines, printer, logoDataUrl)                   │
│        │      (main/printing.js:154) → standalone HTML document string     │
│        ├─ window.loadURL('data:text/html;...')                              │
│        ├─ window.webContents.print({silent, deviceName, printBackground,    │
│        │   margins: {marginType:'none'}})                                    │
│        └─ Destroy window, restore focus to owner window                     │
│                                                                             │
│  silent=false for real prints (shows Windows print dialog)                  │
│  silent=true for printer:test                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 5: STATUS & ERROR HANDLING (main → renderer)                          │
│                                                                             │
│  main/index.js:276-315                                                      │
│    ├─ Success: setInvoicePrintStatus(id, 'succeeded')                       │
│    │    addPrintHistory({status:'succeeded'})                               │
│    │    Return: {invoice, print:{status:'succeeded', message, printerName}}│
│    ├─ Failure: setInvoicePrintStatus(id, 'failed')                          │
│    │    addPrintHistory({status:'failed', errorMessage})                    │
│    │    Return: {invoice, print:{status:'failed', message, printerName}}    │
│                                                                             │
│  Renderer (NewInvoicePage.jsx:170-191):                                     │
│    ├─ status succeeded → green notification                                 │
│    └─ status failed → red notification                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 6: LIVE PREVIEW (renderer, continuous)                                │
│                                                                             │
│  Runs in parallel with form, not part of print pipeline                     │
│    ReceiptPreview (renderer/src/invoice/ReceiptPreview.jsx)                 │
│    ├─ Props: receiptLines, paperWidth, characterWidth, logoDataUrl          │
│    ├─ Derives paperPx = paperWidth × 3.78 (96 dpi)                          │
│    ├─ Derives fontSize from (paperPx − 16) / (characterWidth × 0.55)        │
│    │      clamped 7–14px                                                    │
│    ├─ Maps each line to .receipt-line div with align/bold classes           │
│    ├─ {type:'logo'} → image, {type:'divider'} → dashed border               │
│    └─ CSS: monospace font, line-height 1.45, white-space: pre-wrap          │
│                                                                             │
│  Synchronization: form.values → receipt memo → receiptLines memo → re-render│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## B. File/Function Map

### Stage 0 — Settings

| File | Function | Input | Output | Responsibility |
|---|---|---|---|---|
| `renderer/src/settings/SettingsModal.jsx` | `SettingsModal` | `opened`, `onClose` | JSX modal | Hosts company + printer sections; loads/saves via IPC |
| `renderer/src/settings/CompanyMetadataSection.jsx` | `CompanyMetadataSection` | `initialData`, `onSave`, `onChooseLogo` | JSX form | Company name, address, phone, email, currency, logo |
| `renderer/src/settings/PrinterSettingsSection.jsx` | `PrinterSettingsSection` | `initialData`, `systemPrinters`, `onSave`, `onTest` | JSX form | Connection type, network/host/port, system printer, paper (58/80 mm), char width, encoding, cut/feed, dot density |
| `app/src/shared/paper.js` | `PAPER_PRESETS`, `paperPreset()` | `paperWidthMm` | `{paperWidthMm, printableWidthMm, characterWidth}` | 80 mm → 72/48; 58 mm → 50/32; unknown → 80 mm fallback |
| `main/index.js` | `company:save` IPC | values | saved company + logoDataUrl | Persists company to SQLite |
| `main/index.js` | `printer:save` IPC | values | saved printer | Persists printer profile to SQLite |
| `main/database.js` | `saveCompany`, `savePrinter` | input values | database row | Validates and upserts company/printer |

### Stage 1 — Form Input & Bootstrap

| File | Function | Input | Output | Responsibility |
|---|---|---|---|---|
| `renderer/src/pages/NewInvoicePage.jsx` | `NewInvoicePage` | `editInvoice` | JSX page | Bootstraps via `getBootstrap()`; hosts editor |
| `renderer/src/pages/NewInvoicePage.jsx` | `NewInvoiceEditor` | `bootstrap`, `editInvoice` | JSX editor | Creates form, receipt memo, receiptLines memo, handlePrint |
| `renderer/src/pages/NewInvoicePage.jsx` | `companyShippingBlock()` | `company` object | string | Joins name + address lines + phone with `\n` |
| `renderer/src/pages/NewInvoicePage.jsx` | `createInitialValues()` | `bootstrap` | form values | Defaults date/time, shippingFrom from company, service default |
| `renderer/src/pages/NewInvoicePage.jsx` | `safeMoney()` | string value | number (minor units) or 0 | Parses money, returns 0 on error |
| `renderer/src/pages/NewInvoicePage.jsx` | `receipt` memo | `form.values` | `{invoiceDate, invoiceTime, trackingNumber, subtotal, insurance, total, shippingFrom, shippingService, destinationAddress, packageWeight, expectedDeliveryDate, insuranceLabel, currency}` | Flattens form values into receipt object |
| `renderer/src/pages/NewInvoicePage.jsx` | `receiptLines` memo | `receipt`, `bootstrap` | array of line objects | Calls `buildShippingReceiptLines()` |
| `renderer/src/pages/NewInvoicePage.jsx` | `handlePrint` | (click) | void | Validates, normalizes draft, calls printInvoice |
| `renderer/src/pages/InvoiceForm.jsx` | `InvoiceForm` | `form`, `title`, `onPrint`, `printing` | JSX form | Editable fields: date, time, tracking, price, service, destination, weight, expected delivery, insurance label/amount |
| `app/src/shared/invoice.js` | `normalizeShippingReceiptDraft()` | `values`, `id` | `{invoice, items}` | Required fields validated; builds single item; throws on missing/invalid |
| `app/src/shared/invoice.js` | `parseMoneyToMinorUnits()` | string, field | integer (cents) | Parses currency to minor units, validates format |
| `app/src/shared/invoice.js` | `formatMoney()` | minorUnits, currency, locale | string | `Intl.NumberFormat` currency formatting |
| `app/src/shared/dates.js` | `formatReceiptDate()`, `formatReceiptTime()`, `groupTrackingNumber()` | string | formatted string | Date → "Mon 08/10/2026"; time → "6:06 PM"; tracking → grouped by 4s |
| `app/src/preload/index.js` | `invoiceApi` bridge | — | 14 methods | `contextBridge.exposeInMainWorld` — exposes IPC to renderer |

### Stage 2 — Receipt Template (the core)

| File | Function | Input | Output | Responsibility |
|---|---|---|---|---|
| `app/src/shared/receipt.js` | `buildShippingReceiptLines()` | `{receipt, company, printer}` | `lines[]` | **The single receipt template** — builds canonical line array |
| `app/src/shared/receipt.js` | `wrapText()` | `input`, `width` | `string[]` | Word-wraps text to character width |
| `app/src/shared/receipt.js` | `formatColumns()` | `left`, `right`, `width` | string | Left-padded label + right-aligned value, ≤ width |
| `app/src/shared/receipt.js` | `formatTableRow()` | `cells[]`, `width` | string | 4-column product/qty/unit/price row, fixed proportions |
| `app/src/shared/receipt.js` | `optionalLine()` | `lines`, `text`, `align`, `bold` | void | Pushes line only if text non-empty |

### Stage 3 — Consumers of Receipt Lines

| File | Function | Input | Output | Responsibility |
|---|---|---|---|---|
| `renderer/src/invoice/ReceiptPreview.jsx` | `ReceiptPreview` | `receiptLines`, `paperWidth`, `characterWidth`, `logoDataUrl` | JSX preview | Renders lines as HTML/CSS monospace block |
| `app/src/main/printing.js` | `receiptLinesToHtml()` | `lines`, `printer`, `logoDataUrl` | HTML string | Standalone HTML document for Windows print |
| `app/src/main/printing.js` | `escPosBytes()` | `lines`, `width`, `options` | `Buffer` | ESC/POS command bytes |
| `app/src/main/printing.js` | `sendNetwork()` | `profile`, `data` | `{ok, message, bytes}` | TCP socket to LAN printer |
| `app/src/main/system-print.js` | `printSystem()` | `lines`, `printer`, `logoDataUrl`, `options` | `{ok, message}` | Offscreen BrowserWindow + `webContents.print()` |
| `app/src/main/logo-raster.js` | `rasterizeLogo()` | `logoPath`, `{widthDots, threshold}` | `{data, bytesPerRow, widthDots, heightDots}` | 1bpp ESC/POS logo raster |

### Stage 4 — ESC/POS Printing Details

| File | Function | Input | Output | Responsibility |
|---|---|---|---|---|
| `app/src/main/printing.js` | `escPosBytes()` | `lines`, `width=48`, `options` | `Buffer` | ESC @ init, code page select, per-line ESC commands, GS v 0 logo, GS V cut |
| `app/src/main/printing.js` | `sanitizeEscPosText()` | string | string | Strips control chars, maps smart quotes, drops non-printable |
| `app/src/main/printing.js` | `sendNetwork()` | `profile`, `data` | Promise | `net.Socket` TCP to host:port, timeout, resolve on close |
| `app/src/main/logo-raster.js` | `rasterizeLogo()` | path, options | 1bpp bitmap | `nativeImage.createFromPath`, resize, gray threshold, pack MSB-first |

### Stage 5 — Windows Printing Details

| File | Function | Input | Output | Responsibility |
|---|---|---|---|---|
| `app/src/main/system-print.js` | `printSystem()` | `lines`, `printer`, `logoDataUrl`, `options` | Promise | Creates hidden BrowserWindow, loads HTML, calls `webContents.print()` |
| `app/src/main/printing.js` | `receiptLinesToHtml()` | `lines`, `printer`, `logoDataUrl` | HTML string | `@page` size/margin, body width=printableWidth, inline-styled divs |

### Stage 6 — Status & Database

| File | Function | Input | Output | Responsibility |
|---|---|---|---|---|
| `main/database.js` | `saveInvoice()` | `input`, `items[]` | invoice row | Upsert invoice, delete+reinsert all items, calculate subtotal/total |
| `main/database.js` | `setInvoicePrintStatus()` | `id`, `status` | boolean | Updates print_status column |
| `main/database.js` | `addPrintHistory()` | input | history row | Records printer, connection method, status, error, timestamp |
| `main/index.js` | `invoice:print` IPC | `payload` | `{invoice, print}` | Orchestrates save → branch to ESC/POS or Windows → record history |

---

*End of Parts A & B. Next: Part C (receipt design analysis vs reference PDF).*
