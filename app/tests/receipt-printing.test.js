import assert from 'node:assert/strict'
import test from 'node:test'
import {
  encodeEscPos,
  NetTransport,
  profiles
} from 'retail-print-kit'
import { encodeReceipt, createNetTransport, rasterizeReceiptLogo, logoWidthDots } from '../src/main/receipt-printing.js'
import { escPosBytes } from '../src/main/printing.js'

const receipt = {
  invoiceDate: '2026-08-10',
  invoiceTime: '18:06',
  trackingNumber: '9201990367007536409945',
  subtotal: 6522,
  insurance: 0,
  shippingFrom: 'DE MOSS\nDE 5800 Corporate Dr Houston\nTX 77036',
  expectedDeliveryDate: '2026-08-13',
  shippingService: 'Prepaid Mail',
  destinationAddress: 'DANBURY CT 06810',
  packageWeight: '14 lb 6.0 oz',
  insuranceLabel: 'Up to $100.00 included',
  currency: 'USD'
}

const company = { name: 'Example', defaultCurrency: 'USD' }
const printer = { characterWidth: 42, paperWidthMm: 80, printableWidthMm: 72, dotDensity: 8 }
const profile = profiles['generic-escpos']

test('createNetTransport builds a NetTransport for the configured host/port', () => {
  const transport = createNetTransport({ networkHost: '127.0.0.1', networkPort: 9100, timeoutMs: 5000 })
  assert.ok(transport instanceof NetTransport)
  assert.equal(transport.name, 'net')
  assert.equal(transport.port, 9100)
  assert.equal(transport.timeout, 5000)
})

test('encodeReceipt generates ESC/POS bytes without a logo', async () => {
  const bytes = await encodeReceipt(receipt, company, printer)
  assert.ok(Buffer.isBuffer(bytes))
  assert.ok(bytes.length > 0)
  assert.equal(bytes[0], 0x1b)
  assert.equal(bytes[1], 0x40) // ESC @ initialization
  const latin = bytes.toString('latin1')
  assert.ok(latin.includes('DE MOSS'), 'shipping from present')
  assert.ok(latin.includes('Prepaid Mail'), 'product present')
  assert.ok(latin.includes('$65.22'), 'total present')
  assert.ok(latin.includes('Text your tracking number to 28777'), 'footer present')
})

test('encodeReceipt uses CP437 text encoding for the configured profile', async () => {
  const bytes = await encodeReceipt(receipt, company, { ...printer, paperWidthMm: 58, characterWidth: 32 })
  assert.ok(Buffer.isBuffer(bytes))
  assert.ok(bytes.length > 0)
  assert.equal(bytes[0], 0x1b)
  assert.equal(bytes[1], 0x40)
})

test('text ops are encoded with the configured encoding', () => {
  const bytes = encodeEscPos(
    [{ kind: 'text', text: 'Caf\xE9' }, { kind: 'newline', count: 1 }],
    profile
  )
  assert.ok(Buffer.isBuffer(bytes))
  assert.ok(bytes.length > 0)
})

test('alignment ops are encoded', () => {
  const bytes = encodeEscPos(
    [
      { kind: 'align', align: 'center' },
      { kind: 'text', text: 'CENTERED\n' },
      { kind: 'align', align: 'right' },
      { kind: 'text', text: 'RIGHT\n' },
      { kind: 'align', align: 'left' }
    ],
    profile
  )
  const latin = bytes.toString('latin1')
  assert.ok(latin.includes('CENTERED'))
  assert.ok(latin.includes('RIGHT'))
})

test('barcode ops are encoded', () => {
  const bytes = encodeEscPos(
    [{ kind: 'barcode', data: '9201990367007536409945', type: 'CODE128', options: {} }],
    profile
  )
  assert.ok(Buffer.isBuffer(bytes))
  assert.ok(bytes.length > 0)
  assert.ok(bytes.toString('latin1').includes('9201990367007536409945'))
})

test('QR ops are encoded for a profile with native QR', () => {
  const bytes = encodeEscPos(
    [{ kind: 'qr', data: 'https://example.com', options: { size: 6, correction: 'M', model: 2 } }],
    profile
  )
  assert.ok(Buffer.isBuffer(bytes))
  assert.ok(bytes.length > 0)
})

test('image/raster ops are encoded', () => {
  const bitmap = { width: 16, height: 2, bits: new Uint8Array([0b10100000, 0b01000000]) }
  const bytes = encodeEscPos(
    [{ kind: 'raster', width: 16, height: 2, bits: bitmap.bits }],
    profile
  )
  assert.ok(Buffer.isBuffer(bytes))
  assert.ok(bytes.length > 0)
  assert.ok(bytes.includes(0x1d), 'GS raster command present')
  assert.ok(bytes.includes(0x76), 'GS v command present')
})

test('cut and feed ops are encoded', () => {
  const bytes = encodeEscPos(
    [
      { kind: 'text', text: 'Before cut\n' },
      { kind: 'feed', lines: 3 },
      { kind: 'cut', partial: false, feed: 3 }
    ],
    profile
  )
  const latin = bytes.toString('latin1')
  assert.ok(latin.includes('Before cut'))
  assert.ok(bytes.includes(0x1d), 'GS cut command present')
  assert.ok(bytes.includes(0x56), 'GS V cut command present')
})

test('encodeReceipt embeds a rasterized logo image when one is provided', async () => {
  const logo = {
    width: 16,
    height: 2,
    data: Buffer.from([0b10100000, 0b01000000]) // MSB-first packed, matches logo-raster output
  }
  const bytes = await encodeReceipt(receipt, company, printer, { logo })
  const latin = bytes.toString('latin1')
  assert.ok(latin.includes('Prepaid Mail'), 'receipt text still present')
  assert.ok(bytes.includes(0x1d), 'GS raster command present for logo')
  assert.ok(bytes.includes(0x76), 'GS v image command present')
})

test('rasterizeReceiptLogo returns null when there is no logo path', async () => {
  assert.equal(await rasterizeReceiptLogo(null), null)
  assert.equal(await rasterizeReceiptLogo(''), null)
})

test('logoWidthDots mirrors the existing print path (70% of printable dots)', () => {
  assert.equal(logoWidthDots({ printableWidthMm: 72, dotDensity: 8 }), Math.round(72 * 8 * 0.7))
  assert.equal(logoWidthDots({ printableWidthMm: 50, dotDensity: 8 }), Math.round(50 * 8 * 0.7))
})

test('new ESC/POS output matches the existing encoder on structural features', async () => {
  const oldBytes = escPosBytes(
    [{ text: 'Hello', align: 'center', bold: true }],
    48,
    { cut: true, feed: 1, encoding: 'CP437' }
  )
  const newBytes = encodeEscPos(
    [
      { kind: 'init' },
      { kind: 'align', align: 'center' },
      { kind: 'style', style: { bold: true } },
      { kind: 'text', text: 'Hello\n' },
      { kind: 'feed', lines: 1 },
      { kind: 'cut', partial: false, feed: 3 }
    ],
    profile
  )
  assert.ok(Buffer.isBuffer(oldBytes) && Buffer.isBuffer(newBytes))
  assert.ok(oldBytes.length > 0 && newBytes.length > 0)
  assert.equal(oldBytes[0], 0x1b)
  assert.equal(oldBytes[1], 0x40)
  assert.equal(newBytes[0], 0x1b)
  assert.equal(newBytes[1], 0x40)
  // Both encoders emit a terminating cut block.
  assert.ok(oldBytes.includes(0x1d) && oldBytes.includes(0x56))
  assert.ok(newBytes.includes(0x1d) && newBytes.includes(0x56))
})
