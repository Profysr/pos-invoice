Decisions locked in; here's the finalized plan (still no code changed — note your working tree has an uncommitted edit to app/src/main/index.js for the preload path, which I'll build on top of rather than overwrite).
1. Final editable field set (10) vs static template
#	Field	Where it prints	Reference example	Storage
1	Date	left of date row	Mon 08/10/2026	invoices.invoice_date (ISO in DB)
2	Time	right of date row	6:06 PM	invoices.invoice_time (24h in DB)
3	Tracking number	under Tracking #:	9201 9903 6700 7536 4099 45	invoices.tracking_number (raw digits)
4	Price	Price col + Total + Grand Total:	$65.22	invoices.total + currency (symbol display)
5	Shipping from (3–4 lines)	centered sender block under logo	DE MOSS / DE 5800 Corporate Dr Houston / TX 77036 / (800)275-8777	new invoices.shipping_from
6	Expected delivery	under Expected Delivery Date:	Thu 08/13/2026	invoices.expected_delivery_date
7	Service / product name	Product column	Prepaid Mail	reuse invoices.shipping_service
8	Destination	indented line	DANBURY CT 06810	reuse invoices.destination_address
9	Weight	indented line	Weight: 14 lb 6.0 oz	reuse invoices.package_weight
10	Insurance coverage + amount	Up to $100.00 included / $0.00	new invoices.insurance_label + existing invoices.insurance	 
Static template: logo raster, Product | Qty | Unit Price | Price header, qty 1, dashed rules, Total / Grand Total: labels, Expected Delivery Date: / Tracking #: labels, and the two USPS footer paragraphs.
2. Target receipt layout (mono, bold via ESC/POS emphasis)
          [logo raster]
             DE MOSS
    DE 5800 Corporate Dr Houston
            TX 77036
         (800)275-8777
--------------------------------------------------
Mon 08/10/2026                              6:06 PM
--------------------------------------------------
Product              Qty   Unit Price     Price      <- bold
--------------------------------------------------
Prepaid Mail           1                 $65.22
DANBURY CT 06810
Weight: 14 lb 6.0 oz
Expected Delivery Date:
  Thu 08/13/2026
Tracking #:
  9201 9903 6700 7536 4099 45
Up to $100.00 included                    $0.00
Total                                    $65.22
--------------------------------------------------
Grand Total:                             $65.22      <- bold
--------------------------------------------------
<footer paragraph 1>
<footer paragraph 2>

Column widths must be derived from the printer's characterWidth (42–48 chars) — the 4-column row is fixed-width padded text, so the mono preview and the thermal output match exactly.
3. ESC/POS raster logo (the new heavy piece)
- Command: GS v 0 m xL xH yL yH d… — m = scale (0 normal / 1 double-width / 2 double-height), xL/xH = bytes per row, yL/yH = row count, data = 1 bit/dot MSB-first, 1 = black.
- No new npm dependency: the main process already runs in Electron, so nativeImage.createFromPath(logoPath).resize({ width }) → .toBitmap() (BGRA) → grayscale → threshold → bit-pack gives the raster. The logo file already exists (company_metadata.logo_path, chosen in Settings → Logo; PNG/JPG/WebP all load via nativeImage).
- Printer dot density must be known to size it: 203 dpi = 8 dots/mm (80 mm → 576 dots, 58 mm → 384). Add a Printer setting "Dot density (dots per mm)" default 8 (PrinterSettingsSection.jsx, printer_profiles column, main/index.js defaultPrinter()).
- Color → 1-bit: threshold at ~50% gray first; Floyd–Steinberg dithering only if the client's logo looks bad.
- Centering: raster prints at the current x position, so center ≈ leading spaces (12 dots/char at 203 dpi) — left-aligned is the exact option; note the reference logo is near-centered.
4. Change list, file by file
Shared core
- app/src/shared/receipt.js — add buildShippingReceiptLines({ receipt, company, printer }) producing the layout above; add a 4-column pad helper next to formatColumns; keep buildReceiptLines (old shopping flow) until old rows are handled.
- app/src/shared/dates.js (new, ~40 lines) — formatReceiptDate('2026-11-10') → 'Mon 08/10/2026', formatReceiptTime('18:06') → '6:06 PM', groupTrackingNumber('9201990367007536409945') → '9201 9903 6700 7536 4099 45' (group only all-digit strings, else print as typed), plus formatAmount(minor, 'USD') → '$65.22' (symbol, not today's USD 65.22). Date parsing must split yyyy-mm-dd and use new Date(y, m-1, d) — new Date('2026-11-10') is UTC and shifts a day.
Main process
- app/src/main/printing.js — escPosBytes: handle { type: 'image' } → GS v 0 bytes; receiptLinesToHtml (system-print path): render <img> for the same line type.
- app/src/main/logo-raster.js (new) — nativeImage → 1-bit raster + { bytes, widthDots, heightDots }; no dependencies.
- app/src/main/database.js — migration v2: shipping_from, insurance_label, and kind ('invoice' | 'shipping') — kind keeps already-saved shopping invoices rendering with the old builder instead of breaking in History. Map them in mapInvoice. Price → subtotal/total; keep one synthetic line item (service name, qty 1, unitPrice = price) so saveInvoice()'s "at least one line item" rule and totals math stay valid with no DB rewrite.
- app/src/main/index.js — print handler: build shipping lines, resolve the company logo file → raster for the network path, pass dot density to escPosBytes.
Renderer
- app/src/renderer/src/invoice/InvoiceForm.jsx — replace all sections with the 10 shipping fields (Shipping from = Mantine Textarea, 3–4 rows; Price = money input; Service/Destination/Weight/Insurance).
- app/src/renderer/src/pages/NewInvoicePage.jsx — drop items/totals/insurance state and LineItemsEditor; new normalizeShippingReceiptDraft; print + edit flows.
- app/src/renderer/src/invoice/ReceiptPreview.jsx + .css — render the image line (logo), dashed rules, and the 4-column row; today it only renders plain left/center/right text and ignores the divider/feed line types the ESC/POS encoder already understands.
- app/src/renderer/src/pages/SavedInvoicesPage.jsx — History columns become Reference # / Date / Tracking # / Destination / Price / Status; search by reference # / tracking # / destination (currently "invoice # or customer"); View/Edit/Print must use the shipping builder for kind='shipping' rows and the old builder for kind='invoice' rows.
- app/src/renderer/src/settings/PrinterSettingsSection.jsx — add "Dot density (dots per mm)".
Tests
- tests/receipt.test.js (rewrite for the shipping template: date/time formats, price placement, tracking grouping, expected delivery, static blocks, footer), tests/invoice.test.js (shipping draft normalizer + symbol money), tests/database.test.js (migration v2 columns, kind, price→total), tests/printing.test.js (raster bytes: GS v 0 header, byte count = rows × bytes/row), new tests/dates.test.js (weekday/12-hour/grouping).
5. Build order
1. P1 Formatting core — dates.js + symbol money + tests (no UI change).
2. P2 Shipping template builder — buildShippingReceiptLines + preview rendering + tests (text-only, no logo).
3. P3 Form + page — 10 fields, preview, save + print over the existing pipeline → a working shipping receipt on paper.
4. P4 Storage + History — migration v2 (shipping_from, insurance_label, kind), History columns/search, edit round-trip.
5. P5 Logo raster — nativeImage → GS v 0, preview logo, dot-density setting.
6. P6 Verify — npm test, npm run lint, npm run build, then the physical checklist in PLAN.md (paper width, column alignment, logo size/centering, tracking wrap on 42 vs 48 chars).