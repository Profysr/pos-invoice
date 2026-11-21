import { mkdirSync, statSync } from 'node:fs'
import { dirname, extname, isAbsolute, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DEFAULT_PAGE_SIZE = 15
const INVOICE_PRINT_STATUSES = ['not_printed', 'queued', 'printing', 'succeeded', 'failed']
const INVOICE_PRINT_TRANSITIONS = {
  not_printed: ['queued', 'printing'],
  queued: ['printing', 'failed'],
  printing: ['succeeded', 'failed'],
  succeeded: ['printing'],
  failed: ['printing']
}

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE company_metadata (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        default_currency TEXT NOT NULL DEFAULT 'USD',
        logo_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE printer_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        connection_type TEXT NOT NULL CHECK (connection_type IN ('network', 'system')),
        network_host TEXT,
        network_port INTEGER CHECK (network_port BETWEEN 1 AND 65535),
        system_printer_name TEXT,
        paper_width_mm REAL NOT NULL,
        printable_width_mm REAL NOT NULL,
        character_width INTEGER NOT NULL,
        encoding TEXT NOT NULL DEFAULT 'CP437',
        cut_after_print INTEGER NOT NULL DEFAULT 1 CHECK (cut_after_print IN (0, 1)),
        feed_lines_after_print INTEGER NOT NULL DEFAULT 0 CHECK (feed_lines_after_print >= 0),
        timeout_ms INTEGER NOT NULL DEFAULT 5000 CHECK (timeout_ms >= 100),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE invoices (
        id TEXT PRIMARY KEY,
        invoice_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
        invoice_date TEXT NOT NULL,
        invoice_time TEXT NOT NULL,
        customer_name TEXT NOT NULL DEFAULT '',
        customer_phone TEXT NOT NULL DEFAULT '',
        customer_email TEXT NOT NULL DEFAULT '',
        customer_address TEXT NOT NULL DEFAULT '',
        currency TEXT NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),
        subtotal INTEGER NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
        insurance INTEGER NOT NULL DEFAULT 0 CHECK (insurance >= 0),
        total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
        shipping_service TEXT NOT NULL DEFAULT '',
        destination_city TEXT NOT NULL DEFAULT '',
        destination_state TEXT NOT NULL DEFAULT '',
        destination_zip TEXT NOT NULL DEFAULT '',
        package_weight TEXT NOT NULL DEFAULT '',
        expected_delivery_date TEXT,
        tracking_number TEXT NOT NULL DEFAULT '',
        sender_name TEXT NOT NULL DEFAULT '',
        sender_street TEXT NOT NULL DEFAULT '',
        sender_city TEXT NOT NULL DEFAULT '',
        sender_state TEXT NOT NULL DEFAULT '',
        sender_zip TEXT NOT NULL DEFAULT '',
        sender_contact TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        print_status TEXT NOT NULL DEFAULT 'not_printed'
          CHECK (print_status IN ('not_printed', 'queued', 'printing', 'succeeded', 'failed')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE invoice_items (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        description TEXT NOT NULL,
        quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
        unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
        line_total INTEGER NOT NULL CHECK (line_total >= 0),
        UNIQUE (invoice_id, position)
      );

      CREATE TABLE print_history (
        id TEXT PRIMARY KEY,
        invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
        printer_id TEXT,
        printer_name TEXT NOT NULL,
        connection_method TEXT NOT NULL CHECK (connection_method IN ('network', 'system')),
        status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
        error_message TEXT,
        printed_at TEXT NOT NULL
      );

      CREATE INDEX invoices_created_at_idx ON invoices(created_at DESC);
      CREATE INDEX invoice_items_invoice_id_idx ON invoice_items(invoice_id);
      CREATE INDEX print_history_invoice_id_idx ON print_history(invoice_id);
    `
  },
  {
    version: 2,
    sql: `
      ALTER TABLE invoices ADD COLUMN insurance_label TEXT NOT NULL DEFAULT '';
      ALTER TABLE printer_profiles ADD COLUMN dot_density REAL NOT NULL DEFAULT 8;

      -- The shipping receipt is the only template now, so the old invoice rows go.
      DELETE FROM invoice_items;
      DELETE FROM print_history;
      DELETE FROM invoices;
    `
  },
  {
    version: 3,
    sql: `
      CREATE TABLE company_metadata_v3 (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        default_currency TEXT NOT NULL DEFAULT 'USD',
        logo_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO company_metadata_v3 (id, default_currency, logo_path, created_at, updated_at)
      SELECT id, default_currency, logo_path, created_at, updated_at
      FROM company_metadata;

      DROP TABLE company_metadata;
      ALTER TABLE company_metadata_v3 RENAME TO company_metadata;
    `
  }
]

function now() {
  return new Date().toISOString()
}

function requiredText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} is required`)
  }
  return value.trim()
}

function updateInvoicePrintStatus(
  database,
  invoiceId,
  status,
  timestamp = now(),
  requiredStatus = null
) {
  if (!INVOICE_PRINT_STATUSES.includes(status)) {
    throw new Error('Invalid invoice print status')
  }

  const current = database
    .prepare('SELECT print_status FROM invoices WHERE id = ?')
    .get(invoiceId)?.print_status
  if (!current) return false
  if (requiredStatus && current !== requiredStatus) {
    throw new Error(`Invoice must be ${requiredStatus} to record a print result`)
  }
  if (current !== status && !INVOICE_PRINT_TRANSITIONS[current]?.includes(status)) {
    throw new Error(`Invalid invoice print status transition: ${current} -> ${status}`)
  }

  return (
    database
      .prepare(
        `UPDATE invoices SET print_status = ?, updated_at = ?
         WHERE id = ? AND print_status = ?`
      )
      .run(status, timestamp, invoiceId, current).changes > 0
  )
}

function optionalText(value, field) {
  if (value == null) return ''
  if (typeof value !== 'string') throw new Error(`${field} must be text`)
  return value.trim()
}

// ISO 4217 codes known to the runtime (ICU); no extra dependency needed.
const ISO_4217 =
  typeof Intl.supportedValuesOf === 'function'
    ? new Set(Intl.supportedValuesOf('currency'))
    : new Set()
const LOGO_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

// Absolute path to an existing image file; rejects null bytes and stale references.
function optionalLogoPath(value, field) {
  if (value == null || value === '') return null
  const path = optionalText(value, field)
  if (path.includes('\0') || path.length > 1024) {
    throw new Error(`${field} is not a valid file path`)
  }
  if (!isAbsolute(path)) throw new Error(`${field} must be an absolute path`)
  if (!LOGO_EXTENSIONS.has(extname(path).toLowerCase())) {
    throw new Error(`${field} must be a PNG, JPG, WEBP or GIF image`)
  }
  let stats
  try {
    stats = statSync(path)
  } catch {
    throw new Error(`${field} no longer exists — choose the logo again`)
  }
  if (!stats.isFile()) throw new Error(`${field} must point to a file`)
  return path
}

function nonNegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`)
  }
  return value
}

function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`)
  }
  return value
}

function positiveNumber(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive number`)
  }
  return value
}

function transaction(database, operation) {
  database.exec('BEGIN')
  try {
    const result = operation()
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

export function createUserDataPaths(userDataPath) {
  return {
    database: join(userDataPath, 'database', 'invoices.sqlite'),
    uploads: join(userDataPath, 'uploads'),
    backups: join(userDataPath, 'backups')
  }
}

export function initializeUserData(userDataPath) {
  const paths = createUserDataPaths(userDataPath)
  mkdirSync(dirname(paths.database), { recursive: true })
  mkdirSync(paths.uploads, { recursive: true })
  mkdirSync(paths.backups, { recursive: true })
  return paths
}

export function openDatabase(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true })
  const database = new DatabaseSync(databasePath)
  database.exec('PRAGMA foreign_keys = ON')

  try {
    const current = Number(database.prepare('PRAGMA user_version').get().user_version)
    for (const migration of migrations) {
      if (migration.version <= current) continue
      transaction(database, () => {
        database.exec(migration.sql)
        database.exec(`PRAGMA user_version = ${migration.version}`)
      })
    }
  } catch (error) {
    database.close()
    throw error
  }

  return database
}

function mapCompany(row) {
  if (!row) return null
  return {
    defaultCurrency: row.default_currency,
    logoPath: row.logo_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapPrinter(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    connectionType: row.connection_type,
    networkHost: row.network_host,
    networkPort: row.network_port,
    systemPrinterName: row.system_printer_name,
    paperWidthMm: row.paper_width_mm,
    printableWidthMm: row.printable_width_mm,
    characterWidth: row.character_width,
    dotDensity: row.dot_density ?? 8,
    encoding: row.encoding,
    cutAfterPrint: Boolean(row.cut_after_print),
    feedLinesAfterPrint: row.feed_lines_after_print,
    timeoutMs: row.timeout_ms,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapInvoice(row, items = []) {
  if (!row) return null
  const destinationAddress = [
    row.destination_city,
    [row.destination_state, row.destination_zip].filter(Boolean).join(' ')
  ]
    .filter(Boolean)
    .join(', ')
  const shippingFrom = [
    row.sender_name,
    row.sender_street,
    row.sender_city,
    [row.sender_state, row.sender_zip].filter(Boolean).join(' '),
    row.sender_contact
  ]
    .filter(Boolean)
    .join('\n')

  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    invoiceTime: row.invoice_time,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    customerAddress: row.customer_address,
    currency: row.currency,
    subtotal: row.subtotal,
    insurance: row.insurance,
    total: row.total,
    shippingService: row.shipping_service,
    destinationCity: row.destination_city,
    destinationState: row.destination_state,
    destinationZip: row.destination_zip,
    destinationAddress,
    packageWeight: row.package_weight,
    expectedDeliveryDate: row.expected_delivery_date,
    trackingNumber: row.tracking_number,
    senderName: row.sender_name,
    senderStreet: row.sender_street,
    senderCity: row.sender_city,
    senderState: row.sender_state,
    senderZip: row.sender_zip,
    senderContact: row.sender_contact,
    shippingFrom,
    insuranceLabel: row.insurance_label || '',
    notes: row.notes,
    printStatus: row.print_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.map((item) => ({
      id: item.id,
      position: item.position,
      description: item.description,
      quantityMilli: item.quantity_milli,
      unitPrice: item.unit_price,
      lineTotal: item.line_total
    }))
  }
}

export function createDatabaseStore(databasePath) {
  const database = openDatabase(databasePath)

  const store = {
    getVersion() {
      return Number(database.prepare('PRAGMA user_version').get().user_version)
    },

    getSetting(key) {
      const row = database.prepare('SELECT value FROM settings WHERE key = ?').get(key)
      return row?.value ?? null
    },

    setSetting(key, value) {
      requiredText(key, 'Setting key')
      if (typeof value !== 'string') throw new Error('Setting value must be text')
      database
        .prepare(
          `INSERT INTO settings (key, value, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        )
        .run(key, value, now())
    },

    nextInvoiceNumber() {
      const year = new Date().getFullYear()
      const key = `invoiceNumberSequence:${year}`
      const next = Number(store.getSetting(key) || 0) + 1
      store.setSetting(key, String(next))
      return `INV-${year}-${String(next).padStart(4, '0')}`
    },

    getCompany() {
      return mapCompany(database.prepare('SELECT * FROM company_metadata WHERE id = 1').get())
    },

    saveCompany(input) {
      const defaultCurrency = requiredText(input?.defaultCurrency, 'Default currency').toUpperCase()
      const unknownCurrency =
        ISO_4217.size > 0 ? !ISO_4217.has(defaultCurrency) : !/^[A-Z]{3}$/.test(defaultCurrency)
      if (unknownCurrency) {
        throw new Error(`${defaultCurrency} is not a valid ISO 4217 currency code`)
      }
      const logoPath = optionalLogoPath(input?.logoPath, 'Logo path')
      const timestamp = now()
      const existing = store.getCompany()

      // created_at is set on first insert only; the UPDATE below never touches
      // it, so the original creation time survives every update.
      database
        .prepare(
          `INSERT INTO company_metadata
             (id, default_currency, logo_path, created_at, updated_at)
           VALUES (1, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             default_currency = excluded.default_currency,
             logo_path = excluded.logo_path,
             updated_at = excluded.updated_at`
        )
        .run(defaultCurrency, logoPath, existing?.createdAt ?? timestamp, timestamp)

      return store.getCompany()
    },

    listPrinters() {
      return database
        .prepare('SELECT * FROM printer_profiles ORDER BY created_at DESC')
        .all()
        .map(mapPrinter)
    },

    getPrinter(id) {
      return mapPrinter(database.prepare('SELECT * FROM printer_profiles WHERE id = ?').get(id))
    },

    savePrinter(input) {
      const id = requiredText(input?.id, 'Printer id')
      const name = requiredText(input?.name, 'Printer name')
      const connectionType = requiredText(input?.connectionType, 'Printer connection type')
      if (!['network', 'system'].includes(connectionType)) {
        throw new Error('Printer connection type must be network or system')
      }
      const networkHost = optionalText(input?.networkHost, 'Network host')
      const networkPort = input?.networkPort ?? 9100
      const systemPrinterName = optionalText(input?.systemPrinterName, 'System printer name')
      if (connectionType === 'network' && !networkHost) {
        throw new Error('Network host is required')
      }
      if (connectionType === 'system' && !systemPrinterName) {
        throw new Error('System printer name is required')
      }
      if (!Number.isInteger(networkPort) || networkPort < 1 || networkPort > 65535) {
        throw new Error('Network port must be between 1 and 65535')
      }
      const paperWidthMm = positiveNumber(input?.paperWidthMm, 'Paper width')
      const printableWidthMm = positiveNumber(input?.printableWidthMm, 'Printable width')
      const characterWidth = positiveInteger(input?.characterWidth, 'Character width')
      const dotDensity = Number(input?.dotDensity) || 8
      if (dotDensity < 4 || dotDensity > 16) {
        throw new Error('Dot density must be between 4 and 16 dots per millimetre')
      }
      const encoding = requiredText(input?.encoding ?? 'CP437', 'Printer encoding')
      const cutAfterPrint = input?.cutAfterPrint ?? true
      const feedLinesAfterPrint = input?.feedLinesAfterPrint ?? 0
      const timeoutMs = input?.timeoutMs ?? 5000
      if (typeof cutAfterPrint !== 'boolean')
        throw new Error('Cut after print must be true or false')
      if (!Number.isInteger(feedLinesAfterPrint) || feedLinesAfterPrint < 0) {
        throw new Error('Feed lines must be a non-negative integer')
      }
      if (!Number.isInteger(timeoutMs) || timeoutMs < 100) {
        throw new Error('Printer timeout must be at least 100 milliseconds')
      }
      const timestamp = now()
      const existing = store.getPrinter(id)

      database
        .prepare(
          `INSERT INTO printer_profiles
             (id, name, connection_type, network_host, network_port, system_printer_name,
              paper_width_mm, printable_width_mm, character_width, dot_density, encoding,
              cut_after_print, feed_lines_after_print, timeout_ms, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             connection_type = excluded.connection_type,
             network_host = excluded.network_host,
             network_port = excluded.network_port,
             system_printer_name = excluded.system_printer_name,
             paper_width_mm = excluded.paper_width_mm,
             printable_width_mm = excluded.printable_width_mm,
             character_width = excluded.character_width,
             dot_density = excluded.dot_density,
             encoding = excluded.encoding,
             cut_after_print = excluded.cut_after_print,
             feed_lines_after_print = excluded.feed_lines_after_print,
             timeout_ms = excluded.timeout_ms,
             updated_at = excluded.updated_at`
        )
        .run(
          id,
          name,
          connectionType,
          connectionType === 'network' ? networkHost : null,
          connectionType === 'network' ? networkPort : null,
          connectionType === 'system' ? systemPrinterName : null,
          paperWidthMm,
          printableWidthMm,
          characterWidth,
          dotDensity,
          encoding,
          cutAfterPrint ? 1 : 0,
          feedLinesAfterPrint,
          timeoutMs,
          existing?.createdAt ?? timestamp,
          timestamp
        )

      return store.getPrinter(id)
    },

    listInvoices({ page = 1, pageSize = DEFAULT_PAGE_SIZE, search = '' } = {}) {
      const limit = Math.min(Math.max(Number(pageSize) || DEFAULT_PAGE_SIZE, 1), 100)
      const offset = (Math.max(Number(page) || 1, 1) - 1) * limit
      const query = String(search ?? '').trim()
      const filter = query
        ? 'WHERE instr(lower(invoice_number), lower(?)) > 0 OR instr(lower(tracking_number), lower(?)) > 0 OR instr(lower(destination_city), lower(?)) > 0 OR instr(lower(destination_state), lower(?)) > 0 OR instr(lower(destination_zip), lower(?)) > 0'
        : ''
      const params = query ? [query, query, query, query, query] : []
      const total = database
        .prepare(`SELECT COUNT(*) AS count FROM invoices ${filter}`)
        .get(...params).count
      const rows = database
        .prepare(`SELECT * FROM invoices ${filter} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset)
      return { rows: rows.map((row) => mapInvoice(row)), total }
    },

    getInvoice(id) {
      const row = database.prepare('SELECT * FROM invoices WHERE id = ?').get(id)
      if (!row) return null
      const items = database
        .prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position')
        .all(id)
      return mapInvoice(row, items)
    },

    saveInvoice(input, items) {
      const id = requiredText(input?.id, 'Invoice id')
      const invoiceNumber = requiredText(input?.invoiceNumber, 'Invoice number')
      const invoiceDate = requiredText(input?.invoiceDate, 'Invoice date')
      const invoiceTime = requiredText(input?.invoiceTime, 'Invoice time')
      const currency = requiredText(input?.currency ?? 'USD', 'Invoice currency').toUpperCase()
      if (currency.length !== 3) throw new Error('Invoice currency must have three letters')
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Invoice must contain at least one line item')
      }

      const normalizedItems = items.map((item, position) => {
        const itemId = requiredText(item?.id, 'Line item id')
        const description = requiredText(item?.description, 'Line item description')
        const quantityMilli = positiveInteger(item?.quantityMilli, 'Line item quantity')
        const unitPrice = nonNegativeInteger(item?.unitPrice, 'Line item unit price')
        const lineTotal = Math.round((quantityMilli * unitPrice) / 1000)
        return { id: itemId, position, description, quantityMilli, unitPrice, lineTotal }
      })
      const subtotal = normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0)
      const insurance = 0
      const total = subtotal
      const existing = store.getInvoice(id)
      const timestamp = now()

      transaction(database, () => {
        database
          .prepare(
            `INSERT INTO invoices
               (id, invoice_number, invoice_date, invoice_time, customer_name, customer_phone,
                customer_email, customer_address, currency, subtotal, insurance, total,
                shipping_service, destination_city, destination_state, destination_zip,
                package_weight, expected_delivery_date, tracking_number,
                sender_name, sender_street, sender_city, sender_state, sender_zip, sender_contact,
                insurance_label, notes, print_status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?,
                     ?, ?, ?, ?, ?,
                     ?, ?, ?, ?, ?,
                     ?, ?, ?, ?, ?,
                     ?, ?, ?, ?, ?,
                     ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               invoice_number = excluded.invoice_number,
               invoice_date = excluded.invoice_date,
               invoice_time = excluded.invoice_time,
               customer_name = excluded.customer_name,
               customer_phone = excluded.customer_phone,
               customer_email = excluded.customer_email,
               customer_address = excluded.customer_address,
               currency = excluded.currency,
               subtotal = excluded.subtotal,
               insurance = excluded.insurance,
               total = excluded.total,
               shipping_service = excluded.shipping_service,
               destination_city = excluded.destination_city,
               destination_state = excluded.destination_state,
               destination_zip = excluded.destination_zip,
               package_weight = excluded.package_weight,
               expected_delivery_date = excluded.expected_delivery_date,
               tracking_number = excluded.tracking_number,
               sender_name = excluded.sender_name,
               sender_street = excluded.sender_street,
               sender_city = excluded.sender_city,
               sender_state = excluded.sender_state,
               sender_zip = excluded.sender_zip,
               sender_contact = excluded.sender_contact,
               insurance_label = excluded.insurance_label,
               notes = excluded.notes,
               print_status = excluded.print_status,
               updated_at = excluded.updated_at`
          )
          .run(
            id,
            invoiceNumber,
            invoiceDate,
            invoiceTime,
            optionalText(input?.customerName, 'Customer name'),
            optionalText(input?.customerPhone, 'Customer phone'),
            optionalText(input?.customerEmail, 'Customer email'),
            optionalText(input?.customerAddress, 'Customer address'),
            currency,
            subtotal,
            insurance,
            total,
            optionalText(input?.shippingService, 'Shipping service'),
            optionalText(input?.destinationCity, 'Destination city'),
            optionalText(input?.destinationState, 'Destination state'),
            optionalText(input?.destinationZip, 'Destination ZIP'),
            optionalText(input?.packageWeight, 'Package weight'),
            input?.expectedDeliveryDate
              ? optionalText(input.expectedDeliveryDate, 'Expected delivery date')
              : null,
            optionalText(input?.trackingNumber, 'Tracking number'),
            optionalText(input?.senderName, 'Sender name'),
            optionalText(input?.senderStreet, 'Sender street'),
            optionalText(input?.senderCity, 'Sender city'),
            optionalText(input?.senderState, 'Sender state'),
            optionalText(input?.senderZip, 'Sender ZIP'),
            optionalText(input?.senderContact, 'Sender contact'),
            optionalText(input?.insuranceLabel, 'Insurance label'),
            optionalText(input?.notes, 'Invoice notes'),
            existing?.printStatus ?? 'not_printed',
            existing?.createdAt ?? timestamp,
            timestamp
          )

        database.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id)
        const insertItem = database.prepare(
          `INSERT INTO invoice_items
             (id, invoice_id, position, description, quantity_milli, unit_price, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        for (const item of normalizedItems) {
          insertItem.run(
            item.id,
            id,
            item.position,
            item.description,
            item.quantityMilli,
            item.unitPrice,
            item.lineTotal
          )
        }
      })

      return store.getInvoice(id)
    },

    deleteInvoice(id) {
      return database.prepare('DELETE FROM invoices WHERE id = ?').run(id).changes > 0
    },

    setInvoicePrintStatus(id, status) {
      const invoiceId = requiredText(id, 'Invoice id')
      return updateInvoicePrintStatus(database, invoiceId, status)
    },

    failInterruptedPrints() {
      return database
        .prepare(
          `UPDATE invoices SET print_status = 'failed', updated_at = ?
             WHERE print_status = 'printing'`
        )
        .run(now()).changes
    },

    addPrintHistory(input) {
      const id = requiredText(input?.id, 'Print history id')
      const invoiceId = input?.invoiceId ? requiredText(input.invoiceId, 'Invoice id') : null
      const printerId = input?.printerId ? optionalText(input.printerId, 'Printer id') : null
      const printerName = requiredText(input?.printerName, 'Printer name')
      const connectionMethod = requiredText(input?.connectionMethod, 'Connection method')
      if (!['network', 'system'].includes(connectionMethod)) {
        throw new Error('Connection method must be network or system')
      }
      const status = requiredText(input?.status, 'Print status')
      if (!['succeeded', 'failed'].includes(status)) {
        throw new Error('Print status must be succeeded or failed')
      }
      const errorMessage = input?.errorMessage
        ? optionalText(input.errorMessage, 'Error message')
        : null
      const printedAt = now()

      database
        .prepare(
          `INSERT INTO print_history
             (id, invoice_id, printer_id, printer_name, connection_method, status, error_message, printed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          invoiceId,
          printerId,
          printerName,
          connectionMethod,
          status,
          errorMessage,
          printedAt
        )

      return {
        id,
        invoiceId,
        printerId,
        printerName,
        connectionMethod,
        status,
        errorMessage,
        printedAt
      }
    },

    recordPrintResult(input) {
      const id = requiredText(input?.id, 'Print history id')
      const invoiceId = requiredText(input?.invoiceId, 'Invoice id')
      const printerId = input?.printerId ? optionalText(input.printerId, 'Printer id') : null
      const printerName = requiredText(input?.printerName, 'Printer name')
      const connectionMethod = requiredText(input?.connectionMethod, 'Connection method')
      if (!['network', 'system'].includes(connectionMethod)) {
        throw new Error('Connection method must be network or system')
      }
      const status = requiredText(input?.status, 'Print status')
      if (!['succeeded', 'failed'].includes(status)) {
        throw new Error('Print status must be succeeded or failed')
      }
      const errorMessage = input?.errorMessage
        ? optionalText(input.errorMessage, 'Error message')
        : null
      const printedAt = now()

      transaction(database, () => {
        if (!updateInvoicePrintStatus(database, invoiceId, status, printedAt, 'printing')) {
          throw new Error('Invoice not found')
        }
        database
          .prepare(
            `INSERT INTO print_history
               (id, invoice_id, printer_id, printer_name, connection_method, status, error_message, printed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            id,
            invoiceId,
            printerId,
            printerName,
            connectionMethod,
            status,
            errorMessage,
            printedAt
          )
      })

      return {
        id,
        invoiceId,
        printerId,
        printerName,
        connectionMethod,
        status,
        errorMessage,
        printedAt
      }
    },

    listPrintHistory(invoiceId) {
      const rows = invoiceId
        ? database
            .prepare('SELECT * FROM print_history WHERE invoice_id = ? ORDER BY printed_at DESC')
            .all(invoiceId)
        : database.prepare('SELECT * FROM print_history ORDER BY printed_at DESC').all()
      return rows.map((row) => ({
        id: row.id,
        invoiceId: row.invoice_id,
        printerId: row.printer_id,
        printerName: row.printer_name,
        connectionMethod: row.connection_method,
        status: row.status,
        errorMessage: row.error_message,
        printedAt: row.printed_at
      }))
    },

    close() {
      database.close()
    }
  }

  return store
}
