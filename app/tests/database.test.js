import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  assert.equal(store.getVersion(), 2)
})

test('stores settings, company metadata, and printer profiles', (t) => {
  const { store } = createTestStore(t)

  store.setSetting('defaultPaperWidth', '80')
  assert.equal(store.getSetting('defaultPaperWidth'), '80')

  const company = store.saveCompany({
    name: 'Example Company',
    address: '10 Main Street',
    phone: '555-0100',
    email: 'hello@example.com',
    defaultCurrency: 'usd'
  })
  assert.equal(company.defaultCurrency, 'USD')
  assert.equal(store.getCompany().name, 'Example Company')

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

test('validates and hardens company settings before saving', (t) => {
  const { root, store } = createTestStore(t)

  // Everything except the currency is optional.
  const empty = store.saveCompany({ defaultCurrency: 'USD' })
  assert.equal(empty.name, '')
  assert.equal(empty.logoPath, null)

  // Currency stays required and must be a real ISO 4217 code.
  assert.throws(() => store.saveCompany({}), /Default currency is required/)
  assert.throws(() => store.saveCompany({ defaultCurrency: 'US' }), /ISO 4217/)
  assert.throws(() => store.saveCompany({ defaultCurrency: 'ZZZ' }), /ISO 4217/)

  // Field limits, formats, and character safety.
  assert.throws(
    () => store.saveCompany({ defaultCurrency: 'USD', name: 'x'.repeat(121) }),
    /120 characters/
  )
  assert.throws(
    () => store.saveCompany({ defaultCurrency: 'USD', email: 'not-an-email' }),
    /valid email/
  )
  assert.throws(
    () => store.saveCompany({ defaultCurrency: 'USD', name: 'bad\u0000name' }),
    /invalid characters/
  )

  // Logo path safety: shape first, then existence.
  assert.throws(
    () => store.saveCompany({ defaultCurrency: 'USD', logoPath: 'relative/logo.png' }),
    /absolute path/
  )
  assert.throws(
    () => store.saveCompany({ defaultCurrency: 'USD', logoPath: 'C:/temp/logo.txt' }),
    /PNG, JPG/
  )
  assert.throws(
    () => store.saveCompany({ defaultCurrency: 'USD', logoPath: join(root, 'missing.png') }),
    /no longer exists/
  )
  const logoFile = join(root, 'logo.png')
  writeFileSync(logoFile, 'png')
  const withLogo = store.saveCompany({ defaultCurrency: 'USD', logoPath: logoFile })
  assert.equal(withLogo.logoPath, logoFile)

  // created_at survives updates.
  const first = store.saveCompany({ defaultCurrency: 'USD', name: 'First' })
  const second = store.saveCompany({ defaultCurrency: 'USD', name: 'Second' })
  assert.equal(second.name, 'Second')
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
    shippingFrom: 'DE MOSS\nDE 5800 Corporate Dr Houston',
    insuranceLabel: 'Up to $100.00 included',
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
  assert.equal(saved.total, 1750)
  assert.equal(saved.currency, 'USD')
  assert.equal(saved.shippingFrom, 'DE MOSS\nDE 5800 Corporate Dr Houston')
  assert.equal(saved.insuranceLabel, 'Up to $100.00 included')
  assert.equal(saved.trackingNumber, '9201990367007536409945')

  const updated = store.saveInvoice({ ...invoice, insurance: 500 }, [
    { ...items[0], quantityMilli: 2000, unitPrice: 1250 }
  ])
  assert.equal(updated.items[0].lineTotal, 2500)
  assert.equal(updated.subtotal, 2500)
  assert.equal(updated.total, 3000)
  assert.equal(store.listInvoices().length, 1)
  assert.equal(store.getInvoice('invoice-1').items.length, 1)

  assert.equal(store.deleteInvoice('invoice-1'), true)
  assert.equal(store.getInvoice('invoice-1'), null)
  assert.equal(store.listInvoices().length, 0)
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
  assert.equal(store.setInvoicePrintStatus('invoice-status', 'printing'), true)
  assert.equal(store.getInvoice('invoice-status').printStatus, 'printing')
  assert.equal(store.setInvoicePrintStatus('invoice-status', 'succeeded'), true)
  assert.equal(store.getInvoice('invoice-status').printStatus, 'succeeded')
  assert.throws(() => store.setInvoicePrintStatus('invoice-status', 'printed'), /Invalid invoice print status/)

  store.deleteInvoice('invoice-status')
  const afterDelete = store.nextInvoiceNumber()
  assert.notEqual(afterDelete, first)
  assert.notEqual(afterDelete, second)
})
