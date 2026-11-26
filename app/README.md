# Invoice Generator

This is a local Electron app that creates shipping receipts, stores them in SQLite, previews them, and prints them directly to an ESC/POS thermal printer over LAN or USB. Local-first Windows invoice and thermal receipt generator built with Electron, React, Mantine, and SQLite.

## Requirements

- Windows 10/11 x64
- Node.js 22.12 or newer
- npm

## Commands

```powershell
npm install
npm run dev
npm test
npm run build
npm run dist
```

`npm run dist` creates the Windows NSIS installer and portable executable under `release/`.

Local data is stored in Electron's `userData` directory. The SQLite database is at `database/invoices.sqlite`; it is never written inside the installation directory.

## Printing model

The app prints directly to ESC/POS thermal printers — there is **no Windows print dialog, no Windows printer selection, and no call to `webContents.print()`**. When the user clicks **Save & Print**, the app:

1. Validates the receipt.
2. Saves it to SQLite.
3. Builds one canonical set of `retail-print-kit` receipt operations.
4. Renders those operations for the on-screen preview (same operations as print).
5. Encodes the same operations as ESC/POS bytes.
6. Sends the bytes directly to the configured thermal printer:
   - LAN through `NetTransport` (raw TCP, port 9100).
   - USB through `UsbTransport`.
7. Records success or failure in the database.

A separate non-printing Save action is not provided — saving and printing are a single **Save & Print** step.

## Printer setup (Settings → Printer)

A single row in `printer_profiles` describes the printer. The connection type is either **LAN** or **USB** — there is no installed-printer (`system`) option.

### LAN printer

| Field | Description |
|---|---|
| Connection type | `network` |
| Printer host / IP | The printer's IP address (read it from the printer's self-test page — hold Feed while powering on, on most models) |
| Port | TCP port, normally `9100` |

There is no discovery on this path: a raw port-9100 printer is invisible to Windows. Type the IP directly. The **Test current settings** button opens the socket, sends a small ESC/POS test receipt, and reports bytes sent or the exact socket error (timeout, refused, DNS) if it cannot connect.

### USB printer

| Field | Description |
|---|---|
| Connection type | `usb` |
| USB device | Choose from discovered USB printer-class devices (`vendorId:productId`) |

USB device names are not shown — only vendor/product IDs, which is all `retail-print-kit` exposes. Known vendor IDs: Epson `0x04b8`, Star Micronics `0x0519`, Bixolon `0x1504`, Citizen `0x1d90`. Prefer an Epson or Bixolon ESC/POS model.

## Paper width

| Field | 80 mm | 58 mm |
|---|---|---|
| `paperWidthMm` | 80 | 58 |
| `printableWidthMm` | 72 | 50 |
| `characterWidth` | 48 | 32 |

Presets live in `src/shared/paper.js` and are derived on save. Dot density (8 dots/mm), encoding (CP437), cut (on), feed (2 lines) and timeout (5 s) stay in the profile row with fixed defaults.

## Preview and print use one canonical receipt

The on-screen preview and the ESC/POS print output originate from the same receipt operations (`src/shared/receipt.js`). All receipt layout — block order, alignment, column widths and the logo image — lives in `src/shared/receipt-template.json`, so it can be edited at the [retail-print-kit designer](https://arka162.github.io/retail-print-kit/designer/) and re-imported without touching source code. Physical output cannot be guaranteed pixel-identical to a browser because browser fonts and printer fonts differ, but both outputs are generated from the same operations.

## Test print

**Save & Print** prints the receipt directly without a Windows dialog. Failed printing leaves the receipt saved with a `failed` print status and records the error in print history; successful printing records print history.

The **Test current settings** button in Settings exercises the same direct transport as Save & Print, without saving anything, so the connection can be verified before printing receipts.

## Virtual testing (no hardware required)

Automated tests print without Electron or physical hardware:

- A fake `Transport` (`tests/helpers/fake-transport.js`) records written bytes and supports configurable open/write/close failures, so exact ESC/POS payloads and failure paths can be asserted deterministically.
- A virtual LAN printer (`tests/helpers/virtual-lan-printer.js`) is a local TCP server on `127.0.0.1` that captures ESC/POS bytes, with accept/refuse/timeout/disconnect modes.
- LAN and USB paths produce identical receipt bytes.

There is no permanent virtual-printer mode in the production UI.

## Hardware acceptance (required before advertising USB)

Real hardware acceptance is still required before releasing LAN or USB support:

- Verify LAN printing over TCP port 9100: paper width, character grid, logo, text alignment, bolding, cut, and feed.
- Verify USB device discovery and selection, then repeat the physical checks over USB.
- Verify a Windows print dialog never appears.
- Verify failed printing leaves the receipt saved with a failed print status.
- Verify successful printing records print history.

USB support should not be advertised until USB hardware printing passes.
