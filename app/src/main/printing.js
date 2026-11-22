import net from 'node:net'
import iconv from 'iconv-lite'
import { wrapText } from '../shared/receipt.js'

const ESC = 0x1b
const GS = 0x1d

const codePages = {
  cp437: 0,
  cp850: 2,
  cp860: 3,
  cp863: 4,
  cp865: 5,
  win1252: 16,
  cp852: 18,
  cp858: 19
}

export function sanitizeEscPosText(value) {
  return String(value ?? '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/[×]/g, 'x')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
}

export function escPosBytes(lines, width = 48, options = {}) {
  const {
    cut = true,
    feed = 4,
    encoding = 'CP437',
    logo = null,
    printableDots = 0,
    dotsPerChar = 12
  } = options
  const chunks = [ESC, 0x40]
  const parts = []
  const normalized = encoding
    .toLowerCase()
    .replace(/windows-/, 'win')
    .replace('printer default', 'ascii')
  const page = codePages[normalized]
  if (page !== undefined) chunks.push(ESC, 0x74, page)

  const target = iconv.encodingExists(normalized) ? normalized : 'ascii'
  const write = (value) => chunks.push(...iconv.encode(sanitizeEscPosText(value), target), 0x0a)
  const alignment = (value) => (value === 'center' ? 1 : value === 'right' ? 2 : 0)
  // Keeps the raster bytes in stream order instead of appending them at the end.
  const writeBuffer = (buffer) => {
    if (chunks.length > 0) {
      parts.push(Buffer.from(chunks.splice(0, chunks.length)))
    }
    parts.push(buffer)
  }

  for (const line of lines) {
    if (line?.type === 'feed') {
      for (let index = 0; index < line.lines; index += 1) write('')
      continue
    }
    if (line?.type === 'divider') {
      write(String(line.character || '-').repeat(width))
      continue
    }
    if (line?.type === 'logo') {
      if (!logo?.data?.length) continue
      // Center the raster with a rough space pad (12 dots per character at 203 dpi).
      const leftPadDots = Math.max(
        0,
        Math.round((Number(printableDots) - Number(logo.widthDots || 0)) / 2)
      )
      const padSpaces = Math.max(0, Math.round(leftPadDots / Math.max(1, Number(dotsPerChar))))
      chunks.push(ESC, 0x61, 0x00)
      if (padSpaces > 0) write(' '.repeat(padSpaces))
      chunks.push(GS, 0x76, 0x30, 0x00)
      chunks.push(logo.bytesPerRow & 0xff, (logo.bytesPerRow >> 8) & 0xff)
      chunks.push(logo.heightDots & 0xff, (logo.heightDots >> 8) & 0xff)
      writeBuffer(logo.data)
      chunks.push(0x0a)
      continue
    }

    chunks.push(ESC, 0x61, alignment(line?.align), ESC, 0x45, line?.bold ? 1 : 0, ESC, 0x2d, 0)
    for (const value of wrapText(line?.text ?? '', width)) write(value)
  }

  for (let index = 0; index < feed; index += 1) write('')
  if (cut) chunks.push(GS, 0x56, 0x41, 3)
  if (chunks.length > 0) parts.push(Buffer.from(chunks))
  return Buffer.concat(parts)
}

export function sendNetwork(profile, data) {
  return new Promise((resolve, reject) => {
    if (!profile?.networkHost) {
      reject(new Error('Network printer host is missing'))
      return
    }

    const socket = new net.Socket()
    let settled = false
    const fail = (message) => {
      if (settled) return
      settled = true
      socket.destroy()
      reject(new Error(message))
    }

    socket.setTimeout(Number(profile.timeoutMs) || 5000)
    socket.once('timeout', () => fail('Printer connection timed out'))
    socket.once('error', (error) => fail(`Printer unreachable: ${error.message}`))
    socket.connect(Number(profile.networkPort) || 9100, profile.networkHost, () => {
      socket.write(data, (error) => {
        if (error) {
          fail(`Print write failed: ${error.message}`)
          return
        }
        socket.end()
      })
    })
    socket.once('close', (hadError) => {
      if (settled || hadError) return
      settled = true
      resolve({
        ok: true,
        message: 'Data sent to printer. Physical output is not guaranteed.',
        bytes: data.length
      })
    })
  })
}

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]
  )
}

export function receiptLinesToHtml(lines, printer, logoDataUrl = '') {
  const paperWidth = Number(printer.paperWidthMm) || 80
  const printableWidth = Number(printer.printableWidthMm) || paperWidth - 8
  const body = lines
    .map((line) => {
      if (line?.type === 'logo') {
        return logoDataUrl
          ? `<img src="${logoDataUrl}" alt="" style="display:block;margin:0 auto 6px;max-width:70%">`
          : ''
      }
      if (line?.type === 'divider') {
        return '<div style="border-bottom:1px dashed #000;height:0;margin:4px 0"></div>'
      }
      const text = escapeHtml(line.text)
      const align = line.align === 'center' ? 'center' : line.align === 'right' ? 'right' : 'left'
      const weight = line.bold ? 700 : 400
      const underline = Number(line.underline) === 2 ? 'underline double' : Number(line.underline) ? 'underline' : ''
      const fontSize = line.font === 'b' ? '0.78em' : ''
      const widthScale = Math.max(1, Math.min(8, Number(line.widthScale) || 1))
      const heightScale = Math.max(1, Math.min(8, Number(line.heightScale) || 1))
      const transform = widthScale !== 1 || heightScale !== 1
        ? `transform:scale(${widthScale},${heightScale});transform-origin:${align} top;`
        : ''
      return `<div style="text-align:${align};font-weight:${weight};${underline ? `text-decoration:${underline};` : ''}${fontSize ? `font-size:${fontSize};` : ''}${transform}white-space:pre-wrap">${text || '&nbsp;'}</div>`
    })
    .join('')

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${paperWidth}mm auto; margin: 2mm; }
    html, body { margin: 0; padding: 0; }
    body { width: ${printableWidth}mm; font: 12px Consolas, "Courier New", monospace; color: #000; }
  </style></head><body>${body}</body></html>`
}
