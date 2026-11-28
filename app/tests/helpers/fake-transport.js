/**
 * Fake Transport implementing the retail-print-kit Transport interface
 * (open, write, read, close) for testing printing without Electron or hardware.
 *
 * Records every byte written so tests can assert the exact ESC/POS payload.
 * Supports configurable open, write, and close failures so failure paths can be
 * triggered deterministically.
 *
 * The real Transport interface:
 *   readonly name: string
 *   open(): Promise<void>
 *   write(bytes: Buffer): Promise<void>
 *   read?(timeoutMs: number): Promise<Buffer>   // optional
 *   close(): Promise<void>
 */
export class FakeTransport {
  constructor({ name = 'fake', failOpen = false, failWrite = false, failClose = false } = {}) {
    this.name = name
    this.failOpen = failOpen
    this.failWrite = failWrite
    this.failClose = failClose
    this.openCalls = 0
    this.writeCalls = 0
    this.closeCalls = 0
    this.written = []
    this.opened = false
    this.closed = false
    this.openError = null
    this.writeError = null
    this.closeError = null
  }

  async open() {
    this.openCalls += 1
    if (this.failOpen) {
      this.openError = new Error('fake transport: open failed')
      throw this.openError
    }
    this.opened = true
  }

  async write(bytes) {
    this.writeCalls += 1
    const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
    this.written.push(data)
    if (this.failWrite) {
      this.writeError = new Error('fake transport: write failed')
      throw this.writeError
    }
  }

  async read(timeoutMs) {
    return Buffer.alloc(0)
  }

  async close() {
    this.closeCalls += 1
    if (this.failClose) {
      this.closeError = new Error('fake transport: close failed')
      throw this.closeError
    }
    this.closed = true
  }

  /** Last buffer written to the transport. */
  get lastWritten() {
    return this.written.length > 0 ? this.written[this.written.length - 1] : Buffer.alloc(0)
  }

  /** All buffers written, concatenated into one. */
  get allWritten() {
    return Buffer.concat(this.written)
  }

  reset() {
    this.openCalls = 0
    this.writeCalls = 0
    this.closeCalls = 0
    this.written = []
    this.opened = false
    this.closed = false
    this.openError = null
    this.writeError = null
    this.closeError = null
  }
}
