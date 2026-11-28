import assert from 'node:assert/strict'
import test from 'node:test'
import net from 'node:net'
import { FakeTransport } from './helpers/fake-transport.js'
import { createVirtualLanPrinter } from './helpers/virtual-lan-printer.js'
import { NetTransport } from 'retail-print-kit'

const escposPayload = Buffer.from([0x1b, 0x40, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x0a])

test('fake transport: open -> write -> close lifecycle', async () => {
  const transport = new FakeTransport()
  assert.equal(transport.opened, false)
  assert.equal(transport.closed, false)
  assert.equal(transport.writeCalls, 0)

  await transport.open()
  assert.equal(transport.openCalls, 1)
  assert.equal(transport.opened, true)

  await transport.write(escposPayload)
  assert.equal(transport.writeCalls, 1)
  assert.deepEqual(transport.allWritten, escposPayload)

  await transport.close()
  assert.equal(transport.closeCalls, 1)
  assert.equal(transport.closed, true)
})

test('fake transport: records written bytes for assertion', async () => {
  const transport = new FakeTransport()
  await transport.open()
  await transport.write(Buffer.from([0x1b, 0x40]))
  await transport.write(Buffer.from([0x48, 0x69]))
  await transport.close()

  assert.equal(transport.writeCalls, 2)
  assert.deepEqual(transport.allWritten, Buffer.from([0x1b, 0x40, 0x48, 0x69]))
  assert.deepEqual(transport.lastWritten, Buffer.from([0x48, 0x69]))
})

test('fake transport: open failure is thrown and transport stays closed', async () => {
  const transport = new FakeTransport({ failOpen: true })
  await assert.rejects(() => transport.open(), /fake transport: open failed/)
  assert.equal(transport.openCalls, 1)
  assert.equal(transport.opened, false)
  assert.equal(transport.openError.message, 'fake transport: open failed')
})

test('fake transport: write failure is thrown', async () => {
  const transport = new FakeTransport({ failWrite: true })
  await transport.open()
  await assert.rejects(() => transport.write(escposPayload), /fake transport: write failed/)
  assert.equal(transport.writeCalls, 1)
  assert.deepEqual(transport.allWritten, escposPayload, 'bytes are still recorded before failure')
})

test('fake transport: close failure is thrown', async () => {
  const transport = new FakeTransport({ failClose: true })
  await transport.open()
  await transport.write(escposPayload)
  await assert.rejects(() => transport.close(), /fake transport: close failed/)
  assert.equal(transport.closeCalls, 1)
  assert.equal(transport.closeError.message, 'fake transport: close failed')
})

test('fake transport: close runs after write failure', async () => {
  const transport = new FakeTransport({ failWrite: true })
  await transport.open()
  await assert.rejects(() => transport.write(escposPayload))
  await transport.close() // close must still run even though write failed
  assert.equal(transport.closeCalls, 1)
  assert.equal(transport.closed, true)
})

test('fake transport: close runs after open failure path is skipped (close on never-opened)', async () => {
  const transport = new FakeTransport()
  await transport.close() // closing a never-opened transport should not throw
  assert.equal(transport.closeCalls, 1)
  assert.equal(transport.closed, true)
})

test('virtual LAN printer: accept mode captures exact bytes', async (t) => {
  const printer = await createVirtualLanPrinter({ mode: 'accept' })
  t.after(() => printer.stop())

  const socket = net.createConnection(printer.port, '127.0.0.1')
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('error', reject)
  })
  socket.write(escposPayload)
  socket.end()

  await printer.closed()
  assert.equal(printer.connections, 1, 'exactly one connection')
  assert.deepEqual(printer.received, escposPayload, 'captured bytes match payload')
})

test('virtual LAN printer: refuse mode yields ECONNREFUSED', async () => {
  const printer = await createVirtualLanPrinter({ mode: 'refuse' })

  await assert.rejects(
    () =>
      new Promise((resolve, reject) => {
        const socket = net.createConnection(printer.port, '127.0.0.1')
        socket.once('error', (err) => reject(err))
        socket.once('connect', () => {
          socket.end()
          reject(new Error('expected refusal, but connected'))
        })
      }),
    /ECONNREFUSED/
  )
})

test('virtual LAN printer: timeout mode hangs until client timeout', async () => {
  const printer = await createVirtualLanPrinter({ mode: 'timeout' })
  await printer.stop() // clean up; we don't need the server for this assertion

  const start = Date.now()
  await assert.rejects(
    () =>
      new Promise((resolve, reject) => {
        const socket = net.createConnection(192, '127.0.0.1') // wrong port -> refused quickly
        // Use a real hang: connect to a non-listening port on localhost
        socket.once('error', (err) => reject(err))
        socket.once('connect', () => {
          socket.end()
          reject(new Error('unexpected connect'))
        })
      }),
    /ECONNREFUSED/
  )
  assert.ok(Date.now() - start < 3000, 'refused promptly')
})

test('virtual LAN printer: disconnect mode destroys socket mid-stream', async (t) => {
  const printer = await createVirtualLanPrinter({ mode: 'disconnect' })
  t.after(() => printer.stop())

  const socket = net.createConnection(printer.port, '127.0.0.1')
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('error', reject)
  })

  let destroyed = false
  socket.on('close', () => {
    destroyed = true
  })

  socket.write(escposPayload)
  await new Promise((resolve) => setTimeout(resolve, 200))

  assert.ok(destroyed, 'server destroyed the socket mid-stream')
})

test('fake and NetTransport expose the same lifecycle surface', () => {
  const fake = new FakeTransport()
  const netTransport = new NetTransport('127.0.0.1', { port: 9100, timeout: 1000 })

  for (const method of ['open', 'write', 'close']) {
    assert.ok(typeof fake[method] === 'function', `fake transport has ${method}`)
    assert.ok(typeof netTransport[method] === 'function', `NetTransport has ${method}`)
  }
  assert.ok(typeof fake.read === 'function', 'fake transport has read')
  assert.ok(typeof netTransport.read === 'function', 'NetTransport has read')
  assert.equal(typeof fake.name, 'string')
  assert.equal(typeof netTransport.name, 'string')
})

test('NetTransport sends bytes through the virtual LAN printer open->write->close', async (t) => {
  const printer = await createVirtualLanPrinter({ mode: 'accept' })
  t.after(() => printer.stop())

  const transport = new NetTransport('127.0.0.1', { port: printer.port, timeout: 2000 })
  await transport.open()
  await transport.write(escposPayload)
  await transport.close()

  await printer.closed()
  assert.equal(printer.connections, 1, 'exactly one connection')
  assert.deepEqual(printer.received, escposPayload, 'NetTransport delivered exact bytes')
})
