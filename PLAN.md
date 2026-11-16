# Invoice Generator — implementation plan

## Current status

- **Plan revised:** 2026-11-17
- **Implementation status:** Not started
- **Approval rule:** Each phase requires explicit user approval before any implementation work begins. A general approval does not automatically approve later phases.

## Direction

Build a small, purpose-built invoice application from scratch. Do not use the upstream Receipt Studio UI or ship it as a fork.

Use [Receipt Studio](https://github.com/Ytosko/Receipt-Studio) only as a reviewed source for the printing and receipt-rendering implementation that is difficult to recreate safely.

### Stack

- Electron 45
- React 19 with JavaScript/JSX
- Vite with `electron-vite`
- SQLite through Electron's built-in `node:sqlite`
- Plain CSS; no UI framework
- Windows 10/11 x64
- ESC/POS receipt output

### Confirmed decisions

- Keep the original plan's SQLite persistence.
- Do not include PDF export, QR generation, barcode generation, cash-drawer support, authentication, cloud sync, or currency conversion.
- Company metadata is global and shared by every invoice.
- The application UI is custom and much simpler than Receipt Studio.
- Do not add `node-thermal-printer`; use the smaller encoder pattern already implemented by Receipt Studio.
- Use `iconv-lite` for receipt character encoding.
- Keep the upstream MIT license and attribution for all ported source.

## Receipt Studio source review

Source inspected at upstream commit `8e758eb0d129523a334bfb23953090ed216f7521` (v1.3.5).

The following implementation may be ported and adapted:

| Upstream source | Reuse |
| --- | --- |
| `src/main/printing/escpos.ts` | ESC/POS initialization, character encoding, alignment, bold/underline, text wrapping, columns, dividers, raster images, and cut command |
| `src/main/printing/printer.ts` | Raw TCP LAN printing, socket timeout, and clear connection/write errors |
| `src/main/receipt/render.ts` | Canonical receipt-line model and width-aware wrapping shared by preview and output |
| `src/main/main.ts` (`renderWithAssets`, `printLines`) | Logo rasterization and Windows installed-printer printing through Electron |
| `shared/money.ts` | Integer minor-unit money calculations and formatting |
| `shared/schemas.ts` (`printerSchema`) | Printer profiles for paper width, printable width, character width, encoding, timeout, and cut behavior |
| `tests/unit/receipt.test.ts` | Test cases to adapt for the new invoice receipt model |

Do **not** port:

- POS navigation, dashboard, products, stock, loyalty, refunds, replacements, payment methods, labels, barcode scanners, or multi-shop management
- Upstream JSON repository; this project keeps SQLite
- PDF and QR output
- Cash-drawer commands
- Upstream styling and page design

## Application scope for version 1

### Sidebar

A small persistent sidebar with:

- **New Invoice**
- **Saved Invoices**
- **Company Metadata** button that opens the company metadata modal

### Company metadata modal

Opened from the sidebar and persisted for use by every invoice:

- Company name
- Address
- Phone
- Email
- Logo upload (PNG/JPEG)
- Default currency

Company details are not repeated in the invoice form.

### Main page

One page with a compact toolbar and two columns:

1. **Invoice form**
   - Invoice number/ID
   - Customer/destination details
   - Date and time
   - Product/service line items: description, quantity, unit price
   - Shipping service
   - Destination address
   - Package weight
   - Expected delivery date
   - Tracking number
   - Optional insurance amount
   - Currency
   - Terms/support/tracking instructions for the footer
2. **Live receipt preview**
   - Proportional to the selected paper width
   - Logo, company header, invoice/customer details, items, shipping/tracking, totals, and footer
   - Updates immediately as the form changes

Toolbar actions:

- Save invoice
- New/clear invoice
- Print
- Printer settings

### Printer settings

- LAN TCP or installed Windows printer
- LAN host/IP and port (default `9100`)
- Installed Windows printer name
- Paper width: 58 mm or 80 mm
- Printable width and character width
- Receipt encoding
- Feed lines and cut after print

### Saved invoices

- Save, list, load, and delete invoices
- Persist invoice header, line items, totals, shipping/tracking details, and print status
- Persist global company metadata, logo metadata, and printer preferences

### Money rules

All money is stored and calculated as integer minor units:

- Item total = quantity × unit price
- Subtotal = sum of item totals
- Grand total = subtotal + optional insurance
- Shipping service information is informational in version 1 and does not change the total unless a shipping-charge field is explicitly approved later

## Printing strategy

### LAN printer

Port and adapt Receipt Studio's raw TCP printer:

- Connect to the printer host and port, normally `9100`
- Apply a connection timeout
- Send the generated ESC/POS byte buffer
- Report unreachable, timeout, and write failures clearly
- A successful socket write means bytes were delivered; it does not guarantee physical output

### Windows installed printer

Use Receipt Studio's Electron system-print path:

- Render the canonical receipt lines as paper-width HTML
- Print through `webContents.print` to the selected installed Windows printer
- Do not add the previously proposed PowerShell/`winspool` helper

The installed-printer path is not raw ESC/POS. Logo, cut, and exact thermal formatting depend on the installed printer driver. If the BC86AC or SNC-830 requires raw ESC/POS through USB/Windows, stop after physical verification and ask before adding a second printing path.

## Planned project structure

```text
invoice-gen/
├─ package.json
├─ electron.vite.config.mjs
├─ index.html
├─ LICENSE
├─ THIRD_PARTY_NOTICES.md
├─ src/
│  ├─ main/
│  │  ├─ index.js
│  │  ├─ database.js
│  │  ├─ settings.js
│  │  └─ printer.js
│  ├─ preload/
│  │  └─ index.js
│  ├─ renderer/
│  │  ├─ index.html
│  │  └─ src/
│  │     ├─ main.jsx
│  │     ├─ App.jsx
│  │     ├─ styles.css
│  │     ├─ components/
│  │     │  ├─ Sidebar.jsx
│  │     │  ├─ CompanyMetadataDialog.jsx
│  │     │  ├─ PrinterSettingsDialog.jsx
│  │     │  ├─ InvoiceForm.jsx
│  │     │  └─ ReceiptPreview.jsx
│  └─ shared/
│     ├─ invoice.js
│     └─ receipt.js
├─ resources/
│  └─ icon.png
└─ tests/
   ├─ invoice.test.js
   └─ receipt.test.js
```

`src/shared/receipt.js` is the single canonical receipt formatter. The renderer preview and main-process printer consume the same receipt-line model.

## Command-only environment and setup rules

- Install all packages with `npm install` or `npm ci`; do not manually download package archives or installers.
- Install and run Electron, Vite, tests, and packaging through project scripts; do not manually install application files.
- Run setup and verification commands from the project root.
- If a command requires administrator approval, GitHub authentication, a vendor printer driver, physical printer access, or another action only the user can perform, stop and ask the user for that specific help.
- Do not tell the user to perform broad manual setup when a command can do it.
- If any requirement is unclear, ask the smallest possible clarifying question immediately and stop that phase. Do not guess.

### Initial package commands

These run only after Phase 1 is approved:

```powershell
Set-Location 'C:\Users\mprof\OneDrive\Desktop\invoice-gen'
npm init -y
npm install react@19 react-dom@19 zod@4 iconv-lite
npm install -D electron@45 electron-vite vite @vitejs/plugin-react electron-builder
```

After `package-lock.json` exists, repeatable installs use:

```powershell
npm ci
```

### Reference-source command

Do not add the upstream application as a dependency. Keep a temporary reference clone for source comparison and attribution:

```powershell
$Reference = Join-Path $env:TEMP 'Receipt-Studio-reference'
if (-not (Test-Path -LiteralPath $Reference)) {
  git clone --depth 1 https://github.com/Ytosko/Receipt-Studio.git $Reference
} else {
  git -C $Reference pull --ff-only
}
git -C $Reference rev-parse HEAD
```

### Development and verification commands

```powershell
npm run dev
npm test
npm run build
npm run dist
```

`npm run dist` must create an NSIS installer and portable executable under `release/`.

## Implementation phases

Each phase starts only after the user explicitly approves that phase.

### Phase 0 — Validate the source and plan

- Preserve the inspected upstream commit and license information
- Confirm which receipt-rendering and printing portions will be ported
- Resolve any remaining invoice-numbering or final-template ambiguity with one focused question

**Done when:** The user approves the revised plan and the numbered phases.

### Phase 1 — Scaffold the application

- Create the minimal Electron/React project structure
- Configure `electron-vite`
- Install packages with the commands above
- Add `dev`, `test`, `build`, and `dist` scripts
- Launch a minimal secure window

**Verify:** `npm run dev` opens the application; `npm run build` succeeds.

### Phase 2 — Secure shell and SQLite foundation

- Enable context isolation, disable renderer Node integration, and expose only required preload APIs
- Create SQLite schema and migrations in `src/main/database.js`
- Create tables for settings, company metadata, printer profiles, invoices, and invoice items
- Store the uploaded logo as an app-data file and save only its metadata in SQLite

**Verify:** Database tests cover create, update, reload, and delete operations.

### Phase 3 — Sidebar, company metadata, and printer settings

- Build the small sidebar
- Add the Company Metadata modal and persist its values
- Add the Printer Settings modal and persist printer preferences
- Add logo upload and preview

**Verify:** Close and reopen the app; company metadata and printer settings remain available.

### Phase 4 — Invoice form and totals

- Build the controlled invoice form and line-item editing
- Calculate and display subtotal, insurance, and grand total using integer minor units
- Validate required invoice data at save/print boundaries

**Verify:** Focused tests cover item totals, subtotal, insurance, and grand total.

### Phase 5 — Shared receipt formatter and live preview

- Port the useful receipt-line behavior into `src/shared/receipt.js`
- Add width-aware wrapping, columns, separators, footer, and totals
- Build the live receipt preview from the same receipt-line model
- Support 58 mm and 80 mm preview widths

**Verify:** Editing form fields immediately updates the preview; receipt formatting tests pass.

### Phase 6 — Save, load, and delete invoices

- Implement invoice and line-item persistence
- Add Saved Invoices navigation, list, load, and delete actions
- Preserve company metadata and printer settings separately

**Verify:** Save → restart/reload → load produces identical invoice data and totals.

### Phase 7 — LAN ESC/POS printing

- Port the upstream ESC/POS encoder without QR or cash-drawer behavior
- Port the raw TCP sender and timeout handling
- Generate the ESC/POS buffer from the canonical receipt model
- Add print success/failure feedback

**Verify:** Automated byte tests pass; physical LAN print is tested on the BC86AC and SNC-830.

### Phase 8 — Windows installed-printer printing

- Add installed-printer discovery/selection
- Render and print through Electron's Windows system-print path
- Verify paper width, margins, logo, text wrapping, and total alignment

**Verify:** The same invoice prints through the selected installed Windows printer. Any driver limitation is documented before changing the approach.

### Phase 9 — Tests, packaging, and final hardware checks

- Run all automated checks
- Build the NSIS installer and portable executable
- Complete the physical printer checklist
- Update this plan with the final verified versions and known limitations

**Verify:** `npm test`, `npm run build`, and `npm run dist` succeed; both printers pass the agreed physical checks.

## Approval protocol

Before every phase, the assistant must:

1. State the exact scope, files, and commands for that phase.
2. Ask the user to approve that phase.
3. Wait for an explicit approval.
4. Stop and update the plan if the user changes the scope.

No phase may be implemented early, even if a later phase was discussed or approved.

## Physical printer test checklist

- 58 mm and 80 mm alignment and margins
- Long item descriptions and wrapping
- Logo quality and size
- Currency and punctuation
- Full/partial cut behavior on ESC/POS LAN output
- Printer offline, timeout, reconnect, and physical-output limitations
- Same invoice through LAN and installed Windows printer
- Save → reload → print data consistency
