import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import icon from '../../resources/icon.png?asset'
import { createDatabaseStore, initializeUserData } from './database.js'
import { buildReceiptLines } from '../shared/receipt.js'
import { escPosBytes, sendNetwork } from './printing.js'
import { printSystem } from './system-print.js'

let database
let paths
let mainWindow

function defaultCompany() {
  return {
    name: '',
    address: '',
    phone: '',
    email: '',
    defaultCurrency: 'USD',
    logoPath: null
  }
}

function defaultPrinter() {
  return {
    id: 'default',
    name: 'Counter Printer',
    connectionType: 'system',
    networkHost: '',
    networkPort: 9100,
    systemPrinterName: '',
    paperWidthMm: 80,
    printableWidthMm: 72,
    characterWidth: 48,
    encoding: 'CP437',
    cutAfterPrint: true,
    feedLinesAfterPrint: 2,
    timeoutMs: 5000
  }
}

function localDateParts(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return {
    invoiceDate: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    invoiceTime: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
}

async function withLogoDataUrl(company) {
  if (!company?.logoPath) return { ...defaultCompany(), ...company, logoDataUrl: null }
  try {
    const extension = extname(company.logoPath).toLowerCase()
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif'
    }
    const mime = mimeTypes[extension]
    if (!mime) return { ...company, logoDataUrl: null }
    const data = await readFile(company.logoPath)
    return { ...company, logoDataUrl: `data:${mime};base64,${data.toString('base64')}` }
  } catch {
    return { ...company, logoDataUrl: null }
  }
}

async function listSystemPrinters() {
  if (!mainWindow || mainWindow.isDestroyed()) return []
  const printers = await mainWindow.webContents.getPrintersAsync()
  return printers.map((printer) => ({
    name: printer.name,
    displayName: printer.displayName || printer.name,
    isDefault: Boolean(printer.isDefault)
  }))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (process.env.INVOICE_APP_SMOKE_TEST === '1') {
    mainWindow.webContents.once('did-finish-load', () => {
      // Verify the preload bridge actually exists — a missing preload still loads the page.
      mainWindow.webContents
        .executeJavaScript('typeof window.invoiceApi')
        .then((apiType) => {
          console.log(
            apiType === 'object'
              ? `SMOKE_TEST_OK node=${process.versions.node}`
              : `SMOKE_TEST_FAIL invoiceApi=${apiType}`
          )
        })
        .catch((error) => console.log(`SMOKE_TEST_FAIL ${error.message}`))
        .finally(() => app.quit())
    })
  }
}

function registerIpcHandlers() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    nodeVersion: process.versions.node,
    platform: process.platform,
    databaseVersion: database.getVersion()
  }))

  ipcMain.handle('invoice:bootstrap', async () => {
    const company = await withLogoDataUrl(database.getCompany() || defaultCompany())
    const printer = database.getPrinter('default')
    return {
      company,
      printer,
      ...localDateParts(),
      invoiceNumber: database.nextInvoiceNumber()
    }
  })

  ipcMain.handle('company:get', async () => withLogoDataUrl(database.getCompany() || defaultCompany()))

  ipcMain.handle('company:save', async (_event, values) => {
    const saved = database.saveCompany(values)
    return withLogoDataUrl(saved)
  })

  ipcMain.handle('logo:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose company logo',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePaths[0]) return null

    const source = result.filePaths[0]
    const extension = extname(source).toLowerCase() || '.png'
    const target = join(paths.uploads, `logo-${randomUUID()}${extension}`)
    await copyFile(source, target)
    return withLogoDataUrl({ logoPath: target })
  })

  ipcMain.handle('printer:get', () => database.getPrinter('default') || defaultPrinter())

  ipcMain.handle('printer:save', (_event, values) =>
    database.savePrinter({ ...values, id: 'default' })
  )

  ipcMain.handle('printer:list-system', () => listSystemPrinters())

  ipcMain.handle('invoice:list', () => database.listInvoices())

  ipcMain.handle('invoice:get', (_event, id) => database.getInvoice(id))

  ipcMain.handle('invoice:delete', (_event, id) => ({ deleted: database.deleteInvoice(id) }))

  ipcMain.handle('invoice:print', async (_event, payload) => {
    const saved = database.saveInvoice(payload.invoice, payload.items)
    database.setInvoicePrintStatus(saved.id, 'printing')

    const printer = database.getPrinter('default')
    if (!printer) {
      database.setInvoicePrintStatus(saved.id, 'failed')
      return {
        invoice: database.getInvoice(saved.id),
        print: {
          status: 'failed',
          message: 'Invoice saved, but no printer is configured. Open Settings and choose a printer.'
        }
      }
    }

    const company = database.getCompany() || defaultCompany()
    const lines = buildReceiptLines({ invoice: saved, company, printer })

    try {
      let result
      if (printer.connectionType === 'network') {
        const bytes = escPosBytes(lines, printer.characterWidth, {
          cut: printer.cutAfterPrint,
          feed: printer.feedLinesAfterPrint,
          encoding: printer.encoding
        })
        result = await sendNetwork(printer, bytes)
      } else {
        result = await printSystem(lines, printer)
      }

      database.setInvoicePrintStatus(saved.id, 'succeeded')
      database.addPrintHistory({
        id: randomUUID(),
        invoiceId: saved.id,
        printerId: printer.id,
        printerName: printer.name,
        connectionMethod: printer.connectionType,
        status: 'succeeded'
      })

      return {
        invoice: database.getInvoice(saved.id),
        print: {
          status: 'succeeded',
          message: result.message,
          printerName: printer.name
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      database.setInvoicePrintStatus(saved.id, 'failed')
      database.addPrintHistory({
        id: randomUUID(),
        invoiceId: saved.id,
        printerId: printer.id,
        printerName: printer.name,
        connectionMethod: printer.connectionType,
        status: 'failed',
        errorMessage: message
      })

      return {
        invoice: database.getInvoice(saved.id),
        print: {
          status: 'failed',
          message,
          printerName: printer.name
        }
      }
    }
  })
}

app
  .whenReady()
  .then(() => {
    app.setAppUserModelId('com.invoicegenerator.desktop')
    paths = initializeUserData(app.getPath('userData'))
    database = createDatabaseStore(paths.database)
    registerIpcHandlers()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error) => {
    console.error('APP_START_FAILED', error)
    app.quit()
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  database?.close()
})
