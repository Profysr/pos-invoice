# Receipt Workflow Investigation — Part E: Problems and Recommendations

**Source:** All files inspected in Parts A–D. No code modified.

---

## E.1 Verified Bugs (confirmed from code analysis)

### Bug 1: ESC/POS column alignment destroyed by `wrapText`

**Files:** `app/src/main/printing.js:91`, `app/src/shared/receipt.js:36-60`

**Behavior:** `formatTableRow()` and `formatColumns()` produce lines with internal padding spaces for column alignment. `escPosBytes()` line 91 then applies `wrapText(line.text, width)` to every text line. `wrapText` calls `paragraph.trim().split(/\s+/)`, collapsing all internal whitespace to single spaces. The table header `"Product    Qty  Unit Price  Price"` becomes `"Product Qty Unit Price Price"` — column alignment lost.

**Reproducible:** Print any receipt via ESC/POS. The Product/Qty/Unit Price/Price columns will not align vertically.

**Fix:** In `escPosBytes`, skip `wrapText` for pre-formatted lines (table rows, `formatColumns` output). Alternatively, pass a flag on line objects indicating they are already width-limited and should not be re-wrapped. Simplest: detect lines containing multiple space-separated columns and wrap at character level without collapsing spaces.

**Architectural change?** No.

---

### Bug 2: `formatTableRow` price column too narrow on 58 mm paper

**File:** `app/src/shared/receipt.js:45-60`

**Behavior:** At width 32 (58 mm): `productEnd = 13`, `qtyEnd = 18`, `unitEnd = 28`, price column = `[28, 32)` = 4 characters. An amount like `$999.99` (8 chars) is sliced to `$999` — data corruption.

**Reproducible:** Set printer to 58 mm (characterWidth 32), enter price 999.99, print. Receipt shows truncated price.

**Fix:** On narrow paper, drop the Unit Price column or reduce product column width to give price more room. Alternative: format price without currency symbol in the table row (symbol appears in header context).

**Architectural change?** No.

---

### Bug 3: Migration v2 deletes all invoices, items, and print history

**File:** `app/src/main/database.js:99-111`

**Behavior:** Migration v2 SQL contains:
```sql
DELETE FROM invoice_items;
DELETE FROM print_history;
DELETE FROM invoices;
```
All existing data is permanently deleted on upgrade from v1 to v2.

**Reproducible:** A user with v1 data upgrades to v2. On first launch, `openDatabase()` runs migration v2 and wipes all historical invoices and print records. Irrecoverable.

**Fix:** Remove the three `DELETE` statements from migration v2. The `ALTER TABLE` additions are safe and sufficient.

**Architectural change?** No.

---

### Bug 4: ESC/POS prints report success with no physical confirmation

**Files:** `app/src/main/printing.js:100-138`, `app/src/main/index.js:276-294`

**Behavior:** `sendNetwork()` resolves on socket `close` after writing data. It never reads printer ACK/NAK. The `invoice:print` handler sets `print_status = 'succeeded'` and records `print_history` as succeeded based solely on TCP transmission success.

**Reproducible:** Printer is powered off or out of paper. TCP connect may still succeed (OS buffers), `socket.write()` succeeds, socket closes. App reports "Receipt saved; print job sent" and marks status succeeded. Nothing prints.

**Fix:** Change success messaging to indicate transmission only, not print confirmation. Do not set `print_status = 'succeeded'` for network prints until printer feedback is available (or use a "transmitted" intermediate status). A full fix requires printer-specific status commands (architectural), but the messaging fix is minimal.

**Architectural change?** Partial — status semantics need a "transmitted" state if physical confirmation is required.

---

## E.2 Potential Risks (not yet observed as failures)

### Risk 1: Optional long fields bypass `wrapText` in line builder

**Files:** `app/src/shared/receipt.js:118-134`

**Behavior:** Destination address, weight, expected delivery value, and tracking value are emitted as unwrapped `{ text }` lines. ESC/POS wraps them at print time (via `escPosBytes` line 91), but preview and Windows HTML rely on CSS `word-break: break-word` which may split mid-word or overflow.

**Likelihood:** High if users enter long addresses on 58 mm paper.

**Fix:** Apply `wrapText()` to these values in `buildShippingReceiptLines()` and push each chunk as a separate line.

**Architectural change?** No.

---

### Risk 2: `formatColumns` drops left label when right field ≥ width

**File:** `app/src/shared/receipt.js:36-42`

**Behavior:** If `rightText.length >= width`, the function returns only `rightText.slice(-width)` and drops the left label entirely with no truncation indicator.

**Likelihood:** Low with current data (amounts are short), but possible with unusual currency formats or long labels.

**Fix:** Preserve the left label and truncate the right field with an ellipsis or visible indicator.

**Architectural change?** No.

---

### Risk 3: Logo three representations; ESC/POS loses detail

**Files:** `ReceiptPreview.jsx:42-46`, `printing.js:159-163`, `printing.js:72-88`, `logo-raster.js:9-33`

**Behavior:** Preview and HTML render the logo as CSS-scaled images (anti-aliased, grayscale). ESC/POS rasterizes via `rasterizeLogo()` with fixed gray threshold 140 and no dithering. Light grays, thin lines, and anti-aliased text may disappear.

**Likelihood:** Depends on logo artwork. The code already documents this shortcut.

**Fix:** Add Floyd-Steinberg dithering to `rasterizeLogo()`, or make threshold configurable per printer profile.

**Architectural change?** No.

---

### Risk 4: ESC/POS logo centering ignores `dotDensity`

**File:** `app/src/main/printing.js:75-81`, `app/src/main/index.js:260-262`

**Behavior:** `padSpaces = leftPadDots / dotsPerChar` uses hardcoded `dotsPerChar = 12`. But `dotDensity` from printer profile (4–16) is used to compute `printableDots` but not passed as `dotsPerChar`. At dotDensity 16, centering math is off by 33%.

**Likelihood:** Only affects printers configured with non-8 dot densities.

**Fix:** Pass `dotsPerChar: printer.dotDensity` to `escPosBytes()`.

**Architectural change?** No.

---

### Risk 5: Printer encoding not validated

**Files:** `app/src/main/printing.js:8-17, 45-52`, `app/src/database.js:449-450`

**Behavior:** `codePages` map supports only 8 encodings. If the configured encoding is not in the map, no `ESC t n` is sent. If `iconv.encodingExists()` returns false, target falls back to `'ascii'` — silently dropping all non-ASCII characters. No warning to user.

**Likelihood:** Medium if users select unusual encodings.

**Fix:** Validate encoding at printer save time against `codePages` map and `iconv.encodingExists()`. Show error in Settings if unsupported.

**Architectural change?** No.

---

### Risk 6: Silent character dropping in `sanitizeEscPosText`

**File:** `app/src/main/printing.js:19-32`

**Behavior:** Characters below code 32, DEL (127), and any unrepresentable in the target code page are silently removed. Users get no indication that text was dropped.

**Likelihood:** Medium if addresses/names contain accented characters, emoji, or smart quotes.

**Fix:** Replace unrepresentable characters with `?` visibly instead of dropping them, or warn at form level about non-CP437 characters.

**Architectural change?** No.

---

### Risk 7: Preview font heuristic doesn't match physical print

**File:** `app/src/renderer/src/invoice/ReceiptPreview.jsx:31-32`

**Behavior:** `CHAR_RATIO = 0.55` and `MM_TO_PX = 3.78` are approximations. Actual glyph advance varies by font and OS. Lines may visually fit in preview but overflow on paper, or vice versa.

**Likelihood:** Medium — visual, not data-breaking.

**Fix:** Document as known limitation. Optionally sync preview font size to the Windows HTML path (12px at printable width).

**Architectural change?** No.

---

### Risk 8: Windows print dialog on every real print

**File:** `app/src/main/index.js:273`

**Behavior:** `silent: false` for real prints triggers the native Windows print dialog for every receipt.

**Likelihood:** Certain — affects every production print.

**Fix:** Add a "silent print" toggle in printer settings for system printers.

**Architectural change?** No.

---

### Risk 9: `shippingFrom` not editable per-receipt

**Files:** `renderer/src/pages/InvoiceForm.jsx` (no shippingFrom field), `NewInvoicePage.jsx:45`

**Behavior:** `shippingFrom` is populated from company settings at bootstrap (`companyShippingBlock()`) and is not a form field. Users cannot override it for an individual receipt.

**Likelihood:** Medium for businesses that ship from multiple locations.

**Fix:** Add `shippingFrom` as an editable form field with company settings as default.

**Architectural change?** No.

---

### Risk 10: No customer info on receipt

**Files:** `buildShippingReceiptLines()` never references customer fields.

**Behavior:** `customerName`, `customerAddress`, etc. exist in the database but never appear on the receipt.

**Likelihood:** Depends on business requirements.

**Fix:** Add customer block to template if required.

**Architectural change?** No.

---

## E.3 Recommended Fix Priority (smallest practical first)

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| 1 | Remove migration v2 `DELETE` statements (`database.js:106-110`) | Trivial | Prevents data loss |
| 2 | Fix ESC/POS `wrapText` collapsing table column spaces (`printing.js:91`) | Small | Restores column alignment on thermal prints |
| 3 | Widen price column or adjust table proportions for 58 mm (`receipt.js:45-60`) | Small | Prevents price truncation on narrow paper |
| 4 | Validate printer encoding against `codePages` + `iconv` (`database.js`, `printing.js`) | Small | Prevents silent character loss |
| 5 | Fix ESC/POS logo centering to use `dotDensity` (`printing.js:75-81`, `index.js:260`) | Small | Correct logo placement on non-8 dpi printers |
| 6 | Wrap optional long fields in `buildShippingReceiptLines` (`receipt.js:118-134`) | Small | Prevents overflow on narrow paper |
| 7 | Adjust `print_status` messaging for ESC/POS fire-and-forget (`index.js:276-294`) | Small | Honest about transmission vs physical print |
| 8 | Add `shippingFrom` as editable form field | Medium | Per-receipt sender override |
| 9 | Add dithering to `rasterizeLogo()` | Medium | Better logo quality on ESC/POS |
| 10 | Add silent print toggle for Windows system printers | Medium | Workflow improvement for counter use |

---

## E.4 What Does NOT Need Changing

- The single-template architecture (`buildShippingReceiptLines`) works as designed for single-item shipping receipts.
- The three-path rendering (preview / Windows HTML / ESC/POS) is functional; divergence is expected but not broken.
- `normalizeShippingReceiptDraft` validation is sound.
- `paperPreset()` fallback logic is correct.
- `groupTrackingNumber`, `formatReceiptDate`, `formatReceiptTime` all work per tests.

---

*End of Part E. All five parts (A–E) are complete across four files. No code was modified during this investigation.*
