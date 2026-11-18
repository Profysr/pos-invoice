# Invoice Generator

Local-first Windows invoice and thermal receipt generator built with Electron, React, Mantine, and SQLite.

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

## How the printer model works today

A single row in the `printer_profiles` table describes the printer. Settings → Printer edits that row, and the **Test print** button runs the same code path as a real print with a short test job, so the connection can be verified before saving.

### Two connection paths

**Windows installed printer (`connection_type: 'system'`)** — discovery comes from Windows:

```
printer:list-system → webContents.getPrintersAsync() → Windows spooler
                    → dropdown lists every printer the OS knows (USB + TCP printers added to Windows)
Print              → receipt rendered as HTML in a hidden window
                    → webContents.print({ deviceName }) — Windows handles fonts, paper and encoding
```

**LAN ESC/POS (`connection_type: 'network'`)** — raw TCP to `<IP>:9100`:

```
Print → escPosBytes(): reset → code page → aligned/wrapped lines → raster logo (GS v 0) → feed → cut
      → sendNetwork(): socket.connect(host, 9100) → write bytes → close
```

There is **no discovery** on this path: a raw port-9100 printer is invisible to Windows. Read its IP from the printer's self-test page (hold Feed while powering on, on most models) and type it in. The Test button reports the exact socket error (timeout, refused, DNS) if it cannot connect.

### Paper width is the only format choice

| Field | 80 mm | 58 mm |
|---|---|---|
| `paperWidthMm` | 80 | 58 |
| `printableWidthMm` | 72 | 50 |
| `characterWidth` | 48 | 32 |

The presets live in `src/shared/paper.js` and are derived on save. Dot density (8 dots/mm), encoding (CP437), cut (on), feed (2 lines) and timeout (5 s) stay in the profile row with fixed defaults — the receipt is plain ASCII so they never need changing, but the columns are kept for printers that do.

### Test print

- **network:** opens the socket, sends a small ESC/POS test receipt, reports bytes sent or the socket error.
- **system:** prints the same test receipt directly to the chosen printer (`silent: true`, no print dialog).
