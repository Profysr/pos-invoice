import assert from 'node:assert/strict'
import net from 'node:net'
import test from 'node:test'
import {
  encodeEscPos,
  NetTransport,
  profiles
} from 'retail-print-kit'
import {
  encodeReceipt,
  buildReceiptPrintHtml,
  createNetTransport,
  rasterizeReceiptLogo,
  logoWidthDots,
  sendBytesLan,
  sendReceiptLan
} from '../src/main/receipt-printing.js'

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
  assert.ok(latin.includes('Up to $100.00 included'), 'fixed insurance present')
  assert.ok(latin.includes('$0.00'), 'fixed insurance amount present')
  assert.ok(latin.includes('$65.22'), 'total present')
  assert.ok(latin.includes('Text your tracking number to 28777'), 'footer present')
})

test('encodeReceipt bolds only the service type', async () => {
  const bytes = await encodeReceipt(receipt, company, printer)
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

test('Windows print HTML bolds only the service type', async () => {
  const html = await buildReceiptPrintHtml(receipt, company, printer)

  assert.match(html, /<b>Prepaid Mail<\/b>/)
  assert.ok(!html.includes('Prepaid Mail@'), 'internal marker is not printed')
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
  // Exact shape returned by src/main/logo-raster.js rasterizeLogo().
  const logo = {
    data: Buffer.from([0b10100000, 0b01000000]), // MSB-first packed
    bytesPerRow: 2,
    widthDots: 16,
    heightDots: 1
  }
  const bytes = await encodeReceipt(receipt, company, printer, { logo })
  const latin = bytes.toString('latin1')
  assert.ok(latin.includes('Prepaid Mail'), 'receipt text still present')

  const command = bytes.indexOf(Buffer.from([0x1d, 0x76, 0x30, 0x00]))
  assert.ok(command > -1, 'GS v 0 raster command present')
  // GS v 0 carries bytes-per-row (ceil(width/8)) in the xL/xH slot, not pixels.
  assert.equal(bytes[command + 4], 2, '16 dots -> 2 bytes per row')
  assert.equal(bytes[command + 5], 0, 'raster width high byte')
  assert.equal(bytes[command + 6], 1, 'raster height comes from heightDots')
  assert.equal(bytes[command + 7], 0, 'raster height high byte')
  assert.deepEqual(
    bytes.subarray(command + 8, command + 10),
    logo.data,
    'bitmap payload follows the header'
  )
})

test('encodeReceipt rasterizes through logoPath using the rasterizer contract', async () => {
  // Production passes logoPath, not a pre-built bitmap, so this is the path
  // invoice:print actually takes.
  const seen = {}
  const rasterizeLogo = async (logoPath, options) => {
    seen.logoPath = logoPath
    seen.options = options
    return { data: Buffer.from([0xff]), bytesPerRow: 1, widthDots: 8, heightDots: 1 }
  }

  const bytes = await encodeReceipt(receipt, company, printer, {
    logoPath: '/tmp/company-logo.png',
    rasterizeLogo
  })

  assert.equal(seen.logoPath, '/tmp/company-logo.png')
  assert.equal(seen.options.widthDots, logoWidthDots(printer), 'logo sized from printer dots')

  const command = bytes.indexOf(Buffer.from([0x1d, 0x76, 0x30, 0x00]))
  assert.ok(command > -1, 'GS v 0 raster command present')
  assert.equal(bytes[command + 4], 1, 'widthDots 8 -> one byte per row')
  assert.equal(bytes[command + 6], 1, 'height taken from heightDots')
})

test('encodeReceipt skips the logo when the rasterizer finds no image', async () => {
  const bytes = await encodeReceipt(receipt, company, printer, {
    logoPath: '/tmp/missing.png',
    rasterizeLogo: async () => null
  })
  assert.equal(
    bytes.indexOf(Buffer.from([0x1d, 0x76, 0x30, 0x00])),
    -1,
    'no raster command without a bitmap'
  )
})

test('rasterizeReceiptLogo returns null when there is no logo path', async () => {
  assert.equal(await rasterizeReceiptLogo(null), null)
  assert.equal(await rasterizeReceiptLogo(''), null)
})

test('logoWidthDots mirrors the existing print path (70% of printable dots)', () => {
  assert.equal(logoWidthDots({ printableWidthMm: 72, dotDensity: 8 }), Math.round(72 * 8 * 0.7))
  assert.equal(logoWidthDots({ printableWidthMm: 50, dotDensity: 8 }), Math.round(50 * 8 * 0.7))
})

// --- Phase 4: LAN transport ---------------------------------------------

function lanPrinter(overrides = {}) {
  return { networkHost: '127.0.0.1', networkPort: 9100, timeoutMs: 2000, ...overrides }
}

test('sendReceiptLan prints to a controlled TCP server exactly once', async (t) => {
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

  const result = await sendReceiptLan(receipt, company, lanPrinter({ networkPort: port }))

  // The transport ends the socket, so a server-side close proves the whole
  // payload arrived and the connection was released.
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
  assert.equal(
    result.message,
    'Data sent to printer. Physical output is not guaranteed.',
    'invoice:print response text unchanged'
  )
})

test('sendBytesLan fails cleanly when the connection is refused', async () => {
  const probe = net.createServer()
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address()
  await new Promise((resolve) => probe.close(resolve))

  const start = Date.now()
  await assert.rejects(
    () => sendBytesLan(Buffer.from('payload'), lanPrinter({ networkPort: port })),
    /ECONNREFUSED/,
    'a refused connection rejects rather than reporting success'
  )
  assert.ok(Date.now() - start < 3000, 'rejected promptly instead of hanging')
})

test('sendBytesLan times out when the printer never accepts the connection', async () => {
  const start = Date.now()
  await assert.rejects(
    () =>
      sendBytesLan(
        Buffer.from('payload'),
        {
          // RFC 5737 documentation range: guaranteed unroutable, so the
          // connect attempt always reaches the configured timeout.
          networkHost: '192.0.2.1',
          networkPort: 9100,
          timeoutMs: 500
        }
      ),
    /timeout connecting/,
    'timeout surfaces as an error, never as success'
  )
  const elapsed = Date.now() - start
  assert.ok(elapsed >= 400, `waited for the connect timeout, got ${elapsed}ms`)
  assert.ok(elapsed < 3000, `did not hang past the timeout, got ${elapsed}ms`)
})

test('sendBytesLan rejects a missing host instead of defaulting to localhost', async () => {
  await assert.rejects(
    () => sendBytesLan(Buffer.from('payload'), { networkHost: '', networkPort: 9100, timeoutMs: 1000 }),
    /Network printer host is missing/,
    'legacy guard preserved'
  )
})

test('sendBytesLan settles without hanging when the printer disconnects mid-stream', async (t) => {
  const server = net.createServer((socket) => {
    socket.once('data', () => socket.destroy())
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const { port } = server.address()

  const outcome = await Promise.race([
    sendBytesLan(Buffer.alloc(4 * 1024 * 1024, 0x41), lanPrinter({ networkPort: port, timeoutMs: 1000 })).then(
      () => 'settled',
      () => 'settled'
    ),
    new Promise((resolve) => setTimeout(() => resolve('hung'), 5000))
  ])
  assert.equal(outcome, 'settled', 'open/write/close always settles — socket never leaks')
})
