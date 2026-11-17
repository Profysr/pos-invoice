// ============================================================
// MOCK DATA — replaceable with real IPC data (window.invoiceApi).
// Mock only: the backend agent swaps these values for SQLite-backed
// IPC calls. Do not import mock data from production pages after
// the persistence card lands.
// ============================================================

export const mockCompanyMetadata = {
  name: 'Ahmad Traders',
  address: 'Shop 12, Plaza Market, Lahore, Pakistan',
  phone: '+92 300 1234567',
  email: 'billing@ahmadtraders.example',
  taxNumber: 'NTN-1234567-8',
  logoText: 'Logo not configured'
}

export const mockPrinterSettings = {
  profileName: 'Counter Printer',
  connectionType: 'usb',
  paperWidth: '80mm',
  characterSet: 'CP437',
  encoding: 'escpos'
}

export const mockInvoices = [
  {
    id: 1,
    number: 'INV-2026-001',
    date: '2026-11-15',
    customer: 'Bilal Ahmad',
    itemCount: 3,
    total: 15400,
    printStatus: 'printed'
  },
  {
    id: 2,
    number: 'INV-2026-002',
    date: '2026-11-16',
    customer: 'Fatima Store',
    itemCount: 2,
    total: 8250,
    printStatus: 'not-printed'
  },
  {
    id: 3,
    number: 'INV-2026-003',
    date: '2026-11-17',
    customer: 'Kamran Electronics',
    itemCount: 5,
    total: 47250,
    printStatus: 'printed'
  }
]

// --- Mock-only additions (New Invoice card) -------------------------------

// Draft invoice form initial values. The backend agent replaces this with a
// "next invoice number + current date/time" IPC call.
export const mockDraftInvoice = {
  customerName: '',
  customerPhone: '',
  customerAddress: '',
  invoiceNumber: 'INV-2026-004',
  invoiceDate: '2026-11-17',
  invoiceTime: '10:30',
  notes: '',
  items: [
    { id: 'row-1', description: 'LED bulb 12W', qty: '4', unitPrice: '450.00' },
    { id: 'row-2', description: 'Extension cord 3m', qty: '1', unitPrice: '1250.00' }
  ]
}

// Mock-only display helper: renders a line total for the preview column.
// The parent/backend owns the canonical calculation in integer minor units.
export const mockLineTotalDisplay = (row) => {
  const qty = Number(row.qty)
  const price = Number(row.unitPrice)
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return '—'
  return (qty * price).toFixed(2)
}

// Mock-only receipt line builder: once the shared receipt formatter lands,
// the parent/backend produces canonical receiptLines. Each entry is a plain
// string or { text, align, bold }, per the architecture contract.
export const mockReceiptLines = ({ values, rows, lineTotals, company }) => {
  const dash = '-'.repeat(32)
  return [
    { text: company.name, align: 'center', bold: true },
    { text: company.address, align: 'center' },
    { text: `Tel: ${company.phone}`, align: 'center' },
    '',
    { text: `Invoice: ${values.invoiceNumber || '—'}`, align: 'left' },
    {
      text: `Date: ${[values.invoiceDate, values.invoiceTime].filter(Boolean).join(' ') || '—'}`,
      align: 'left'
    },
    { text: `Customer: ${values.customerName || '—'}`, align: 'left' },
    dash,
    ...rows.map((row) => ({
      text: `${(row.description || '—').slice(0, 24)}  x${row.qty || '0'}`,
      align: 'left'
    })),
    dash,
    ...lineTotals.map((total, index) => ({
      text: `Item ${index + 1} total        ${total}`,
      align: 'right'
    })),
    dash,
    { text: 'Thank you for your business', align: 'center', bold: true }
  ]
}
