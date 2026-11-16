# Invoice Generator — implementation plan

## Decision

- **Desktop shell:** Electron
- **Frontend:** React 19 + JavaScript (JSX)
- **Build tooling:** Vite + electron-vite
- **Local database:** SQLite via Node's built-in `node:sqlite` API
- **Target:** Windows 10/11
- **Printer language:** ESC/POS
- **First paper size:** 80 mm; receipt layout will use a configurable character width so 58 mm can be enabled later

Electron is the quickest option here because the machine already has Node.js/npm, Rust is not installed, and the UI, database, printer integration, and Windows packaging can all use JavaScript. Electron 45 includes Node.js 24, whose built-in `node:sqlite` module removes the need for a native SQLite package or rebuild step.

## Application scope for version 1

### Main screen

A single desktop window with two columns:

1. **Invoice form**
   - Business/company details
   - Customer/destination details
   - Date and time
   - Product/service line items (description, quantity, unit price)
   - Shipping service, destination address, package weight, expected delivery date
   - Tracking number
   - Optional insurance amount
   - Currency (USD by default)
   - Terms/support/tracking instructions for the footer
2. **Live receipt preview**
   - Proportional to 80 mm paper
   - Shows logo, header, transaction details, item table, shipping/tracking, totals, and footer
   - Updates immediately as the form changes

A compact toolbar will provide:

- Save invoice
- New/clear invoice
- Print
- Settings

### Settings

A small settings modal/panel will persist in SQLite:

- Company name, address, phone, email
- Logo upload (PNG/JPEG)
- Default currency and paper width
- Printer connection: LAN TCP or Windows installed printer queue
- LAN printer IP address and port (default `9100`)
- Installed Windows printer name for USB/queue printing

### Data persisted in SQLite

- Business profile and logo metadata
- Printer preferences
- Saved invoices and their line items
- Invoice number, timestamps, totals, and shipping/tracking details

Version 1 will not include authentication, cloud sync, PDF export, QR/barcode generation, multi-currency conversion, or a cash-drawer workflow.

## Receipt/output rules

The same invoice data will drive both the on-screen preview and ESC/POS output. Totals will be calculated from integer cents to avoid floating-point money errors:

- Item total = quantity × unit price
- Subtotal = sum of item totals
- Insurance is optional
- Grand total = subtotal + insurance (plus shipping amount only if the final receipt template requires it)

The shared receipt template will later be replaced with the supplied reference template without changing the invoice form or database.

## Printing strategy

### 1. LAN printer (implemented first)

Both named printers support USB + LAN. LAN is the simplest and most reliable first path:

- Open a raw TCP connection to the printer IP
- Send ESC/POS bytes directly, commonly on port `9100`
- Apply a connection timeout
- Report a clear error when the printer is offline, unreachable, or out of paper

### 2. USB through the Windows print queue

For USB, the app sends the same ESC/POS byte buffer to the printer installed in Windows. This avoids replacing the printer driver with Zadig/WinUSB, which can break normal printing.

The first implementation will use a tiny Windows PowerShell helper backed by the standard `winspool` API (`OpenPrinter`/`WritePrinter`). It runs only for USB/queue printing; it does not add a native Node module and does not alter the installed printer driver.

## Files to create

```text
invoice-gen/
├─ package.json
├─ electron.vite.config.mjs
├─ index.html
├─ src/
│  ├─ main/
│  │  ├─ index.js
│  │  ├─ database.js
│  │  ├─ settings.js
│  │  └─ printer.js
│  ├─ scripts/
│  │  └─ print-raw.ps1
│  │  
│  ├─ preload/
│  │  └─ index.js
│  ├─ renderer/
│     ├─ src/
│     │  ├─ main.jsx
│     │  ├─ App.jsx
│     │  ├─ styles.css
│     │  ├─ components/
│     │  │  ├─ InvoiceForm.jsx
│     │  │  ├─ ReceiptPreview.jsx
│     │  │  └─ SettingsDialog.jsx
│     │  └─ lib/
│     │     ├─ invoice.js
│     │     └─ receipt.js
│     └─ index.html
└─ resources/
   └─ icon.png
```

## Implementation phases

### Phase 1 — Scaffold and database

- Create the Electron/React JavaScript project
- Install runtime and development packages
- Add secure Electron defaults: context isolation on, Node integration off, preload bridge only
- Create SQLite schema and migrations in `src/main/database.js` using `node:sqlite`
- Implement settings, invoice save/list/load/delete IPC methods
- Verify the installed Electron version can import `node:sqlite` before building the schema

### Phase 2 — UI and invoice model

- Build the two-column responsive layout
- Add controlled form state and line-item add/remove/update
- Calculate totals in integer cents
- Add the live 80 mm receipt preview
- Add company profile and logo upload
- Add a compact settings dialog

### Phase 3 — ESC/POS output

- Build a shared receipt formatter
- Generate text/table/separator/cut commands
- Add a “save receipt as text/commands” debug action for easier hardware testing
- Implement LAN TCP printing with timeout and actionable errors
- Implement Windows queue printing for USB
- Add print success/failure feedback

### Phase 4 — Tests and packaging

- Add focused Node test-runner tests for money totals and receipt line formatting
- Verify save → reload → print data consistency
- Build a Windows NSIS installer with `electron-builder`
- Test on the BC86AC and SNC-830 over LAN and USB

## Technical note: JavaScript-only SQLite

The installed Electron 45 release uses Node.js 24.22.3, which includes `node:sqlite`. The app will therefore use SQLite directly through the standard Node API:

```js
import { DatabaseSync } from 'node:sqlite'
```

This avoids `better-sqlite3`, native compilation, ABI rebuilds, and an extra runtime dependency. The API is currently marked release-candidate by Node, but it is suitable for this local single-user application and can be replaced later behind `src/main/database.js` if needed.

## Physical printer test checklist

- 80 mm alignment and margins
- Long item descriptions and wrapping
- Logo quality/size
- Latin punctuation and currency formatting
- Full/partial cut behavior
- Printer offline, timeout, paper-out, and reconnect errors
- Same receipt over LAN and USB
- 58 mm adaptation once enabled

## Manual commands

Do not run these until the plan is approved.

### 1. Create the project files manually

Create the folders and files listed above in `invoice-gen`, or ask me to generate the plain JavaScript files one by one. The commands below assume `package.json` and the source files already exist.

### 2. Install dependencies

```powershell
cd C:\Users\mprof\OneDrive\Desktop\invoice-gen
npm install
```

SQLite uses Electron's built-in `node:sqlite` module, so there is no native module rebuild step.

### 3. Start development mode

```powershell
npm run dev
```

### 4. Run checks

```powershell
npm test
npm run build
```

### 5. Build the Windows installer

```powershell
npm run dist
```

The installer will be written under:

```text
release/
```

## Approval status

**Approved on 2026-11-17.** JavaScript project files and manual commands will be supplied in phases.
