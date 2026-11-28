/**
 * ESC/POS Printer Diagnostic — run this on your machine against your emulator.
 *
 * Tests three print formats one by one using the existing encoder and TCP transport.
 * For each test it logs: byte length, command sequence, bytes sent, socket lifecycle,
 * and bytes received by a local capture sink (so you can confirm transport delivery).
 *
 * Usage:
 *   1. Start your ESC/POS Receipt Printer Emulator on TCP port 9100.
 *   2. Edit TARGET_HOST / TARGET_PORT below if your emulator is not on 127.0.0.1:9100.
 *   3. Run:  node diag-print-tests.mjs     (from the app/ directory)
 *   4. Watch the emulator's paper after each test. Report which test prints and where it stops.
 *
 * Delete when investigation is done.
 */

import net from 'node:net'
import {
  NetTransport,
  encodeEscPos,
  profiles,
} from 'retail-print-kit'
import { createPrinterTransport, sendBytes } from './src/main/printer-transport.js'
import { encodeReceipt, sendReceipt } from './src/main/receipt-printing.js'
import { makeReceiptData } from './src/shared/invoice.js'
import { buildReceiptDocument } from './src/shared/receipt.js'
import { createVirtualLanPrinter } from './tests/helpers/virtual-lan-printer.js'

// ================= CONFIGURE THESE =================
const TARGET_HOST = '127.0.0.1'
const TARGET_PORT = 9100
// ===================================================

const CHARACTER_WIDTH = 42
const profile = {
  ...profiles['generic-escpos'],
  paper: 80,
  columns: { a: CHARACTER_WIDTH, b: CHARACTER_WIDTH },
  cut: 'feed-and-cut',
}

let failures = 0
function check(label, cond, extra = '') {
  const ok = Boolean(cond)
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${label} ${extra}`.trim())
  if (!ok) failures += 1
  return ok
}

function hexPrefix(buf, n = 80) {
  return buf.subarray(0, n).toString('hex').match(/.{1,24}/g).join(' ')
}

function describeCommands(buf) {
  const cmds = []
  const latin = buf.toString('latin1')
  let i = 0
  while (i < latin.length) {
    const ch = latin[i]
    if (ch === '\x1b') {
      const n1 = latin[i + 1]
      if (n1 === '@') { cmds.push('ESC @  init'); i += 2; continue }
      if (n1 === 'a') { cmds.push(`ESC a  align=${latin[i + 2]}`); i += 3; continue }
      if (n1 === 'd') { cmds.push(`ESC d  feed=${latin.charCodeAt(i + 2)}`); i += 3; continue }
      if (n1 === 'E') { cmds.push(`ESC E  bold=${latin[i + 2]}`); i += 3; continue }
      if (n1 === '-') { cmds.push(`ESC -  underline=${latin[i + 2]}`); i += 3; continue }
      if (n1 === '4') { cmds.push(`ESC 4  italic=${latin[i + 2]}`); i += 3; continue }
      if (n1 === 't') { cmds.push(`ESC t  codepage=${latin.charCodeAt(i + 2)}`); i += 3; continue }
      if (n1 === 'M') { cmds.push(`ESC M  font=${latin[i + 2]}`); i += 3; continue }
      cmds.push(`ESC ${n1 ?? '?'} @byte${i}`); i += 2; continue
    }
    if (ch === '\x1d') {
      const n1 = latin[i + 1]
      if (n1 === 'V') {
        const partial = latin[i + 2] === 'B' ? 'partial' : 'full'
        cmds.push(`GS V  cut(${partial}, feed=${latin.charCodeAt(i + 3)})`)
        i += 4; continue
      }
      if (n1 === '!') { cmds.push('GS !  size'); i += 3; continue }
      if (n1 === 'v') { cmds.push('GS v  raster'); i += 8; continue }
      if (n1 === 'B') { cmds.push(`GS B  invert=${latin[i + 2]}`); i += 3; continue }
      cmds.push(`GS ${n1 ?? '?'} @byte${i}`); i += 2; continue
    }
    if (ch === '\n') { cmds.push('LF'); i += 1; continue }
    let j = i
    while (j < latin.length && latin[j] !== '\x1b' && latin[j] !== '\x1d' && latin[j] !== '\n') j++
    const text = latin.slice(i, j)
    if (text.trim()) cmds.push(`TEXT: ${JSON.stringify(text)}`)
    i = j
  }
  return cmds
}

/**
 * Send bytes to the real emulator host:port AND capture them locally via a virtual LAN printer.
 * Returns { sent, received, socketEvents, elapsedMs, captureMatch }.
 */
async function sendAndCapture(bytes, label) {
  // Local capture sink mirrors what the transport sends
  const sink = await createVirtualLanPrinter({ mode: 'accept', port: 0 })
  const sinkPort = sink.port

  let socketEvents = []
  let bytesSent = 0

  const transport = createPrinterTransport({
    connectionType: 'network',
    networkHost: TARGET_HOST,
    networkPort: TARGET_PORT,
    timeoutMs: 5000,
  })

  const origOpen = transport.open.bind(transport)
  const origWrite = transport.write.bind(transport)
  const origClose = transport.close.bind(transport)
  transport.open = async () => {
    socketEvents.push('OPEN called')
    await origOpen()
    socketEvents.push('OPEN resolved')
  }
  transport.write = async (b) => {
    bytesSent = b.length
    socketEvents.push(`WRITE called (${b.length} bytes)`)
    await origWrite(b)
    socketEvents.push('WRITE resolved')
  }
  transport.close = async () => {
    socketEvents.push('CLOSE called')
    await origClose()
    socketEvents.push('CLOSE resolved')
  }

  const t0 = Date.now()
  let result = null
  try {
    result = await sendBytes(transport, bytes)
  } catch (err) {
    socketEvents.push(`ERROR: ${err.message}`)
    throw err
  }
  const t1 = Date.now()

  await new Promise((r) => setTimeout(r, 300))
  await sink.stop()

  const received = Buffer.from(sink.received)
  return {
    sent: bytesSent,
    result,
    socketEvents,
    elapsedMs: t1 - t0,
    captureMatch: received.equals(bytes),
    receivedLength: received.length,
  }
}

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
  currency: 'USD',
}
const printer = {
  characterWidth: CHARACTER_WIDTH,
  paperWidthMm: 80,
  printableWidthMm: 72,
  dotDensity: 8,
}

async function runTest(label, bytes, ops) {
  console.log(`\n══════════════════════════════════════════════════════════════════`)
  console.log(`TEST ${label}`)
  console.log(`══════════════════════════════════════════════════════════════════`)
  console.log(`generated byte length: ${bytes.length}`)
  console.log(`hex prefix: ${hexPrefix(bytes)}`)
  console.log('command sequence:')
  describeCommands(bytes).forEach((c) => console.log('  ' + c))

  let capture
  try {
    capture = await sendAndCapture(bytes, label)
  } catch (err) {
    console.log(`TRANSPORT ERROR to ${TARGET_HOST}:${TARGET_PORT}: ${err.message}`)
    console.log('  → Is the emulator running and listening on this port?')
    return
  }

  console.log(`bytes sent to emulator: ${capture.sent}`)
  console.log(`bytes captured locally: ${capture.receivedLength} (match=${capture.captureMatch})`)
  console.log(`socket lifecycle: ${capture.socketEvents.join(' → ')}`)
  console.log(`elapsed: ${capture.elapsedMs} ms`)

  check(`${label}: complete buffer sent`, capture.sent === bytes.length)
  check(`${label}: capture matches sent`, capture.captureMatch, `sent=${bytes.length} captured=${capture.receivedLength}`)

  console.log(`\n>>> OBSERVE EMULATOR PAPER FOR TEST ${label} <<<`)
  console.log(`   Did it print? Where did it stop?`)
}

async function run() {
  console.log('Target emulator:', TARGET_HOST, ':', TARGET_PORT)
  console.log('Make sure the ESC/POS Receipt Printer Emulator is running and listening.\n')

  // ---------- TEST A ----------
  const opsA = [
    { kind: 'init' },
    { kind: 'text', text: 'Line 1\n' },
    { kind: 'text', text: 'Line 2\n' },
    { kind: 'text', text: 'Line 3\n' },
    { kind: 'text', text: 'Line 4\n' },
    { kind: 'text', text: 'Line 5\n' },
    { kind: 'feed', lines: 3 },
    { kind: 'cut', partial: false, feed: 3 },
  ]
  const bytesA = encodeEscPos(opsA, profile)
  await runTest('A — Basic text (init, 5 lines, feed, cut)', bytesA, opsA)

  // ---------- TEST B ----------
  const opsB = [
    { kind: 'init' },
    { kind: 'text', text: 'RECEIPT HEADER\n' },
    { kind: 'text', text: 'Prepaid Mail   1   $0.00\n' },
    { kind: 'text', text: 'Line 1\n' },
    { kind: 'text', text: 'Line 2\n' },
    { kind: 'text', text: 'Line 3\n' },
    { kind: 'text', text: 'Line 4\n' },
    { kind: 'text', text: 'Line 5\n' },
    { kind: 'feed', lines: 3 },
    { kind: 'cut', partial: false, feed: 3 },
  ]
  const bytesB = encodeEscPos(opsB, profile)
  await runTest('B — Text + product row (init, header, product, 5 lines, feed, cut)', bytesB, opsB)

  // ---------- TEST C ----------
  const receiptData = makeReceiptData(receipt)
  const { ops: opsC } = buildReceiptDocument({ receiptData, printer })
  const bytesC = await encodeReceipt(receiptData, printer)
  await runTest('C — Full receipt (existing document + encoder)', bytesC, opsC)

  console.log(`\n══════════════════════════════════════════════════════════════════`)
  console.log('SUMMARY — report back:')
  console.log('  Test A printed? Where did it stop?')
  console.log('  Test B printed? Where did it stop?')
  console.log('  Test C printed? Where did it stop?')
  console.log('  The first test that stops printing identifies the offending command.')
  console.log(`══════════════════════════════════════════════════════════════════`)
}

run().catch((err) => {
  console.error('DIAGNOSTIC ERROR:', err)
  process.exit(1)
})
