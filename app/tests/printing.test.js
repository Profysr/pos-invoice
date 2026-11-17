import assert from 'node:assert/strict'
import net from 'node:net'
import test from 'node:test'
import { escPosBytes, sanitizeEscPosText, sendNetwork } from '../src/main/printing.js'

test('sanitizes text for ESC/POS output', () => {
  assert.equal(sanitizeEscPosText('A\u00a0B×C‘D’“E”'), 'A BxC\'D\'"E"')
  assert.equal(sanitizeEscPosText('line\u0007break'), 'linebreak')
})

test('encodes initialized, aligned, fed, and cut ESC/POS output', () => {
  const bytes = escPosBytes([{ text: 'Hello', align: 'center', bold: true }], 48, {
    cut: true,
    feed: 1,
    encoding: 'CP437'
  })

  assert.equal(bytes[0], 0x1b)
  assert.equal(bytes[1], 0x40)
  assert.ok(bytes.includes(0x0a))
  assert.equal(bytes.at(-4), 0x1d)
  assert.equal(bytes.at(-3), 0x56)
  assert.ok(bytes.toString('latin1').includes('Hello'))
})

test('sends raw bytes to a local TCP printer endpoint', async (t) => {
  let received = Buffer.alloc(0)
  let resolveReceived
  const receivedPromise = new Promise((resolve) => {
    resolveReceived = resolve
  })

  const server = net.createServer((socket) => {
    socket.on('data', (data) => {
      received = Buffer.concat([received, data])
      resolveReceived()
      socket.end()
    })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())

  const { port } = server.address()
  const result = await sendNetwork(
    { networkHost: '127.0.0.1', networkPort: port, timeoutMs: 1000 },
    Buffer.from('print-me')
  )

  await receivedPromise
  assert.equal(result.ok, true)
  assert.equal(result.bytes, 8)
  assert.equal(received.toString(), 'print-me')
})
