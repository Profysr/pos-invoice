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
