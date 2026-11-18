# Technical Validation — Areas 5–7 (Encoding/Code Pages; Printing Behavior/Error Detection; Migration Data-Loss)

**Source inspected:** `app/src/main/printing.js`, `app/src/main/system-print.js`, `app/src/main/index.js`, `app/src/main/database.js`, `app/src/main/logo-raster.js`, `app/src/renderer/src/pages/NewInvoicePage.jsx`, `app/src/tests/printing.test.js`.

---

## Area 5 — Printer encoding, code pages and unsupported characters

### 5.1 `sanitizeEscPosText` drops characters silently without warning

**File:** `app/src/main/printing.js:19-32`

**Actual behavior:**
```js
export function sanitizeEscPosText(value) {
  return String(value ?? '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/[×]/g, 'x')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
}
```

All characters below code 32 (except none allowed — newline is handled separately by `write` adding `0x0a`), DEL (127), and any character not encodable in the target code page are silently removed. `iconv-lite` encoding of characters not in the target code page: `iconv.encode` replaces unrepresentable characters with `?` or drops them depending on the library behavior.

**Verification:** Test at `printing.test.js:7-8` confirms `'line\u0007break'` → `'linebreak'` (control char dropped), and `'A\u00a0B×C‘D’“E”'` → `'A BxC\'D\'"E"'`.

**Reproducible failure scenario:** Customer name or address contains "Café" (é = U+00E9) with encoding CP437. CP437 does have é at 0x82, so it might encode. But "₱" (peso sign) or emoji or accented characters outside CP437 are dropped silently. The receipt prints with missing text and no indication to the user.

**Recommended minimal fix:** At minimum, log a warning when characters are dropped. Better: replace unrepresentable characters with `?` visibly rather than dropping them, and/or validate input at the form level (`InvoiceForm`) to warn users about non-CP437 characters before printing.

**Architectural change required?** No.

### 5.2 Code page selection is incomplete for ESC/POS clones

**File:** `app/src/main/printing.js:8-17`

```js
const codePages = {
  cp437: 0, cp850: 2, cp860: 3, cp863: 4, cp865: 5,
  win1252: 16, cp852: 18, cp858: 19
}
```

**Actual behavior:** Only 8 code pages are mapped to ESC/POS `ESC t n` codes. The printer profile's `encoding` field is validated as a non-empty string but not checked against this map. If `page === undefined`, no `ESC t n` is sent — the printer uses its default code page, which may not match the `iconv` target encoding.

**Verification:** `normalized = encoding.toLowerCase().replace(/windows-/, 'win').replace('printer default', 'ascii')`. If `iconv.encodingExists(normalized)` is false, target falls back to `'ascii'` — silently stripping all non-ASCII characters.

**Reproducible failure scenario:** Printer profile encoding = "CP858" (has euro sign). `codePages['cp858'] = 19`, so `ESC t 19` is sent — correct. But encoding = "CP866" (Russian Cyrillic, common in some regions) → not in map → no code page command sent, `iconv` target falls back to `ascii` → all Cyrillic characters dropped.

**Recommended minimal fix:** Expand the `codePages` map or validate that the selected encoding is supported; warn the user in Settings if the encoding is not in the supported list.

**Architectural change required?** No.

### 5.3 HTML/preview paths do not apply encoding sanitization

**File:** `app/src/main/printing.js:154-179` `receiptLinesToHtml`, `app/src/renderer/src/invoice/ReceiptPreview.jsx`

**Actual behavior:** `receiptLinesToHtml` uses `escapeHtml()` for XML safety but does NOT call `sanitizeEscPosText`. Characters like emoji, control chars, or Unicode symbols pass through to the HTML document and are rendered by the browser's font subsystem — which may show tofu boxes (□) or missing glyphs. ESC/POS would have dropped them.

**Inconsistency:** The same receipt line with "Café ☕" prints fine in Windows HTML (browser renders it) but the ☕ is dropped in ESC/POS. Preview and Windows HTML show content that will not appear on the ESC/POS print.

**Reproducible failure scenario:** Receipt contains "☕ Coffee" in the shipping service name. Preview and Windows HTML show the coffee cup; ESC/POS thermal printer prints " Coffee" with the cup missing.

**Recommended minimal fix:** Apply the same `sanitizeEscPosText` (or a HTML-safe equivalent) in `receiptLinesToHtml` and preview, or document that ESC/POS has a smaller supported character set than the preview.

**Architectural change required?** No.

### 5.4 `iconv-lite` ASCII fallback silently strips non-ASCII

**File:** `app/src/main/printing.js:52`

```js
const target = iconv.encodingExists(normalized) ? normalized : 'ascii'
```

**Actual behavior:** If the configured encoding is not supported by `iconv-lite`, the target silently becomes `'ascii'`. All bytes ≥ 128 are stripped. No error is thrown, no warning logged.

**Reproducible failure scenario:** User sets encoding to "ISO-8859-15" (not in `iconv-lite`'s complete list? actually iconv-lite does support many). If they set an unsupported encoding like "MACROMAN", all accented characters are dropped without notification.

**Recommended minimal fix:** Validate encoding at printer save time against `iconv.encodingExists` and the `codePages` map; show error in Settings if unsupported.

**Architectural change required?** No.

---

## Area 6 — Actual printing behavior and error detection

### 6.1 ESC/POS network print is fire-and-forget — no output verification

**File:** `app/src/main/printing.js:100-138` `sendNetwork`

**Actual behavior:**
```js
socket.once('close', (hadError) => {
  if (settled || hadError) return
  settled = true
  resolve({ ok: true, message: 'Data sent to printer. Physical output is not guaranteed.', bytes: data.length })
})
```

The promise resolves on socket `close` after `socket.end()`, not on printer acknowledgment. ESC/POS printers typically do not send ACK/NAK over raw TCP port 9100, so there is no way to confirm the printer actually received or printed the data. The message explicitly admits: "Physical output is not guaranteed."

**Verification:** `printing.test.js:51-78` tests `sendNetwork` against a local TCP server that receives data and closes — confirms bytes are transmitted, not that a printer printed them.

**Reproducible failure scenario:** Printer is powered off, out of paper, or offline. `sendNetwork` may still resolve `ok: true` if the TCP connection succeeds and data is written to the socket buffer (OS may buffer it). The app shows "Receipt saved; print job sent" while nothing prints. `print_status` is set to `succeeded` in the database (`main/index.js:276`) despite no physical output.

**Recommended minimal fix:** Change the success message to make clear this is transmission success, not print confirmation. Consider adding a printer status query if the ESC/POS model supports it (e.g. `ESC v` or `ESC a` status), but most thermal printers on port 9100 don't respond. At minimum, do not set `print_status = 'succeeded'` until we have some confirmation — but without printer feedback, this is architecturally limited.

**Architectural change required?** Partially — the "print succeeded" status is misleading without printer feedback. A full fix requires printer-specific status commands (architectural). Minimal fix: rename status to "transmitted" or adjust messaging.

### 6.2 Windows print `silent` flag only affects test prints

**File:** `app/src/main/system-print.js:4-43`, `app/src/main/index.js:220`, `app/src/main/index.js:273`

**Actual behavior:**
- `printer:test` calls `printSystem(lines, profile, '', { silent: true })` — skips the print dialog.
- Real `invoice:print` calls `printSystem(lines, printer, logoDataUrl)` with default `silent: false` — triggers the Windows print dialog for every receipt.

**Reproducible failure scenario:** A retail counter worker prints 50 receipts in a day and gets 50 Windows print dialogs to click through. This is a workflow bottleneck, not a crash bug.

**Recommended minimal fix:** Add a "silent print" toggle in printer settings for system printers, defaulting to false (current behavior) but optionally true for dedicated receipt printers.

**Architectural change required?** No — UI toggle + pass `silent` through.

### 6.3 Offscreen BrowserWindow creation per print is slow and leaves windows on error

**File:** `app/src/main/system-print.js:9-12`

**Actual behavior:** Every Windows print creates a new hidden `BrowserWindow`, loads the HTML, prints, then destroys it. If the print callback never fires (e.g. printer spooler hang), the promise never resolves/rejects and the window may leak — though the `finally` block destroys it if not already destroyed.

**Risk:** Slow printing (window creation + page load per receipt). Under high volume, this adds latency per receipt.

**Recommended minimal fix:** Reuse a single hidden print window instead of creating/destroying per print. Or accept the latency for low-volume receipt printing.

**Architectural change required?** No — optimization, not required.

### 6.4 No printer availability check before print

**File:** `app/src/main/index.js:237-246`

**Actual behavior:** If `printer` is null (no default printer configured), the invoice is saved with `print_status = 'failed'` and returns an error message. But if a system printer name is configured but the printer is offline/deleted from Windows, `webContents.print` will fail asynchronously — the callback receives `success: false`, and the error is caught and recorded.

**Verification:** This path is handled — failure is recorded in `print_history` and `print_status = 'failed'`.

**Gap:** For network printers, `sendNetwork` may resolve `ok: true` even if the printer is offline (see 6.1). No pre-flight check.

**Recommended minimal fix:** Add `printer:list-system` (already exists) and optionally a connectivity check. For network, a TCP connect before sending data would catch unreachable printers earlier.

**Architectural change required?** No.

---

## Area 7 — Data-loss risks in database migrations

### 7.1 Migration v2 deletes all invoices, items, and print history

**File:** `app/src/main/database.js:99-111`

```js
{
  version: 2,
  sql: `
    ALTER TABLE invoices ADD COLUMN shipping_from TEXT NOT NULL DEFAULT '';
    ALTER TABLE invoices ADD COLUMN insurance_label TEXT NOT NULL DEFAULT '';
    ALTER TABLE printer_profiles ADD COLUMN dot_density REAL NOT NULL DEFAULT 8;

    -- The shipping receipt is the only template now, so the old invoice rows go.
    DELETE FROM invoice_items;
    DELETE FROM print_history;
    DELETE FROM invoices;
  `
}
```

**Actual behavior:** When a user upgrades from database version 1 to 2, ALL existing invoice data, line items, and print history are permanently deleted. The comment acknowledges this: "The shipping receipt is the only template now, so the old invoice rows go."

**Verification:** This is in the migration SQL, not conditional. `openDatabase` (`database.js:233-253`) runs migrations sequentially when `PRAGMA user_version` is less than the migration version.

**Reproducible failure scenario:** A user has been using v1 of the app, has saved invoices and print history, upgrades to v2. On first launch, `openDatabase` runs migration v2, which deletes all their historical invoices and print records. Irrecoverable data loss unless they have a backup.

**Recommended minimal fix:** Remove the `DELETE` statements from migration v2. The `ALTER TABLE` additions are safe; the deletes are destructive and unnecessary. If old `invoice_items` rows are incompatible with the new schema, they could be left orphaned or archived rather than deleted.

**Architectural change required?** No — remove three DELETE lines from the migration SQL.

### 7.2 Migration has no rollback or backup step

**File:** `app/src/main/database.js:238-252` `openDatabase`

**Actual behavior:** Migrations run inside a `transaction()` wrapper (`database.js:205-215`), so if a migration SQL statement fails, the transaction rolls back. But a successful migration that deletes data (v2's DELETEs) is committed irrevocably. There is no pre-migration backup of the SQLite file.

**Reproducible failure scenario:** Migration v2 partially succeeds (ALTERs complete, DELETEs execute) — all data is gone with no recovery path.

**Recommended minimal fix:** Copy the SQLite file to a backup location before running migrations, or at minimum remove the destructive DELETEs as noted in 7.1.

**Architectural change required?** No.

### 7.3 `saveInvoice` replaces all items on every save (delete + reinsert)

**File:** `app/src/main/database.js:521-537` `saveInvoice`

```js
database.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id)
const insertItem = database.prepare(`INSERT INTO invoice_items ...`)
for (const item of normalizedItems) { insertItem.run(...) }
```

**Actual behavior:** Every `saveInvoice` call deletes all existing items for that invoice and reinserts them. Since the current template only supports one item, this is benign now, but if multi-item support is added later, this pattern loses item-level history (e.g. if an invoice is re-saved, old item rows are gone).

**Risk:** Combined with migration v2 deleting all data, there is no item-level audit trail.

**Recommended minimal fix:** Document as a known pattern; no change needed for single-item receipts. If multi-item is added, consider versioned items or soft deletes.

**Architectural change required?** No.

---

## Summary: Verified Bugs vs Potential Risks

| # | Issue | Severity | Verified Bug? | Architectural Change? |
|---|-------|----------|---------------|----------------------|
| 1 | `wrapText` collapses internal spaces, destroying `formatTableRow` column alignment in ESC/POS | High | Yes (code path confirmed; test doesn't check alignment) | No |
| 2 | `formatTableRow` price column too narrow on 58 mm (4 chars) — price truncation | High | Yes (calculation verified at width 32) | No |
| 3 | Migration v2 `DELETE FROM invoices/items/history` — irreversible data loss | Critical | Yes (confirmed in migration SQL) | No |
| 4 | ESC/POS fire-and-forget — `print_status = 'succeeded'` with no physical confirmation | Medium | Yes (code path confirmed) | Partial (status semantics) |
| 5 | Optional long fields (address/weight/tracking) bypass `wrapText` in line builder | Medium | Potential (test fixtures are short) | No |
| 6 | `formatColumns` drops left label entirely when right field ≥ width | Low | Potential (edge case) | No |
| 7 | Logo three representations; ESC/POS threshold/no dithering loses detail | Low | Potential (depends on logo artwork) | No |
| 8 | ESC/POS logo centering uses hardcoded 12 dots/char, ignores `dotDensity` | Low | Potential (only wrong at non-8 dot densities) | No |
| 9 | Encoding not validated against `codePages` map or `iconv` support | Medium | Potential (unsupported encoding = silent ASCII fallback) | No |
| 10 | Silent character dropping in `sanitizeEscPosText` | Medium | Potential (depends on input data) | No |
| 11 | Preview font heuristic doesn't match Windows HTML/physical print | Low | Potential (visual, not data) | No |
| 12 | Windows print dialog on every real print (workflow friction) | Low | Yes (behavior confirmed) | No |

**Top priority fixes (no architectural changes):** Remove migration v2 DELETEs; fix `wrapText` space-collapse in ESC/POS; widen price column or adjust table proportions for 58 mm; validate printer encoding; make ESC/POS print status messaging honest about fire-and-forget.

*End of Areas 5–7. All findings ready for independent review.*
