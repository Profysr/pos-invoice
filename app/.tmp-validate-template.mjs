import { readFile } from 'node:fs/promises'
import { encodeEscPos } from 'retail-print-kit'
import { buildReceiptDocument, buildReceiptPreviewHtml, buildReceiptViewModel, RECEIPT_TEMPLATE } from './src/shared/receipt.js'

const problems = []
const notes = []
const ok = (label, detail = '') => notes.push(`  PASS  ${label}${detail ? ' — ' + detail : ''}`)
const fail = (label, detail) => problems.push(`  FAIL  ${label} — ${detail}`)

const template = JSON.parse(await readFile('src/shared/receipt-template.json', 'utf8'))

// --- 1. Template shape --------------------------------------------------------
if (template.version === 1) ok('template version', '1')
else fail('template version', String(template.version))
if (Array.isArray(template.blocks) && template.blocks.length > 0) ok('template blocks', `${template.blocks.length} blocks`)
else fail('template blocks', 'missing or empty')

const KNOWN = new Set([
  'text', 'line', 'row', 'table', 'feed', 'newline', 'cut', 'drawer', 'qr', 'barcode', 'image', 'each', 'if'
])
for (const block of template.blocks) {
  if (!KNOWN.has(block.type)) fail('block type', `unknown "${block.type}"`)
}
ok('block types', 'all known')

const image = template.blocks.find((b) => b.type === 'image')
if (image) {
  const expected = Math.ceil(image.width / 8) * image.height
  const bytes = Buffer.from(image.data, 'base64')
  if (bytes.length === expected) ok('image block payload', `${image.width}x${image.height} dots, ${bytes.length} bytes`)
  else fail('image block payload', `${bytes.length} bytes, expected ${expected}`)
  if (image.align === 'center') ok('image alignment', 'center')
  else notes.push(`  NOTE  image align is "${image.align}"`)
}

// --- 2. Placeholder wiring ----------------------------------------------------
const EXPRESSION = /\{\{([^}]+)\}\}/g
const expressions = (text) => [...String(text).matchAll(EXPRESSION)].map((m) => m[1].trim())
const head = (expression) => expression.split('|')[0].trim()

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
const printer = { characterWidth: 48, paperWidthMm: 80, printableWidthMm: 72, dotDensity: 8 }
const [data, profile] = buildReceiptViewModel(receipt, company, printer)

const rootKeys = new Set(Object.keys(data))
const usedRootKeys = new Set()

const walk = (blocks, scope) => {
  for (const block of blocks ?? []) {
    if (block.type === 'each') {
      const key = head(block.items)
      if (!rootKeys.has(key)) fail('each items', `"${key}" is not a view-model key`)
      else {
        usedRootKeys.add(key)
        const list = data[key]
        if (!Array.isArray(list)) fail('each items', `"${key}" is not an array`)
        else {
          const first = list[0]
          for (const expression of expressions(JSON.stringify(block.blocks))) {
            const name = head(expression)
            if (name === 'this') continue
            if (first && typeof first === 'object' && !(name in first)) {
              fail('each scope', `"${name}" missing from ${key}[0]`)
            }
          }
        }
      }
      walk(block.blocks, scope)
      continue
    }
    if (block.type === 'table') {
      const key = head(block.rows)
      if (!rootKeys.has(key)) fail('table rows', `"${key}" is not a view-model key`)
      else {
        usedRootKeys.add(key)
        const first = data[key][0]
        for (const column of block.columns) {
          for (const expression of expressions(column.value)) {
            const name = head(expression)
            if (first && !(name in first)) fail('table scope', `"${name}" missing from ${key}[0]`)
          }
        }
      }
      continue
    }
    if (block.type === 'if') {
      const key = head(block.when)
      if (!rootKeys.has(key)) fail('if condition', `"${key}" is not a view-model key`)
      else usedRootKeys.add(key)
      walk(block.blocks, scope)
      walk(block.else, scope)
      continue
    }
    for (const expression of expressions(JSON.stringify(block))) {
      const name = head(expression)
      if (name === 'this') continue
      if (!rootKeys.has(name)) fail('placeholder', `"${expression}" has no view-model value`)
      else usedRootKeys.add(name)
    }
  }
}
walk(template.blocks, data)
ok('placeholder wiring', 'every template expression resolves')

const orphanKeys = [...rootKeys].filter((key) => !usedRootKeys.has(key))
if (orphanKeys.length === 0) ok('view model has no unused keys')
else notes.push(`  NOTE  view-model keys not referenced by the template: ${orphanKeys.join(', ')}`)

// --- 3. Rendered document -----------------------------------------------------
for (const paper of [80, 58]) {
  const width = paper === 58 ? 32 : 48
  const { ops } = buildReceiptDocument({
    receipt,
    company,
    printer: { characterWidth: width, paperWidthMm: paper, printableWidthMm: paper === 58 ? 50 : 72, dotDensity: 8 }
  })

  const texts = ops.filter((op) => op.kind === 'text').map((op) => op.text)
  const unresolved = texts.filter((text) => text.includes('{{'))
  if (unresolved.length === 0) ok(`${paper}mm: all placeholders resolved in output`)
  else fail(`${paper}mm: unresolved placeholders`, unresolved.join(' | '))

  if (ops[0].kind === 'init') ok(`${paper}mm: document starts with ESC @`)
  else fail(`${paper}mm: document start`, ops[0].kind)

  const rasters = ops.filter((op) => op.kind === 'raster')
  if (rasters.length === 1) ok(`${paper}mm: template logo rendered once`, `${rasters[0].width}x${rasters[0].height} dots`)
  else fail(`${paper}mm: logo raster count`, String(rasters.length))

  const printableDots = (paper === 58 ? 50 : 72) * 8
  if (rasters[0].width <= printableDots) ok(`${paper}mm: logo fits the printable line`, `${rasters[0].width} <= ${printableDots} dots`)
  else fail(`${paper}mm: logo overflows the printable line`, `${rasters[0].width} > ${printableDots} dots`)

  const cuts = ops.filter((op) => op.kind === 'cut')
  if (cuts.length === 1) ok(`${paper}mm: exactly one cut`)
  else fail(`${paper}mm: cut count`, String(cuts.length))
  if (ops.at(-1).kind === 'cut') ok(`${paper}mm: document ends with a cut`)
  else fail(`${paper}mm: document end`, ops.at(-1).kind)

  if (texts.some((t) => t.includes('Prepaid Mail')) && texts.some((t) => t.includes('$65.22'))) {
    ok(`${paper}mm: product and total present`)
  } else fail(`${paper}mm: receipt content`, 'product or total missing')

  if (texts.some((t) => t.includes('Prepaid Mail@'))) fail(`${paper}mm: internal marker leaked`, 'Prepaid Mail@')
  else ok(`${paper}mm: internal product marker stripped`)

  const bytes = encodeEscPos(ops, profile)
  if (bytes[0] === 0x1b && bytes[1] === 0x40) ok(`${paper}mm: ESC/POS starts with ESC @`)
  else fail(`${paper}mm: ESC/POS header`, bytes.slice(0, 2).toString('hex'))
  if (bytes.includes(0x1d) && bytes.includes(0x76)) ok(`${paper}mm: ESC/POS carries the logo raster (GS v 0)`)
  else fail(`${paper}mm: ESC/POS raster`, 'GS v 0 command missing')
  if (bytes.includes(0x1d) && bytes.includes(0x56)) ok(`${paper}mm: ESC/POS carries the cut (GS V)`)
  else fail(`${paper}mm: ESC/POS cut`, 'GS V command missing')
  const latin = bytes.toString('latin1')
  for (const token of ['DE MOSS', 'Prepaid Mail', 'DANBURY CT 06810', '$65.22']) {
    if (!latin.includes(token)) fail(`${paper}mm: ESC/POS content`, `"${token}" missing`)
  }
  ok(`${paper}mm: ESC/POS payload carries the receipt content`, `${bytes.length} bytes`)

  const html = buildReceiptPreviewHtml({ ops, profile })
  if (/^<!doctype html>/i.test(html)) ok(`${paper}mm: preview is a complete document`)
  else fail(`${paper}mm: preview document`, 'no doctype')
  if (html.includes('data:image/png;base64,')) ok(`${paper}mm: preview carries the template logo`)
  else fail(`${paper}mm: preview logo`, 'no PNG data URI')
  if (html.includes('Prepaid Mail') && html.includes('$65.22')) ok(`${paper}mm: preview carries the receipt content`)
  else fail(`${paper}mm: preview content`, 'product or total missing')
  if (html.includes('{{')) fail(`${paper}mm: preview placeholders`, 'unresolved placeholder in HTML')
}

// --- 4. Both render entry points agree on the template ------------------------
if (RECEIPT_TEMPLATE.blocks.length === template.blocks.length) ok('exported template matches the JSON on disk')
else fail('exported template', 'differs from receipt-template.json')

console.log(notes.join('\n'))
if (problems.length > 0) {
  console.log('\n' + problems.join('\n'))
  console.log(`\n${problems.length} problem(s) found`)
  process.exitCode = 1
} else {
  console.log('\nAll checks passed.')
}
