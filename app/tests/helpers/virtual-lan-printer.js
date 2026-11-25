import net from 'node:net'

/**
 * Virtual LAN printer: a TCP server on 127.0.0.1 that captures ESC/POS bytes.
 *
 * Modes:
 *  - 'accept' (default): accepts connections, records all bytes, releases on client close.
 *  - 'refuse': binds then immediately closes, so connections get ECONNREFUSED.
 *  - 'timeout': accepts connections but never responds to data (socket hangs).
 *  - 'disconnect': accepts, reads the first chunk, then destroys the socket mid-stream.
 *
 * Returns { port, stop, received, connections, closed }.
 *   port        - TCP port the printer listens on (or the refused port in 'refuse' mode)
 *   stop()      - closes the server
 *   received    - all bytes captured from clients
 *   connections - number of connections accepted
 *   closed()    - promise that resolves when the server-side socket closes
 */
export async function createVirtualLanPrinter({
  host = '127.0.0.1',
  port = 0,
  mode = 'accept',
} = {}) {
  let received = Buffer.alloc(0)
  let connections = 0
  let closedResolver
  const closed = new Promise((resolve) => {
    closedResolver = resolve
  })

  if (mode === 'refuse') {
    const server = net.createServer()
    const actualPort = await new Promise((resolve, reject) => {
      server.listen(0, host, (err) => (err ? reject(err) : resolve(server.address().port)))
    })
    await new Promise((resolve) => server.close(resolve))
    return {
      port: actualPort,
      stop: async () => {},
      get received() {
        return received
      },
      get connections() {
        return connections
      },
      closed: () => closed,
    }
  }

  const server = net.createServer((socket) => {
    connections += 1
    socket.on('data', (data) => {
      received = Buffer.concat([received, data])
      if (mode === 'disconnect') {
        socket.destroy()
      }
    })
    socket.on('close', () => closedResolver())
  })

  const actualPort = await new Promise((resolve, reject) => {
    server.listen(port, host, (err) => (err ? reject(err) : resolve(server.address().port)))
  })

  return {
    port: actualPort,
    stop: () => new Promise((resolve) => server.close(resolve)),
    get received() {
      return received
    },
    get connections() {
      return connections
    },
    closed: () => closed,
  }
}
