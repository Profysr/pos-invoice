# Receipt Workflow Investigation — Part D: Printing Analysis

**Source:** `app/src/main/printing.js`, `app/src/main/system-print.js`, `app/src/main/logo-raster.js`, `app/src/main/index.js`, `app/src/renderer/src/invoice/ReceiptPreview.jsx` + `.css`.

---

## D.1 Three Output Paths — Side-by-Side Comparison

| Aspect | React Live Preview | Windows System Print | LAN ESC/POS (Network) |
|--------|-------------------|----------------------|----------------------|
| **File** | `ReceiptPreview.jsx` + `.css` | `system-print.js` `printSystem()` + `printing.js` `receiptLinesToHtml()` | `printing.js` `escPosBytes()` + `sendNetwork()` |
| **Rendering tech** | React DOM, CSS monospace | Standalone HTML document in offscreen `BrowserWindow` | Raw ESC/POS byte buffer over TCP |
| **Where it runs** | Renderer process (React) | Main process (Electron) | Main process (Node `net.Socket`) |
| **Trigger** | Continuous (reactive to form changes) | User clicks Print (`silent: false`, shows dialog) | User clicks Print (`silent: false` irrelevant — no dialog) |
| **Font** | Consolas/Courier New/DejaVu Sans Mono, 7–14px dynamic | 12px Consolas/Courier New, fixed | Printer's internal Font A (fixed grid) |
| **Sizing** | `paperWidth × 3.78` px; font derived from char grid | `@page size: paperWidth mm`, body width = `printableWidth mm`, margin 2mm | `printableDots = printableWidthMm × dotDensity` |
| **Alignment** | CSS `text-align` | Inline `style="text-align:..."` | `ESC a n` (0=left, 1=center, 2=right) |
| **Bold** | CSS `font-weight: 700` | Inline `font-weight: 700` | `ESC E n` (printer-dependent) |
| **Logo** | `` `max-width: 70%` `` (CSS scaled) | `` `max-width: 70%` `` (inline style) | `GS v 0` 1bpp raster, threshold 140, no dithering |
| **Divider** | Dashed CSS border | Dashed HTML border | Repeated `'-'` characters |
| **Blank lines** | `.receipt-gap` (0.7em) | Empty `<div>` | `write('')` newlines |
| **Text wrapping** | CSS `word-break: break-word` (visual only) | CSS `white-space: pre-wrap` (visual only) | `wrapText()` — actual line wrapping at char width |
| **Character limit** | None enforced visually | None enforced visually | `wrapText()` guarantees ≤ `width` per chunk |
| **Print dialog** | N/A | Yes (`silent: false`) | No dialog — raw TCP |
| **Error detection** | None | `webContents.print` callback success/failure | Socket close = "sent" (no printer ACK) |
| **Physical output guarantee** | N/A | Not guaranteed | Not guaranteed (fire-and-forget) |

---

## D.2 Where Outputs Can Diverge

### D.2.1 Font metrics and line width

**Preview** derives font size to fit `characterWidth` glyphs across the paper width:
```
paperPx = paperWidth × 3.78
fontSize = clamp((paperPx − 16) / (characterWidth × 0.55), 7, 14)
```
At 80 mm / 48 chars: ≈ 10px. The `0.55` character advance ratio is an approximation — actual Consolas advance varies, so 48 characters may visually overflow or underfill the paper.

**Windows HTML** uses a fixed 12px font at `printableWidth mm` body width. 12px Consolas may fit more or fewer characters per line than the preview's calculated size. There is no guarantee that what fits in preview fits on paper.

**ESC/POS** uses the printer's Font A grid, where character width depends on the printer's dpi (typically 203 dpi → 12 dots/char at Font A). The `dotsPerChar` default in `escPosBytes` is 12, but `dotDensity` from the printer profile (4–16) is NOT passed through as `dotsPerChar`, so centering math is wrong for non-8 dot densities.

**Divergence:** A 48-character line that fits in preview may wrap differently in ESC/POS (where `wrapText` re-wraps) and may render at a different density in Windows HTML.

### D.2.2 Wrapping inconsistency

Only these are wrapped via `wrapText()`:
- Footer paragraphs (centered, wrapped in all three paths since they're just text lines).
- ESC/POS text lines (line 91 of `printing.js`).

These are NOT pre-wrapped in `buildShippingReceiptLines()`:
- Destination address, weight, expected delivery date value, tracking number value.
- These are emitted as single `{ text }` lines.

**Result:**
- Preview/HTML: CSS `word-break: break-word` may split long words mid-word visually, but the line object itself is not split.
- ESC/POS: `escPosBytes` line 91 calls `wrapText(text, width)` on every text line, so long values DO get wrapped at the printer. But the two-space indent prefix (`'  ' + value`) is lost on wrapped continuation lines.
- The table header/data rows from `formatTableRow()` are already exactly `width` characters with internal padding spaces. `escPosBytes` then applies `wrapText()` to them, which calls `.trim().split(/\s+/)` — collapsing all internal padding spaces to single spaces. **Column alignment is destroyed in ESC/POS output.**

### D.2.3 Logo rendering differences

| Path | Logo handling |
|------|-------------|
| Preview | `` `max-width: 70%`, `height: auto`, centered via CSS `` |
| Windows HTML | Same CSS as preview, inline style |
| ESC/POS | `rasterizeLogo()` → resize to `widthDots = printableDots × 0.7` → 1bpp threshold at gray=140 → `GS v 0` bitmap |

**Divergence:** A color logo with anti-aliased text renders crisply in preview/HTML but becomes a hard-thresholded 1bpp image on ESC/POS. Thin lines and light grays may disappear entirely. The documented shortcut in `logo-raster.js:8` acknowledges: "fixed gray threshold, no dithering."

### D.2.4 Bold and emphasis

Preview and HTML use CSS `font-weight: 700` for bold lines (table header, Grand Total). ESC/POS uses `ESC E n` which is printer-dependent — some ESC/POS clones ignore it or render it weakly. There is no underline support in any path.

### D.2.5 Physical printable area

- **Preview:** Draws at full `paperWidth` with 8px CSS padding inside `.receipt-paper`. Does NOT simulate the 2mm `@page` margin or hardware printable margins.
- **Windows HTML:** `@page { size: paperWidth mm auto; margin: 2mm }`, body width = `printableWidth mm`. `margins: { marginType: 'none' }` tells Electron to use the HTML `@page` margin instead of hardware margins.
- **ESC/POS:** `printableDots = printableWidthMm × dotDensity` used for logo centering only. Text lines are not clipped to printable width — `wrapText` ensures ≤ `characterWidth` chars, but the physical dot width depends on the printer's actual dpi.

**Divergence:** The preview shows the full paper width; Windows print clips to `printableWidth` inside 2mm margins; ESC/POS assumes the printer knows its own printable area.

---

## D.3 ESC/POS Byte Stream Detail

`escPosBytes()` (`printing.js:34-98`) generates:

```
ESC @                              (initialize printer)
ESC t n                            (select code page, if encoding is in map)
[for each line:]
  ESC a n                          (alignment: 0=left, 1=center, 2=right)
  ESC E n                          (bold on/off)
  ESC - 0                          (underline off)
  [wrapped text chunks] + 0x0a     (newline per chunk)
  OR '-'.repeat(width) + 0x0a      (divider)
  OR [logo GS v 0 bitmap]          (logo)
GS V 48 03                         (cut, if cut=true)
[feed blank lines]
```

The `writeBuffer` mechanism ensures logo bytes are inserted in stream order (not appended at the end).

### D.3.1 sendNetwork reliability

`sendNetwork()` (`printing.js:100-138`) opens a TCP socket, writes the buffer, and resolves on socket `close`. It does NOT read any response from the printer. The message explicitly states: "Data sent to printer. Physical output is not guaranteed."

If the printer is powered off, out of paper, or offline:
- The TCP connect may still succeed (OS buffers).
- `socket.write()` may succeed (data in OS buffer).
- `socket.close()` fires.
- App reports `ok: true` and sets `print_status = 'succeeded'`.
- Nothing physically prints.

---

## D.4 Windows Print Detail

`printSystem()` (`system-print.js:4-43`):
1. Creates a hidden, sandboxed `BrowserWindow`.
2. Generates HTML via `receiptLinesToHtml()` — a complete `<!doctype html>` document with `@page` CSS and inline-styled divs.
3. Loads it as a `data:text/html` URL.
4. Calls `webContents.print({ silent: false, deviceName: printer.systemPrinterName, printBackground: true, margins: { marginType: 'none' } })`.
5. Destroys the window and restores focus.

For real prints, `silent: false` shows the Windows print dialog every time. For `printer:test`, `silent: true` skips the dialog.

---

*End of Part D. Next: Part E (problems and recommendations).*
