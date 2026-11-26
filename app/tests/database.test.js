import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { createDatabaseStore, initializeUserData } from '../src/main/database.js'

function createTestStore(t) {
  const root = mkdtempSync(join(tmpdir(), 'invoice-generator-test-'))
  const paths = initializeUserData(root)
  const store = createDatabaseStore(paths.database)
  t.after(() => {
    store.close()
    rmSync(root, { recursive: true, force: true })
  })

  return { root, paths, store }
}

test('initializes user-data paths and applies database migrations', (t) => {
  const { root, paths, store } = createTestStore(t)

  assert.equal(paths.database, join(root, 'database', 'invoices.sqlite'))
  assert.equal(existsSync(paths.database), true)
  assert.equal(existsSync(paths.uploads), true)
  assert.equal(existsSync(paths.backups), true)
  assert.equal(store.getVersion(), 4)
})

test('stores settings, company metadata, and printer profiles', (t) => {
  const { paths, store } = createTestStore(t)

  store.setSetting('defaultPaperWidth', '80')
  assert.equal(store.getSetting('defaultPaperWidth'), '80')

  const company = store.saveCompany({ defaultCurrency: 'usd' })
  assert.equal(company.defaultCurrency, 'USD')
  assert.equal('name' in company, false)
  assert.equal('phone' in company, false)
  assert.equal('email' in company, false)
  assert.equal('address' in company, false)

  const connection = new DatabaseSync(paths.database)
  const columns = connection
    .prepare('PRAGMA table_info(company_metadata)')
    .all()
    .map((column) => column.name)
  connection.close()
  assert.deepEqual(columns, ['id', 'default_currency', 'logo_path', 'created_at', 'updated_at'])

  const printer = store.savePrinter({
    id: 'printer-1',
    name: 'Network Receipt Printer',
    connectionType: 'network',
    networkHost: '192.168.1.50',
    networkPort: 9100,
    paperWidthMm: 80,
    printableWidthMm: 72,
    characterWidth: 48,
    dotDensity: 8,
    encoding: 'CP437'
  })
  assert.equal(printer.networkPort, 9100)
  assert.equal(printer.dotDensity, 8)
  assert.equal(store.getPrinter('printer-1').name, 'Network Receipt Printer')
  assert.equal(store.listPrinters().length, 1)
})

test('validates company currency before saving', (t) => {
  const { store } = createTestStore(t)

  const empty = store.saveCompany({ defaultCurrency: 'USD' })
  assert.equal(empty.defaultCurrency, 'USD')

  // Currency stays required and must be a real ISO 4217 code.
  assert.throws(() => store.saveCompany({}), /Default currency is required/)
  assert.throws(() => store.saveCompany({ defaultCurrency: 'US' }), /ISO 4217/)
  assert.throws(() => store.saveCompany({ defaultCurrency: 'ZZZ' }), /ISO 4217/)

  // created_at survives updates.
  const first = store.saveCompany({ defaultCurrency: 'USD' })
  const second = store.saveCompany({ defaultCurrency: 'EUR' })
  assert.equal(second.defaultCurrency, 'EUR')
  assert.equal(second.createdAt, first.createdAt)
})

test('saves, calculates, updates, lists, and deletes an invoice', (t) => {
  const { store } = createTestStore(t)
  const invoice = {
    id: 'invoice-1',
    invoiceNumber: 'INV-001',
    invoiceDate: '2026-11-17',
    invoiceTime: '10:30',
    customerName: 'Sample Customer',
    currency: 'usd',
    insurance: 250,
    senderName: 'DE MOSS',
    senderStreet: '5800 Corporate Dr',
    senderCity: 'Houston',
    senderState: 'TX',
    senderZip: '77036',
    senderContact: '(800)275-8777',
    destinationCity: 'DANBURY',
    destinationState: 'CT',
    destinationZip: '06810',
    packageWeight: '14 lb 6 oz',
    trackingNumber: '9201990367007536409945'
  }
  const items = [
    {
      id: 'item-1',
      description: 'Delivery service',
      quantityMilli: 1500,
      unitPrice: 1000
    }
  ]

  const saved = store.saveInvoice(invoice, items)
  assert.equal(saved.items[0].lineTotal, 1500)
  assert.equal(saved.subtotal, 1500)
  assert.equal(saved.insurance, 0)
  assert.equal(saved.total, 1500)
  assert.equal(saved.currency, 'USD')
  assert.equal(saved.senderName, 'DE MOSS')
  assert.equal(saved.senderStreet, '5800 Corporate Dr')
  assert.equal(saved.senderCity, 'Houston')
  assert.equal(saved.senderState, 'TX')
  assert.equal(saved.senderZip, '77036')
  assert.equal(saved.senderContact, '(800)275-8777')
  assert.equal(saved.destinationCity, 'DANBURY')
  assert.equal(saved.destinationState, 'CT')
  assert.equal(saved.destinationZip, '06810')
  assert.equal(saved.destinationAddress, 'DANBURY, CT 06810')
  assert.equal(saved.shippingFrom, 'DE MOSS\n5800 Corporate Dr\nHouston\nTX 77036\n(800)275-8777')
  assert.equal(saved.packageWeight, '14 lb 6 oz')
  assert.equal(saved.trackingNumber, '9201990367007536409945')

  const updated = store.saveInvoice({ ...invoice, insurance: 500 }, [
    { ...items[0], quantityMilli: 2000, unitPrice: 1250 }
  ])
  assert.equal(updated.items[0].lineTotal, 2500)
  assert.equal(updated.subtotal, 2500)
  assert.equal(updated.insurance, 0)
  assert.equal(updated.total, 2500)
  assert.equal(store.listInvoices().rows.length, 1)
  assert.equal(store.getInvoice('invoice-1').items.length, 1)

  assert.equal(store.deleteInvoice('invoice-1'), true)
  assert.equal(store.getInvoice('invoice-1'), null)
  assert.equal(store.listInvoices().rows.length, 0)
})

test('paginates and searches saved invoices', (t) => {
  const { store } = createTestStore(t)
  for (let index = 1; index <= 5; index += 1) {
    store.saveInvoice(
      {
        id: `invoice-${index}`,
        invoiceNumber: `INV-00${index}`,
        invoiceDate: '2026-11-17',
        invoiceTime: '10:30',
        currency: 'USD',
        trackingNumber: `92019903670075364099${index}`,
        destinationCity: index === 3 ? 'DANBURY' : 'HOUSTON',
        destinationState: index === 3 ? 'CT' : 'TX',
        destinationZip: index === 3 ? '06810' : '77036'
      },
      [
        {
          id: `item-${index}`,
          description: 'Delivery service',
          quantityMilli: 1000,
          unitPrice: 1000
        }
      ]
    )
  }

  const firstPage = store.listInvoices({ page: 1, pageSize: 2 })
  assert.equal(firstPage.total, 5)
  assert.equal(firstPage.rows.length, 2)

  const lastPage = store.listInvoices({ page: 3, pageSize: 2 })
  assert.equal(lastPage.rows.length, 1)

  const matching = store.listInvoices({ page: 1, pageSize: 15, search: 'danbury' })
  assert.equal(matching.total, 1)
  assert.equal(matching.rows[0].invoiceNumber, 'INV-003')

  const byTracking = store.listInvoices({ search: '920199036700753640994' })
  assert.equal(byTracking.total, 1)
  assert.equal(byTracking.rows[0].invoiceNumber, 'INV-004')
})

test('enforces invoice-number uniqueness and records print history', (t) => {
  const { store } = createTestStore(t)
  const invoice = {
    id: 'invoice-1',
    invoiceNumber: 'INV-001',
    invoiceDate: '2026-11-17',
    invoiceTime: '10:30',
    currency: 'USD'
  }
  const items = [
    {
      id: 'item-1',
      description: 'Delivery service',
      quantityMilli: 1000,
      unitPrice: 1000
    }
  ]

  store.saveInvoice(invoice, items)
  assert.throws(
    () => store.saveInvoice({ ...invoice, id: 'invoice-2' }, [{ ...items[0], id: 'item-2' }]),
    /UNIQUE constraint failed/
  )

  store.addPrintHistory({
    id: 'print-1',
    invoiceId: 'invoice-1',
    printerId: 'printer-1',
    printerName: 'Network Receipt Printer',
    connectionMethod: 'network',
    status: 'succeeded'
  })

  assert.equal(store.listPrintHistory('invoice-1').length, 1)
  assert.equal(store.listPrintHistory('invoice-1')[0].status, 'succeeded')

  store.setInvoicePrintStatus('invoice-1', 'printing')
  assert.throws(
    () =>
      store.recordPrintResult({
        id: 'print-1',
        invoiceId: 'invoice-1',
        printerId: 'printer-1',
        printerName: 'Network Receipt Printer',
        connectionMethod: 'network',
        status: 'failed'
      }),
    /UNIQUE constraint failed/
  )
  assert.equal(store.getInvoice('invoice-1').printStatus, 'printing')
  assert.equal(store.listPrintHistory('invoice-1').length, 1)

  store.recordPrintResult({
    id: 'print-2',
    invoiceId: 'invoice-1',
    printerId: 'printer-1',
    printerName: 'Network Receipt Printer',
    connectionMethod: 'network',
    status: 'failed',
    errorMessage: 'Printer offline'
  })
  assert.equal(store.getInvoice('invoice-1').printStatus, 'failed')
  assert.equal(store.listPrintHistory('invoice-1').length, 2)
  assert.equal(store.listPrintHistory('invoice-1')[0].status, 'failed')
  assert.throws(
    () =>
      store.recordPrintResult({
        id: 'print-3',
        invoiceId: 'invoice-1',
        printerId: 'printer-1',
        printerName: 'Network Receipt Printer',
        connectionMethod: 'network',
        status: 'succeeded'
      }),
    /Invoice must be printing to record a print result/
  )
  assert.equal(store.listPrintHistory('invoice-1').length, 2)
})

test('generates unique invoice numbers and updates print status', (t) => {
  const { store } = createTestStore(t)

  const first = store.nextInvoiceNumber()
  const second = store.nextInvoiceNumber()
  assert.match(first, /^INV-\d{4}-\d{4}$/)
  assert.notEqual(first, second)

  const invoice = {
    id: 'invoice-status',
    invoiceNumber: first,
    invoiceDate: '2026-11-17',
    invoiceTime: '10:30',
    currency: 'USD'
  }
  const items = [
    {
      id: 'item-status',
      description: 'Delivery service',
      quantityMilli: 1000,
      unitPrice: 1000
    }
  ]

  store.saveInvoice(invoice, items)
  assert.throws(
    () => store.setInvoicePrintStatus('invoice-status', 'succeeded'),
    /Invalid invoice print status transition/
  )
  assert.equal(store.setInvoicePrintStatus('invoice-status', 'printing'), true)
  assert.equal(store.getInvoice('invoice-status').printStatus, 'printing')
  assert.equal(store.setInvoicePrintStatus('invoice-status', 'succeeded'), true)
  assert.equal(store.getInvoice('invoice-status').printStatus, 'succeeded')
  assert.throws(
    () => store.setInvoicePrintStatus('invoice-status', 'printed'),
    /Invalid invoice print status/
  )
  assert.throws(
    () => store.setInvoicePrintStatus('invoice-status', 'not_printed'),
    /Invalid invoice print status transition/
  )

  assert.equal(store.setInvoicePrintStatus('invoice-status', 'printing'), true)
  assert.equal(store.failInterruptedPrints(), 1)
  assert.equal(store.getInvoice('invoice-status').printStatus, 'failed')
  assert.throws(
    () => store.setInvoicePrintStatus('invoice-status', 'succeeded'),
    /Invalid invoice print status transition/
  )
  assert.equal(store.setInvoicePrintStatus('invoice-status', 'printing'), true)
  assert.equal(store.setInvoicePrintStatus('invoice-status', 'failed'), true)

  store.deleteInvoice('invoice-status')
  const afterDelete = store.nextInvoiceNumber()
  assert.notEqual(afterDelete, first)
  assert.notEqual(afterDelete, second)
})

test('printer profiles round-trip for network and usb with validation', (t) => {
  const { store } = createTestStore(t)

  const network = store.savePrinter({
    id: 'net-1', name: 'LAN Printer', connectionType: 'network',
    networkHost: '192.168.1.50', networkPort: 9100,
    paperWidthMm: 80, printableWidthMm: 72, characterWidth: 48, dotDensity: 8, encoding: 'CP437'
  })
  assert.equal(network.connectionType, 'network')
  assert.equal(network.networkHost, '192.168.1.50')
  assert.equal(network.networkPort, 9100)
  assert.equal(network.usbVendorId, null)
  assert.equal(network.usbProductId, null)

  const usb = store.savePrinter({
    id: 'usb-1', name: 'USB Printer', connectionType: 'usb',
    usbVendorId: 0x04b8, usbProductId: 0x0123,
    paperWidthMm: 80, printableWidthMm: 72, characterWidth: 48, dotDensity: 8, encoding: 'CP437'
  })
  assert.equal(usb.connectionType, 'usb')
  assert.equal(usb.usbVendorId, 0x04b8)
  assert.equal(usb.usbProductId, 0x0123)

  assert.throws(
    () => store.savePrinter({ id: 'u2', name: 'Bad USB', connectionType: 'usb', paperWidthMm: 80, printableWidthMm: 72, characterWidth: 48 }),
    /USB vendor ID is required/
  )
  assert.throws(
    () => store.savePrinter({ id: 'n2', name: 'Bad Net', connectionType: 'network', paperWidthMm: 80, printableWidthMm: 72, characterWidth: 48 }),
    /Network host is required/
  )
  assert.throws(
    () => store.savePrinter({ id: 's2', name: 'Sys', connectionType: 'system', paperWidthMm: 80, printableWidthMm: 72, characterWidth: 48 }),
    /must be network or usb/
  )
})

test('legacy system printer rows survive migration to version 4', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'invoice-generator-test-'))
  let store
  t.after(() => {
    if (store) store.close()
    rmSync(root, { recursive: true, force: true })
  })
  const dbPath = join(root, 'database', 'invoices.sqlite')
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`CREATE TABLE printer_profiles (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    connection_type TEXT NOT NULL CHECK (connection_type IN ('network', 'system')),
    network_host TEXT, network_port INTEGER, system_printer_name TEXT,
    paper_width_mm REAL NOT NULL, printable_width_mm REAL NOT NULL,
    character_width INTEGER NOT NULL, encoding TEXT NOT NULL DEFAULT 'CP437',
    cut_after_print INTEGER NOT NULL DEFAULT 1, feed_lines_after_print INTEGER NOT NULL DEFAULT 0,
    timeout_ms INTEGER NOT NULL DEFAULT 5000, dot_density REAL NOT NULL DEFAULT 8,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`)
  db.exec(`CREATE TABLE invoices (id TEXT PRIMARY KEY)`)
  db.exec(`CREATE TABLE print_history (
    id TEXT PRIMARY KEY, invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
    printer_id TEXT, printer_name TEXT NOT NULL, connection_method TEXT NOT NULL,
    status TEXT NOT NULL, error_message TEXT, printed_at TEXT NOT NULL)`)
  db.exec("INSERT INTO printer_profiles VALUES ('legacy', 'Old Printer', 'system', NULL, NULL, 'EPSON TM-T88', 80, 72, 48, 'CP437', 1, 0, 5000, 8, '2026-01-01', '2026-01-01')")
  db.exec('PRAGMA user_version = 3')
  db.close()

  const paths = initializeUserData(root)
  store = createDatabaseStore(paths.database)

  assert.equal(store.getVersion(), 4, 'database migrated to version 4')
  const printer = store.getPrinter('legacy')
  assert.ok(printer, 'legacy system printer row preserved')
  assert.equal(printer.connectionType, 'system', 'legacy connection type preserved')
  assert.equal(printer.systemPrinterName, 'EPSON TM-T88')
})
