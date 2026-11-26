import assert from 'node:assert/strict'
import net from 'node:net'
import test from 'node:test'
import { NetTransport, encodeEscPos, profiles } from 'retail-print-kit'
import { UsbTransport } from 'retail-print-kit/usb'
import { FakeTransport } from '../tests/helpers/fake-transport.js'
import { makeReceiptData } from '../src/shared/invoice.js'
import {
  encodeReceipt,
  sendReceipt
} from '../src/main/receipt-printing.js'
import { createPrinterTransport, listUsbPrinters, sendBytes } from '../src/main/printer-transport.js'

const receipt = {
  senderName: 'DE MOSS',
  senderStreet: '5800 Corporate Dr',
  senderCity: 'Houston',
  senderState: 'TX',
  senderZip: '77036',
  invoiceDate: '2026-08-10',
  invoiceTime: '18:06',
  trackingNumber: '9201990367007536409945',
  subtotal: 6522,
  shippingService: 'Prepaid Mail',
  expectedDeliveryDate: '2026-08-13',
  destinationCity: 'DANBURY',
  destinationState: 'CT',
  destinationZip: '06810',
  currency: 'USD'
}

const company = { name: 'Example', defaultCurrency: 'USD' }
const printer = { characterWidth: 42, paperWidthMm: 80, printableWidthMm: 72, dotDensity: 8 }
const profile = profiles['generic-escpos']

// --- Transport factory -----------------------------------------------------

test('createPrinterTransport builds a NetTransport for LAN', () => {
  const transport = createPrinterTransport({ connectionType: 'network', networkHost: '127.0.0.1', networkPort: 9100, timeoutMs: 5000 })
  assert.ok(transport instanceof NetTransport)
  assert.equal(transport.name, 'net')
  assert.equal(transport.port, 9100)
})

test('createPrinterTransport builds a UsbTransport for USB with the profile IDs', () => {
  const transport = createPrinterTransport({ connectionType: 'usb', usbVendorId: 0x04b8, usbProductId: 0x0123, timeoutMs: 3000 })
  assert.ok(transport instanceof UsbTransport)
  assert.equal(transport.name, 'usb')
  assert.equal(transport.options.vendorId, 0x04b8)
  assert.equal(transport.options.productId, 0x0123)
})

test('createPrinterTransport rejects unsupported connection types', () => {
  assert.throws(
    () => createPrinterTransport({ connectionType: 'system' }),
    /Unsupported printer connection type: system/
  )
})

// --- open → write → close lifecycle ---------------------------------------

test('sendBytes opens, writes, closes exactly once and reports bytes', async () => {
  const transport = new FakeTransport()
  const bytes = Buffer.from('ESC/POS payload')
  const result = await sendBytes(transport, bytes)

  assert.equal(transport.openCalls, 1)
  assert.equal(transport.writeCalls, 1)
  assert.equal(transport.closeCalls, 1)
  assert.equal(transport.opened, true)
  assert.equal(transport.closed, true)
  assert.deepEqual(transport.lastWritten, bytes)
  assert.equal(result.ok, true)
  assert.equal(result.bytes, bytes.length)
})

test('sendBytes runs close() on write failure and preserves the write error', async () => {
  const transport = new FakeTransport({ failWrite: true })
  await assert.rejects(() => sendBytes(transport, Buffer.from('x')), /write failed/)
  assert.equal(transport.openCalls, 1)
  assert.equal(transport.writeCalls, 1)
  assert.equal(transport.closeCalls, 1, 'close still runs after write failure')
  assert.equal(transport.closed, true)
})

test('sendBytes runs close() on open failure', async () => {
  const transport = new FakeTransport({ failOpen: true })
  await assert.rejects(() => sendBytes(transport, Buffer.from('x')), /open failed/)
  assert.equal(transport.openCalls, 1)
  assert.equal(transport.writeCalls, 0)
  assert.equal(transport.closeCalls, 1, 'close still runs after open failure')
})

// --- USB printer discovery -------------------------------------------------

test('listUsbPrinters returns [{ vendorId, productId }] entries', async () => {
  const printers = await listUsbPrinters()
  assert.ok(Array.isArray(printers))
  for (const printer of printers) {
    assert.ok(Number.isInteger(printer.vendorId))
    assert.ok(Number.isInteger(printer.productId))
  }
})

// --- ESC/POS encoding (canonical document) --------------------------------

test('encodeReceipt generates ESC/POS bytes without a logo', async () => {
  const bytes = await encodeReceipt(makeReceiptData(receipt), printer)
  assert.ok(Buffer.isBuffer(bytes))
  assert.ok(bytes.length > 0)
  assert.equal(bytes[0], 0x1b)
  assert.equal(bytes[1], 0x40) // ESC @ initialization
  const latin = bytes.toString('latin1')
  assert.ok(latin.includes('5800 Corporate Dr'), 'sender address present')
  assert.ok(latin.includes('Prepaid Mail'), 'product present')
  assert.ok(latin.includes('$65.22'), 'total present')
  assert.ok(latin.includes('Text your tracking number to 28777'), 'footer present')
})

test('encodeReceipt bolds only the service type and strips the marker', async () => {
  const bytes = await encodeReceipt(makeReceiptData(receipt), printer)
  const service = Buffer.from('Prepaid Mail')
  const serviceIndex = bytes.indexOf(service)
  assert.ok(serviceIndex >= 0, 'service type present')
  assert.ok(
    bytes.subarray(Math.max(0, serviceIndex - 16), serviceIndex).includes(
      Buffer.from([0x1b, 0x45, 0x01])
    ),
    'bold is enabled before the service type'
  )
  assert.ok(
    bytes.subarray(serviceIndex + service.length, serviceIndex + service.length + 16).includes(
      Buffer.from([0x1b, 0x45, 0x00])
    ),
    'bold is disabled after the service type'
  )
  assert.ok(!bytes.toString('latin1').includes('Prepaid Mail@'), 'internal marker is not printed')
})

test('encodeReceipt includes the template logo raster', async () => {
  const bytes = await encodeReceipt(makeReceiptData(receipt), printer)
  assert.notEqual(bytes.indexOf(Buffer.from([0x1d, 0x76, 0x30, 0x00])), -1, 'GS raster command from the template image block')
})

// --- LAN send end-to-end via the direct transport -------------------------

function lanPrinter(overrides = {}) {
  return { connectionType: 'network', networkHost: '127.0.0.1', networkPort: 9100, timeoutMs: 2000, ...overrides }
}

test('sendReceipt prints to a controlled TCP server exactly once', async (t) => {
  let received = Buffer.alloc(0)
  let connections = 0
  let resolveClosed
  const closed = new Promise((resolve) => {
    resolveClosed = resolve
  })

  const server = net.createServer((socket) => {
    connections += 1
    socket.on('data', (data) => {
      received = Buffer.concat([received, data])
    })
    socket.on('close', () => resolveClosed())
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const { port } = server.address()

  const result = await sendReceipt(receipt, company, lanPrinter({ networkPort: port }))

  await Promise.race([
    closed,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('client socket was never closed')), 3000)
    )
  ])

  assert.equal(result.ok, true)
  assert.equal(connections, 1, 'exactly one connection — no duplicate print attempts')
  assert.equal(result.bytes, received.length, 'full payload delivered')
  assert.equal(received[0], 0x1b)
  assert.equal(received[1], 0x40, 'ESC @ initialization')
  assert.ok(received.toString('latin1').includes('Prepaid Mail'), 'receipt body delivered')
})

test('encodeEscPos encodes raster ops for a logo-shaped op', () => {
  const bitmap = { width: 16, height: 2, bits: new Uint8Array([0b10100000, 0b01000000]) }
  const bytes = encodeEscPos([{ kind: 'raster', width: 16, height: 2, bits: bitmap.bits }], profile)
  assert.ok(Buffer.isBuffer(bytes))
  assert.ok(bytes.includes(0x1d), 'GS raster command present')
  assert.ok(bytes.includes(0x76), 'GS v command present')
})
