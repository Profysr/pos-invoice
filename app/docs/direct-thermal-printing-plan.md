# Direct Thermal Printing Refactor Plan

**Status:** Proposed  
**Last updated:** 2026-11-25  
**Scope:** Replace Windows spooler printing with direct ESC/POS printing over LAN or USB, and make preview and print use one canonical receipt document.

## 1. Outcome

When the user clicks **Save & Print**, the application will:

1. Validate the receipt.
2. Save it to SQLite.
3. Build one canonical set of `retail-print-kit` receipt operations.
4. Render those operations for the on-screen preview.
5. Encode the same operations as ESC/POS bytes.
6. Send the bytes directly to the configured thermal printer:
   - LAN through `NetTransport`.
   - USB through `UsbTransport`.
7. Record success or failure in the database.

There will be:

- No Windows print dialog.
- No Windows printer selection.
- No paper-dimension dialog.
- No call to `webContents.print()`.
- No dependency on the Windows printer spooler.

## 2. Decisions already made

- The Windows system-printer path is being removed.
- The application prints directly to ESC/POS thermal printers.
- LAN and USB are supported through the same receipt pipeline.
- The on-screen preview and thermal print output originate from the same operations.
- The preview and print paths use the same prepared logo bitmap.
- The existing **Print** action becomes **Save & Print**.
- A separate non-printing Save action is out of scope unless explicitly requested.
- `retail-print-kit` remains pinned at `0.4.0` during this refactor.
- Automated tests use a fake transport and a local TCP server; there is no permanent emulator mode in the production UI.
- Real hardware acceptance testing is still required before releasing either LAN or USB support.

## 3. Target architecture

```text
React form
    │
    ▼
Canonical receipt document
    ├── opsToHtml() ──► isolated on-screen preview
    └── encodeEscPos()
            ├── NetTransport ──► LAN thermal printer
            └── UsbTransport ──► USB thermal printer
```

The canonical receipt document contains:

- The shared template.
- The receipt view model.
- The printer profile.
- The final printable operations.

All content, ordering, alignment, bolding, logo dimensions, and logo position must come from this document.

### Exactness contract

Preview and print must agree on:

- Visible text and ordering.
- Line and blank-line spacing.
- Alignment.
- Bold and underline styling.
- Table column widths.
- Logo dimensions and horizontal position.
- Text sanitization.

Physical output cannot be guaranteed pixel-identical to a browser because browser fonts and printer fonts differ. The acceptance requirement is that both outputs are generated from the same operations and logo bitmap.

## 4. Frozen shared contracts

These contracts are fixed before parallel implementation starts. Agents may consume them but must not change them without coordinating with the integration owner.

### 4.1 Shared receipt document

**Proposed file:** `app/src/shared/receipt-document.js`

**Proposed exports:**

```text
buildReceiptDocument({ receipt, company, printer, logoBitmap })
    → { data, profile, ops }

buildReceiptPreviewHtml({ ops, profile })
    → complete preview HTML string
```

Responsibilities:

- Build the view model using the existing shared receipt code.
- Render the template through `retail-print-kit`.
- Apply text sanitization.
- Remove the internal product-name marker.
- Apply product-name bolding.
- Add the logo raster and its alignment.
- Render preview HTML through `retail-print-kit.opsToHtml()`.

The module must not encode ESC/POS or open a transport.

### 4.2 Shared receipt layout

**Proposed file:** `app/src/shared/receipt-layout.js`

**Proposed exports:**

```text
RECEIPT_LOGO
logoWidthDots(printer)
```

Initial defaults:

```text
width ratio: 70% of printable width
horizontal position: center
vertical position: top
```

These are calibration defaults and must be adjustable in this one location.

### 4.3 Prepared logo bitmap

**Proposed file:** `app/src/main/logo-bitmap.js`

**Proposed export:**

```text
prepareLogoBitmap(logoPath, printer)
    → SerializedBitmap | null
```

Preferred implementation:

- `retail-print-kit.loadImage()` for decoding, scaling, thresholding, and optional dithering.
- `retail-print-kit.serializeBitmap()` for a serializable bitmap.

The serialized bitmap shape is:

```text
{ width, height, data }
```

The prepared bitmap is derived from the stored logo path and printer dimensions. It is not a new database field.

### 4.4 Printer transport

**Proposed file:** `app/src/main/printer-transport.js`

**Proposed exports:**

```text
createPrinterTransport(printerProfile)
    → retail-print-kit Transport

listUsbPrinters()
    → [{ vendorId, productId }]

sendBytes(transport, bytes)
    → { ok, bytes, message }
```

Mapping:

```text
connectionType === 'network' → NetTransport
connectionType === 'usb'     → UsbTransport
```

Sending lifecycle:

```text
open → write → close
```

`close()` must run on success and failure.

### 4.5 Database values

New application values:

```text
printer_profiles.connection_type: network | usb
print_history.connection_method: network | usb
```

Legacy `system` values remain accepted by the database during the first migration so existing records are not destroyed. The application will no longer expose or use the legacy option.

New printer-profile fields:

```text
usb_vendor_id
usb_product_id
```

JavaScript mapping:

```text
usbVendorId
usbProductId
```

### 4.6 IPC contract

Final preload methods:

```text
getPrinter()
savePrinter(values)
listUsbPrinters()
testPrinter(values)
printInvoice(payload)
```

Removed preload method:

```text
listSystemPrinters()
```

The IPC handler for `invoice:print` continues to save the receipt before printing. It returns the saved invoice and the print result.

## 5. Parallel execution map

Agents should work in separate branches or worktrees. Each file has one phase owner.

### Wave 0 — Can start immediately

| Phase | Area | Code dependencies |
|---|---|---|
| Phase 0 | Procurement and hardware acceptance preparation | None |
| Phase 1 | Native dependencies and build baseline | None |
| Phase 2 | Canonical receipt document and logo preparation | Phase 1 |
| Phase 3 | Fake transport and virtual-printer test harness | Frozen contracts only |

### Wave 1 — Start after Phase 2 contract is merged

| Phase | Area | Code dependencies |
|---|---|---|
| Phase 4 | Preview renderer migration | Phase 2 |
| Phase 5 | Direct LAN/USB transports and printer settings | Phases 1 and 2 |
| Phase 6 | Database migration and printer-profile mapping | Phase 2 contract only |

### Wave 2 — Integration

| Phase | Area | Code dependencies |
|---|---|---|
| Phase 7 | Main-process/preload integration and Windows-path removal | Phases 4, 5, and 6 |
| Phase 8 | Documentation, stale-tool cleanup, and packaging verification | Phase 7 for final verification |

### Wave 3 — Release validation

| Phase | Area | Code dependencies |
|---|---|---|
| Phase 9 | Full automated and real-hardware acceptance | All previous phases |

## 6. Phase details

### Phase 0 — Procurement and hardware acceptance preparation

**Goal:** Select hardware that can support the application without depending on Windows printing.
**Owner scope:** Documentation and hardware research only. No production-code changes.
**Tasks:**

- [ ] Use the procurement checklist in Section 10.
- [ ] Prefer an Ethernet ESC/POS model for the first purchase.
- [ ] Confirm raw TCP printing on port 9100 from the vendor documentation.
- [ ] Confirm Windows 11 x64 support.
- [ ] Confirm 80 mm and, if required, 58 mm paper support.
- [ ] Confirm automatic cutter support.
- [ ] Request the ESC/POS command manual and USB vendor/product IDs.
- [ ] Record the expected `retail-print-kit` printer profile.
- [ ] Prepare LAN and USB acceptance-test procedures.

**Acceptance criteria:**

- A specific printer SKU has been selected or a shortlist is documented.
- The selection explicitly supports ESC/POS and raw LAN printing.
- USB is treated as a separately verified capability.

### Phase 1 — Native dependencies and build baseline

**Goal:** Make the library-provided USB and image features usable in the packaged Electron application.

**Exclusive files:**

- `app/package.json`
- `app/package-lock.json`
- `app/electron-builder.yml`

**Tasks:**

- [ ] Install the `usb` package required by `UsbTransport`.
- [ ] Install `@napi-rs/canvas` for `retail-print-kit.loadImage()`.
- [ ] Keep `retail-print-kit` pinned at `0.4.0`.
- [ ] Verify Electron main-process loading of both native dependencies.
- [ ] Verify the existing `npm run build` command.
- [ ] Verify that native dependencies are included correctly by `electron-builder`.
- [ ] Review the current `npmRebuild: false` setting and update it only if required by the actual build.
- [ ] Record native-packaging behavior in the pull request.

**Acceptance criteria:**

- `npm run build` succeeds.
- A packaged test application can load the USB transport and logo loader.
- No unrelated dependency upgrades are introduced.

### Phase 2 — Canonical receipt document and logo preparation

**Goal:** Establish the single receipt artifact used by preview and printing.

**Exclusive files:**

- `app/src/shared/receipt-document.js` — new
- `app/src/shared/receipt-layout.js` — new
- `app/src/shared/receipt-template-core.js`
- `app/src/main/logo-bitmap.js` — new
- `app/src/main/logo-raster.js` — removal after replacement
- `app/tests/receipt-template.test.js`
- New focused logo/document tests

**Tasks:**

- [ ] Implement `RECEIPT_LOGO` and `logoWidthDots()` in one shared location.
- [ ] Implement `prepareLogoBitmap()` using `loadImage()` and `serializeBitmap()`.
- [ ] Implement `buildReceiptDocument()`.
- [ ] Move text sanitization into the canonical document builder.
- [ ] Replace the product-name marker with bold operations before HTML or ESC/POS rendering.
- [ ] Insert the logo raster with an explicit alignment operation.
- [ ] Ensure logo placement and dimensions are not duplicated in preview CSS or printing code.
- [ ] Add tests proving the browser and main-process operations remain identical.
- [ ] Add tests proving the prepared logo dimensions and alignment are deterministic.

**Acceptance criteria:**

- One function produces the final receipt operations.
- The same serialized logo bitmap can be used by preview and print.
- Changing the shared logo width ratio or alignment affects both outputs.
- No HTML-specific product bolding remains.

### Phase 3 — Fake transport and virtual-printer test harness

**Goal:** Enable all later phases to test printing without physical hardware.

**Exclusive files:**

- `app/tests/helpers/fake-transport.js` — new
- `app/tests/helpers/virtual-lan-printer.js` — new, if needed separately
- Focused transport-harness tests

**Tasks:**

- [ ] Implement a fake `Transport` with `open`, `write`, `read`, and `close`.
- [ ] Record written bytes for assertions.
- [ ] Support configurable open, write, and close failures.
- [ ] Implement or reuse a local TCP server that captures ESC/POS bytes.
- [ ] Verify that the fake and LAN transports expose the same lifecycle behavior.
- [ ] Avoid production-only test modes or hidden UI switches.

**Acceptance criteria:**

- Printing code can be tested without Electron or hardware.
- A test can assert the exact byte payload written.
- Failure paths can be triggered deterministically.

### Phase 4 — Preview renderer migration

**Goal:** Replace the custom React receipt-line renderer with the canonical library renderer.

**Exclusive files:**

- `app/src/renderer/src/invoice/ReceiptPreview.jsx`
- `app/src/renderer/src/invoice/ReceiptPreview.css`
- `app/src/renderer/src/invoice/receipt-preview-lines.js` — removal
- `app/src/shared/receipt-ops-lines.js` — removal
- `app/src/renderer/src/pages/NewInvoicePage.jsx`
- `app/src/renderer/src/pages/SavedInvoicesPage.jsx`
- `app/tests/receipt-preview.test.js`
- `app/tests/receipt.test.js` — update or remove obsolete cases

**Tasks:**

- [ ] Generate preview HTML from the canonical operations.
- [ ] Render the HTML in an isolated iframe or another isolated React-compatible container.
- [ ] Remove independent preview logo sizing.
- [ ] Remove custom operation-to-line conversion.
- [ ] Preserve error reporting when receipt rendering fails.
- [ ] Preserve the saved-receipt preview modal and live preview behavior.
- [ ] Verify that the preview uses the prepared bitmap from the company/bootstrap response.
- [ ] Add parity assertions between preview HTML and the canonical operations.

**Acceptance criteria:**

- The preview no longer contains a second receipt-layout implementation.
- Preview content, alignment, bolding, and logo dimensions come from canonical operations.
- Live preview and saved-receipt preview both use the new renderer.

### Phase 5 — Direct LAN/USB transports and printer settings

**Goal:** Replace Windows-printer selection with direct thermal transport selection.

**Exclusive files:**

- `app/src/main/printer-transport.js` — new
- `app/src/main/receipt-printing.js`
- `app/src/renderer/src/settings/PrinterSettingsSection.jsx`
- `app/src/renderer/src/settings/SettingsModal.jsx`
- `app/tests/receipt-printing.test.js`

**Tasks:**

- [ ] Implement `createPrinterTransport()` for LAN and USB.
- [ ] Implement `listUsbPrinters()` through `UsbTransport.list()`.
- [ ] Implement the shared open/write/close sending lifecycle.
- [ ] Remove `buildReceiptPrintHtml()` and Windows HTML-specific bold handling.
- [ ] Change the settings connection type to LAN or USB.
- [ ] Show LAN host and port fields for LAN.
- [ ] Show USB device selection for USB.
- [ ] Make Test Print use the same direct pipeline as Save & Print.
- [ ] Preserve clear timeout, refusal, missing-device, and disconnection errors.
- [ ] Do not hardcode USB vendor or product IDs.

**Acceptance criteria:**

- No production code calls `webContents.print()`.
- LAN and USB use identical receipt bytes.
- The Test button exercises the selected direct transport.
- The settings UI exposes no Windows-installed-printer option.

### Phase 6 — Database migration and printer-profile mapping

**Goal:** Persist LAN/USB configuration without destroying existing data.

**Exclusive files:**

- `app/src/main/database.js`
- `app/tests/database.test.js`

**Tasks:**

- [ ] Add the next numbered migration; do not rewrite an existing migration.
- [ ] Allow `usb` in `printer_profiles.connection_type`.
- [ ] Allow `usb` in `print_history.connection_method`.
- [ ] Add `usb_vendor_id` and `usb_product_id`.
- [ ] Preserve legacy `system` rows during the first migration.
- [ ] Update `mapPrinter()` and `savePrinter()`.
- [ ] Validate that network profiles require host/port and USB profiles require device IDs.
- [ ] Ensure saving and reprinting existing receipts remains safe.
- [ ] Add migration and validation tests.

**Acceptance criteria:**

- Existing databases open and migrate without data loss.
- LAN and USB profiles round-trip correctly.
- The application does not expose or execute the legacy system option.

### Phase 7 — Main-process/preload integration and Windows-path removal

**Goal:** Wire the new pipeline into the application and remove the obsolete Windows implementation.

**Exclusive files:**

- `app/src/main/index.js`
- `app/src/preload/index.js`
- `app/src/main/system-print.js` — removal
- `app/tools/render-preview-check.mjs` — removal or rewrite
- `app/preview-check.html` — removal
- Integration-focused tests

**Tasks:**

- [ ] Remove `printSystem` and `buildReceiptPrintHtml` imports.
- [ ] Remove `printer:list-system`.
- [ ] Add `printer:list-usb`.
- [ ] Update `printer:test` to use the direct transport.
- [ ] Update `invoice:print` to save first and then use LAN or USB transport.
- [ ] Return useful printer name and transport details in print results.
- [ ] Remove the `listSystemPrinters()` preload method.
- [ ] Add `listUsbPrinters()` to the preload bridge.
- [ ] Ensure logo bitmap preparation is included in bootstrap/company responses.
- [ ] Remove obsolete generated/manual preview tooling that references deleted modules.
- [ ] Search the source for remaining `system-print`, `webContents.print`, and `listSystemPrinters` references.

**Acceptance criteria:**

- Save & Print sends directly to the configured thermal printer.
- No Windows print UI or spooler path remains.
- The preload bridge exposes only the supported direct-printer operations.

### Phase 8 — Documentation, stale-tool cleanup, and packaging verification

**Goal:** Make the supported workflow and build behavior clear.

**Exclusive files:**

- `app/README.md`
- `app/electron-builder.yml` only if Phase 1 identified a remaining packaging issue
- Preview/manual tooling not already removed in Phase 7

**Tasks:**

- [ ] Replace the Windows-printer explanation with direct LAN/USB instructions.
- [ ] Document host, port, and USB device selection.
- [ ] Document that Save & Print does not open a Windows dialog.
- [ ] Document the virtual testing strategy.
- [ ] Document the hardware acceptance procedure.
- [ ] Remove stale references to removed printing modules.
- [ ] Verify the packaged application includes native dependencies.
- [ ] Verify the database is still stored under Electron `userData`.

**Acceptance criteria:**

- README instructions match the implemented behavior.
- The packaged application can load the direct-print dependencies.
- No documentation recommends Windows spooler printing.

### Phase 9 — Full automated and real-hardware acceptance

**Goal:** Verify correctness before release.

**Tasks:**

- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `npm run dist`.
- [ ] Install and launch the packaged Windows application.
- [ ] Verify LAN printer discovery/configuration is not required; enter the configured IP directly.
- [ ] Print a test receipt over LAN.
- [ ] Verify paper width, character grid, logo size, logo alignment, text alignment, cut, and feed.
- [ ] Verify USB device discovery and selection.
- [ ] Print a test receipt over USB.
- [ ] Repeat the physical checks over USB.
- [ ] Verify a Windows print dialog never appears.
- [ ] Verify failed printing leaves the receipt saved with a failed print status.
- [ ] Verify successful printing records print history.

**Acceptance criteria:**

- All automated checks pass.
- LAN hardware printing passes.
- USB hardware printing passes before USB support is advertised.
- Preview and physical output agree on the agreed content and layout contract.

## 7. Agent coordination rules

1. Each phase must be implemented in a separate branch or worktree.
2. Only the phase owner may edit files listed in that phase's exclusive scope.
3. Agents must not opportunistically edit unrelated files.
4. Agents must not change the frozen shared contracts. If a contract change is necessary, stop and coordinate with the integration owner.
5. Agents must add or update tests in their owned test files.
6. Every phase pull request must state:
   - Files changed.
   - Contract assumptions.
   - Tests run.
   - Known limitations.
   - Whether hardware was required.
7. Do not let multiple agents modify `package.json`, `package-lock.json`, or `electron-builder.yml` concurrently. Phase 1 owns dependency/build changes; later phases request changes rather than editing those files directly.
8. Do not let multiple agents modify `app/src/main/index.js` or `app/src/preload/index.js`. Phase 7 owns integration changes.

## 8. Merge order

Recommended merge sequence:

1. Phase 1 — dependencies/build baseline.
2. Phase 2 — canonical receipt/logo contract.
3. Phase 3 — test harness.
4. Phase 4 — preview renderer.
5. Phase 5 — direct transports/settings.
6. Phase 6 — database migration.
7. Phase 7 — integration and legacy removal.
8. Phase 8 — documentation and final packaging verification.
9. Phase 9 — release validation.

Phases 4, 5, and 6 may be developed and reviewed in parallel, but they should be merged in the listed order after Phase 2.

## 9. Test strategy

### Fast tests

- Pure receipt-document and view-model tests.
- Logo sizing and alignment tests.
- Fake-transport lifecycle tests.
- Database mapping and migration tests.

### Integration tests

- Local TCP server receives exactly one complete ESC/POS payload.
- LAN and USB paths produce identical bytes.
- Timeout, refusal, missing USB device, and disconnect errors are surfaced.
- Save & Print persists the receipt before transport execution.
- Failed print updates invoice status and print history.
- Preview HTML and ESC/POS output contain the same receipt content.

### Hardware tests

- LAN physical output.
- USB physical output.
- Paper width and character grid.
- Logo dimensions and position.
- Text alignment and bolding.
- Cut and feed behavior.

## 10. Hardware procurement checklist

Require:

- [ ] ESC/POS command support.
- [ ] Raw LAN printing on TCP port 9100.
- [ ] USB printer-class support if direct USB is mandatory.
- [ ] Windows 11 x64 support.
- [ ] 80 mm paper support.
- [ ] 58 mm support if the product requires it.
- [ ] 203 DPI / approximately 8 dots per millimetre.
- [ ] Automatic cutter.
- [ ] Self-test page that displays its network address.
- [ ] ESC/POS command manual.
- [ ] USB vendor and product IDs.
- [ ] Confirmation that USB can be used without a vendor print queue.

Known USB vendor IDs recognized by the installed `retail-print-kit` version:

```text
Epson:          0x04b8
Star Micronics: 0x0519
Bixolon:        0x1504
Citizen:        0x1d90
```

Prefer an Epson or Bixolon ESC/POS model for the first purchase. Avoid raster-only Star models for the first target unless a separate Star profile and acceptance plan are added.

## 11. Definition of done

- Save & Print prints directly without a Windows dialog.
- LAN printing works with the purchased printer.
- USB printing works with the purchased printer before being advertised.
- The preview and print output use one canonical receipt document.
- The preview and print output use the same prepared logo bitmap.
- Logo size and position are adjustable in one shared location.
- Existing saved receipts and printer history remain readable.
- The obsolete Windows printing path is removed.
- Automated tests, lint, build, and packaging checks pass.
- Physical acceptance checks pass for every advertised transport.

## 12. Out of scope

- Windows spooler printing.
- Microsoft Print to PDF.
- A user-editable visual template designer.
- User-configurable arbitrary logo offsets.
- Serial printing.
- USB device names when the library only exposes vendor/product IDs.
- A permanent virtual-printer mode in the production UI.
- A separate Save-only receipt action.
