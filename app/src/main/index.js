import { app, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import icon from '../../resources/icon.png?asset'
import { createDatabaseStore, initializeUserData } from './database.js'
import { encodeReceipt, sendReceipt } from './receipt-printing.js'
import { createPrinterTransport, sendBytes } from './printer-transport.js'

let database
let paths
let mainWindow

function defaultCompany() {
  return {
    defaultCurrency: 'USD'
  }
}

function defaultPrinter() {
  return {
    id: 'default',
    name: 'Counter Printer',
    connectionType: 'network',
    networkHost: '',
    networkPort: 9100,
    systemPrinterName: '',
    paperWidthMm: 80,
    printableWidthMm: 72,
    characterWidth: 48,
    dotDensity: 8,
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

  function companyRecord() {
    return database.getCompany() || defaultCompany()
  }

  ipcMain.handle('invoice:bootstrap', async () => {
    const company = companyRecord()
    const printer = database.getPrinter('default')
    return {
      company,
      printer,
      ...localDateParts(),
      invoiceNumber: database.nextInvoiceNumber()
    }
  })

  ipcMain.handle('printer:get', () => database.getPrinter('default') || defaultPrinter())

  ipcMain.handle('printer:save', (_event, values) =>
    database.savePrinter({ ...values, id: 'default' })
  )

  // Runs the same code path as a real print with a short test job, without saving anything. Returns { ok, message } instead of throwing so the notification shows the raw transport error without an IPC prefix.
  ipcMain.handle('printer:test', async (_event, values) => {
    const profile = { ...defaultPrinter(), ...values }
    const testReceipt = {
      subtotal: 0,
      shippingFrom: 'PRINTER TEST',
      invoiceDate: '',
      invoiceTime: '',
      shippingService: `${profile.paperWidthMm} mm paper, ${profile.characterWidth} characters per line`,
      destinationAddress: '',
      packageWeight: '',
      expectedDeliveryDate: '',
      trackingNumber: '',
      currency: 'USD'
    }

    try {
      const bytes = await encodeReceipt(testReceipt, profile)
      const transport = createPrinterTransport(profile)
      await sendBytes(transport, bytes)
      const target =
        profile.connectionType === 'network'
          ? `${profile.networkHost}:${profile.networkPort}`
          : 'USB printer'
      return { ok: true, message: `Sent ${bytes.length} bytes to ${target}.` }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('invoice:list', (_event, options) => database.listInvoices(options))

  ipcMain.handle('invoice:get', (_event, id) => database.getInvoice(id))

  ipcMain.handle('invoice:delete', (_event, id) => ({ deleted: database.deleteInvoice(id) }))

  ipcMain.handle('invoice:print', async (_event, payload) => {
    const saved = database.saveInvoice(payload.invoice, payload.items)
    database.setInvoicePrintStatus(saved.id, 'printing')

    const printer = database.getPrinter('default')
    if (!printer) {
      const message =
        'Receipt saved, but no printer is configured. Open Settings and choose a printer.'
      const fallbackPrinter = defaultPrinter()
      database.recordPrintResult({
        id: randomUUID(),
        invoiceId: saved.id,
        printerId: fallbackPrinter.id,
        printerName: fallbackPrinter.name,
        connectionMethod: fallbackPrinter.connectionType,
        status: 'failed',
        errorMessage: message
      })
      return {
        invoice: database.getInvoice(saved.id),
        print: {
          status: 'failed',
          message
        }
      }
    }

    try {
      // One direct LAN/USB pipeline for every configured printer.
      const result = await sendReceipt(saved, printer)

      database.recordPrintResult({
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
      database.recordPrintResult({
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
    database.failInterruptedPrints()
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
