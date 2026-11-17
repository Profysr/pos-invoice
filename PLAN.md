# Invoice Generator — implementation plan

## Current status

- **Plan revised:** 2026-11-17
- **Implementation status:** Phases 0–8 complete (New Invoice, settings, Saved Invoices with View/Edit/Delete/Print, both printer paths); Phase 9 automated checks and packaging complete — only the physical printer checklist remains
- **Approval rule:** Each phase requires explicit user approval before any implementation work begins. A general approval does not automatically approve later phases.
- **Implementation discipline:** Ponytail full mode applies to every phase.

### Completed implementation record

- Electron 45.3.3 with Node.js 24.22.3, React 19.3.1, Vite 8.3.8, electron-vite 6.0.0, and Mantine 9.8.1 are installed through npm.
- `npm ci` completes successfully and `npm ls --depth=0` reports no missing or invalid packages; `npm audit --omit=dev` reports zero runtime vulnerabilities.
- The development-only `electron-builder` dependency chain currently reports six moderate `minimatch` advisories with no non-breaking upstream fix; review during packaging rather than applying npm's forced downgrade.
- The renderer runs with context isolation and sandboxing enabled, Node integration disabled, navigation blocked, and a narrow preload API.
- SQLite schema version 1 includes settings, company metadata, printer profiles, invoices, invoice items, and print history under Electron's `userData` path.
- Focused database tests, lint, production build, and an Electron launch smoke test pass.
- New Invoice workflow is functional: bootstrap loads company/printer/next invoice number from SQLite, form validates, and clicking the single primary Print action persists the invoice (save-on-print only; no Save button, no autosave).
- Invoice numbers come from a persisted yearly SQLite counter (`invoiceNumberSequence:<year>`); deleted numbers are never reused.
- Money is integer minor units, quantities are scaled thousandths, and shared calculation/receipt modules (`src/shared/invoice.js`, `src/shared/receipt.js`) drive both the live preview and printing.
- Receipt Studio (commit `8e758eb0d129523a334bfb23953090ed216f7521`) code is ported: ESC/POS encoder and text sanitization (`src/main/printing.js`), raw TCP LAN sender with timeout/error handling, receipt wrapping/columns, money formatting, and the hidden-window Windows system-print path (`src/main/system-print.js`).
- Settings modal persists company metadata (with logo choose/remove/preview) and printer profile (network ESC/POS TCP or Windows installed printer, paper/character widths, encoding, cut/feed, timeout) to SQLite.
- Print flow records status (`printing` → `succeeded`/`failed`) and a print-history row; a TCP write success is reported as bytes delivered, not guaranteed physical output.
- Verification on 2026-11-17: `npm test` 17/17 pass, `npm run lint` 0 errors (remaining warnings are pre-existing CRLF/prettier notices), `npm run build` succeeds, and the Electron smoke test reports `SMOKE_TEST_OK`.
- Saved Invoices screen is functional: lists persisted invoices with search/pagination, status badges, and View (receipt-preview modal), Edit (loads the invoice back into the New Invoice form via `storedInvoiceToDraft`), Delete (confirmation modal), and Print (reprint through the configured printer) actions; `mockData.js` was removed.
- Packaging: `npm run dist` produces `release/Invoice Generator Setup 1.0.0.exe` (NSIS) and `release/Invoice Generator 1.0.0.exe` (portable); the electron-builder config lives in the `build` field of `package.json`.
- The packaged app (win-unpacked) passes the smoke test with exit code 0 and prints `SMOKE_TEST_OK`, confirming `node:sqlite` works inside the packaged application.
- Preload fix (2026-11-17): `type: "module"` made electron-vite emit an ESM preload (`.mjs`) that Electron's sandboxed preload loader cannot parse (`SyntaxError: Cannot use import statement outside a module`), leaving `window.invoiceApi` undefined. The preload is now built as CommonJS (`build.lib.formats: ['cjs']` → `out/preload/index.cjs`) and main loads that exact path; the smoke test asserts `typeof window.invoiceApi === 'object'` before reporting success.
- Remaining: physical printer checklist for BC86AC/SNC-830 and Windows installed-printer output verification.

## Direction

Build a small, purpose-built invoice application from scratch. Do not use the upstream Receipt Studio UI or ship it as a fork.

Use [Receipt Studio](https://github.com/Ytosko/Receipt-Studio) only as a reviewed source for the printing and receipt-rendering implementation that is difficult to recreate safely.

### Stack

- Electron 45
- React 19 with JavaScript/JSX only
- Vite with the official `electron-vite` React scaffold
- Mantine for application UI components and Tabler Icons
- Mantine Form with its built-in validators
- SQLite through Electron's built-in `node:sqlite`
- Minimal custom CSS, mainly for the dedicated thermal receipt preview
- npm as the only package manager
- Windows 10/11 x64
- ESC/POS receipt output

### Confirmed decisions

- Keep the original plan's SQLite persistence.
- Use JavaScript/JSX, not TypeScript.
- Use npm and `package-lock.json`; do not use pnpm or create a pnpm lockfile.
- Use the official Electron installation scaffold rather than creating the Electron architecture from an empty folder.
- Use Mantine instead of implementing standard buttons, inputs, modals, tables, notifications, and layouts from scratch; use native date and time inputs.
- Start with React state. Do not install Zustand unless React state becomes a demonstrated problem.
- Use Mantine's Table for saved invoices initially. Do not install TanStack Table unless a real requirement appears.
- Do not include PDF export, QR generation, barcode generation, cash-drawer support, authentication, cloud sync, or currency conversion.
- Company metadata is global and shared by every invoice.
- The application UI is custom and much simpler than Receipt Studio.
- Do not add `node-thermal-printer`; use the smaller encoder pattern already implemented by Receipt Studio.
- Use `iconv-lite` for receipt character encoding.
- Keep the upstream MIT license and attribution for all ported source.

## Ponytail guidelines for every phase

The agent must reread this section before planning or implementing each phase.

### Build the smallest complete change

1. Skip features, options, and flexibility nobody asked for.
2. Reuse code, components, dependencies, and platform features that already exist.
3. Prefer deletion over addition and the smallest readable implementation over speculative abstractions.
4. Do not add a wrapper, conversion layer, configuration option, or “for later” code with only one caller.
5. Keep invoice calculations, receipt formatting, database access, and printing independent of the React UI.

### Complete every affected part

- Read the task and the code it touches before editing.
- Identify affected callers, tests, fixtures, configuration, exports, persistence, and packaging.
- Fix a shared bug once in the shared implementation rather than patching individual callers.
- Preserve existing validation and error handling when moving or merging code.
- Finish every caller, test, fixture, and build step affected by the change.

### Keep correctness and safety

- Never cut validation at trust boundaries, error handling that prevents data loss, security, accessibility, required physical-hardware calibration, or requested behavior.
- Use a secure Electron configuration: context isolation on, renderer sandbox on, Node integration off, and a narrow validated preload API.
- Keep SQLite and filesystem access inside the Electron main process.
- Do not mark an invoice physically printed merely because a TCP write succeeded.

### Test and review

- Every non-trivial branch, loop, parser, money calculation, security boundary, or data write gets one small focused test or assert-based check.
- Review a phase in this order: correct, safe, works at expected load, tested, fast, then lean.
- Check concrete failure cases, including empty values, zero, last-item behavior, rounding, and uniqueness.
- Propose the smallest fix; prefer deleting code over adding a layer.
- A known shortcut must use this exact comment form: `shortcut: <the limit>, <when to upgrade>`.

### Communication

- Ask the smallest immediate clarifying question when blocked by ambiguity. Do not guess or wait.
- If a command requires administrator approval, authentication, a vendor driver, or physical hardware access, ask the user only for that specific help.
- End phase reports with what was skipped or not checked and any remaining risk.

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

Use Mantine `AppShell` and `NavLink` for a small persistent sidebar with:

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

One page with a compact Mantine toolbar and two columns:

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

Toolbar actions (approved narrowed scope):

- Single primary **Print** action, top-right — saves the invoice to SQLite and prints in one step (no separate Save button, no autosave)
- Printer settings live in the Settings modal (sidebar), not as a toolbar action

The thermal receipt preview must be a dedicated component with receipt-specific dimensions and typography. Do not build it from ordinary Mantine cards or tables.

### Printer settings

- LAN TCP or installed Windows printer
- LAN host/IP and port (default `9100`)
- Installed Windows printer name
- Paper width: 58 mm or 80 mm
- Printable width and character width
- Receipt encoding
- Feed lines and cut after print

### Saved invoices

Use a Mantine table with:

- Invoice number
- Customer
- Date
- Total
- Print status
- Actions: View, Edit, Delete, Print

Persist:

- Invoice header, line items, totals, shipping/tracking details, and print status
- Global company metadata, logo metadata, and printer preferences
- Print timestamp, printer used, connection method, success/failure, and error message

### Invoice numbering

- Generate a unique invoice number when creating a new invoice.
- Never reuse a previously saved invoice number.
- Enforce uniqueness in SQLite.
- Manual editing is allowed only if explicitly requested before that phase; otherwise keep the generated number.

### Money and quantity rules

All money is stored and calculated as integer minor units:

- Item total = quantity × unit price
- Subtotal = sum of item totals
- Grand total = subtotal + optional insurance
- Shipping service information is informational in version 1 and does not change the total unless a shipping-charge field is explicitly approved later

Quantities may be decimal. Store them as scaled integers and define explicit rounding before calculating line totals. Do not rely on floating-point totals.

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

The installed-printer path is not raw ESC/POS. Logo, cut, and exact thermal formatting depend on the installed printer driver. LAN and Windows paths are not assumed to produce identical output. If the BC86AC or SNC-830 requires raw ESC/POS through USB/Windows, stop after physical verification and ask before adding a second printing path.

## Planned project structure

The official scaffold is created in `invoice-gen/app` because the workspace root already contains `PLAN.md` and `resp.md`.

```text
invoice-gen/
├─ app/
│  ├─ package.json
│  ├─ electron.vite.config.mjs
│  ├─ LICENSE
│  ├─ THIRD_PARTY_NOTICES.md
│  ├─ src/
│  │  ├─ main/
│  │  │  ├─ index.js
│  │  │  ├─ database.js
│  │  │  ├─ settings.js
│  │  │  └─ printer.js
│  │  ├─ preload/
│  │  │  └─ index.js
│  │  ├─ renderer/
│  │  │  ├─ index.html
│  │  │  └─ src/
│  │  │     ├─ main.jsx
│  │  │     ├─ App.jsx
│  │  │     ├─ styles.css
│  │  │     ├─ components/
│  │  │     │  ├─ Sidebar.jsx
│  │  │     │  ├─ CompanyMetadataDialog.jsx
│  │  │     │  ├─ PrinterSettingsDialog.jsx
│  │  │     │  ├─ InvoiceForm.jsx
│  │  │     │  └─ ReceiptPreview.jsx
│  │  └─ shared/
│  │     ├─ invoice.js
│  │     └─ receipt.js
│  ├─ resources/
│  │  └─ icon.png
│  └─ tests/
│     ├─ invoice.test.js
│     └─ receipt.test.js
├─ PLAN.md
└─ resp.md
```

`src/shared/receipt.js` is the single canonical receipt formatter. The renderer preview and main-process printer consume the same receipt-line model.

## Command-only environment and setup rules

- npm is the only package manager. Use `npm install` or `npm ci`; do not use pnpm or yarn.
- Install and run Electron, Vite, tests, and packaging through project scripts; do not manually install application files.
- Run setup and verification commands from the application project root (`invoice-gen/app`).
- If a command requires administrator approval, GitHub authentication, a vendor printer driver, physical printer access, or another action only the user can perform, stop and ask the user for that specific help.
- Do not tell the user to perform broad manual setup when a command can do it.
- If any requirement is unclear, ask the smallest possible clarifying question immediately and stop that phase. Do not guess.

### Preferred Electron installation and dependency commands

These run only after Phase 1 is approved:

```powershell
Set-Location 'C:\Users\mprof\OneDrive\Desktop\invoice-gen'
npm create @quick-start/electron@latest app -- --template react
Set-Location '.\app'

# If the scaffold asks: React, JavaScript, no updater, no download mirror.
npm install
npm install @mantine/core @mantine/hooks @mantine/form @mantine/notifications @tabler/icons-react iconv-lite
npm install -D electron@45 electron-builder
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

Each phase starts only after the user explicitly approves that phase. Before each phase, the agent must reread the Ponytail guidelines and state the exact scope, affected files, and commands.

### Phase 0 — Validate the source and plan — Complete

- Preserve the inspected upstream commit and license information
- Confirm which receipt-rendering and printing portions will be ported
- Resolve any remaining invoice-numbering, quantity-rounding, or final-template ambiguity with one focused question
- Provide a short dependency and compatibility report covering Electron 45, its bundled Node version, `node:sqlite`, Vite/electron-vite, React 19, Mantine, and npm

**Done when:** The user approves the revised plan and numbered phases.

### Phase 1 — Install the official Electron scaffold — Complete

- Run the preferred npm scaffold command
- Keep the React JavaScript template; remove TypeScript configuration and examples
- Install Mantine, Tabler Icons, and `iconv-lite`
- Install Electron 45 and `electron-builder`
- Remove starter demos, updater functionality, and unused styling/plugins
- Add `dev`, `test`, `build`, and `dist` scripts
- Launch a minimal secure window with the Mantine provider

**Verify:** `npm run dev` opens the application; `npm run build` succeeds.

### Phase 2 — Secure shell and SQLite foundation — Complete

- Enable context isolation and renderer sandboxing, disable renderer Node integration, and expose only required preload APIs
- Create SQLite schema and versioned migrations in `src/main/database.js`
- Create tables for settings, company metadata, printer profiles, invoices, invoice items, and print history
- Enforce invoice-number uniqueness in SQLite
- Store the database and uploaded logo under Electron's `userData` path, never inside the installation directory
- Store the logo as an app-data file and save only its metadata in SQLite

**Verify:** Database tests cover create, update, reload, delete, uniqueness, migration, and app-data paths.

### Phase 3 — Mantine shell, company metadata, and printer settings

- Build the small Mantine `AppShell` sidebar and toolbar
- Add the Company Metadata modal and persist its values
- Add the Printer Settings modal and persist printer preferences
- Add logo upload and preview
- Use Mantine notifications for save/print feedback and a confirmation modal for deletion

**Verify:** Close and reopen the app; company metadata and printer settings remain available.

### Phase 4 — Invoice form and totals

- Build the invoice form with Mantine Form and its built-in validators
- Build line-item editing with Mantine inputs and table controls
- Calculate and display subtotal, insurance, and grand total using integer minor units
- Use scaled integer quantities with explicit rounding
- Validate required invoice data at save and print boundaries

**Verify:** Focused tests cover item totals, subtotal, insurance, grand total, decimal quantity rounding, and validation failures.

### Phase 5 — Shared receipt formatter and live preview

- Port the useful receipt-line behavior into `src/shared/receipt.js`
- Add width-aware wrapping, columns, separators, footer, and totals
- Build the dedicated live receipt preview from the same receipt-line model
- Support 58 mm and 80 mm preview widths

**Verify:** Editing form fields immediately updates the preview; receipt formatting tests pass.

### Phase 6 — Save, load, edit, and delete invoices

- Implement invoice and line-item persistence
- Add Saved Invoices navigation and Mantine table actions: View, Edit, Delete, and Print
- Preserve company metadata and printer settings separately
- Persist print history without treating socket delivery as confirmed physical output

**Verify:** Save → restart/reload → load produces identical invoice data and totals; deleted invoices cannot be reloaded.

### Phase 7 — LAN ESC/POS printing

- Port the upstream ESC/POS encoder without QR or cash-drawer behavior
- Port the raw TCP sender and timeout handling
- Generate the ESC/POS buffer from the canonical receipt model
- Add print success/failure feedback and print-history updates

**Verify:** Automated byte tests pass; physical LAN print is tested on the BC86AC and SNC-830.

### Phase 8 — Windows installed-printer printing

- Add installed-printer discovery/selection
- Render and print through Electron's Windows system-print path
- Verify paper width, margins, logo, text wrapping, and total alignment
- Treat LAN and Windows output as separate hardware paths

**Verify:** The same invoice prints through the selected installed Windows printer. Any driver limitation is documented before changing the approach.

### Phase 9 — Tests, packaging, and final hardware checks

- Run all automated checks
- Verify `node:sqlite` inside the packaged application, not only in development
- Build the NSIS installer and portable executable
- Complete the physical printer checklist
- Update this plan with the final verified versions and known limitations

**Verify:** `npm test`, `npm run build`, and `npm run dist` succeed; both printers pass the agreed physical checks.

## Approval protocol

Before every phase, the assistant must:

1. Reread the Ponytail guidelines in this plan.
2. State the exact scope, files, and commands for that phase.
3. Ask the user to approve that phase.
4. Wait for an explicit approval.
5. Stop and update the plan if the user changes the scope.

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
