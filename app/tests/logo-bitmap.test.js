import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createCanvas } from '@napi-rs/canvas'
import { deserializeBitmap } from 'retail-print-kit'
import { prepareLogoBitmap } from '../src/main/logo-bitmap.js'
import { logoWidthDots } from '../src/shared/receipt-layout.js'

const printer = { characterWidth: 42, paperWidthMm: 80, printableWidthMm: 72, dotDensity: 8 }

test('prepareLogoBitmap returns null without a path or with an unreadable file', async () => {
  assert.equal(await prepareLogoBitmap(null, printer), null)
  assert.equal(await prepareLogoBitmap('', printer), null)
  assert.equal(await prepareLogoBitmap(join(tmpdir(), 'does-not-exist-phase2.png'), printer), null)
})

test('prepareLogoBitmap produces a deterministic serialized bitmap at logoWidthDots', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'phase2-logo-'))
  t.after(() => rm(dir, { recursive: true, force: true }))

  const path = join(dir, 'logo.png')
  const canvas = createCanvas(64, 32)
  const context = canvas.getContext('2d')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, 64, 32)
  context.fillStyle = '#000'
  context.fillRect(0, 0, 32, 32)
  await writeFile(path, canvas.toBuffer('image/png'))

  const first = await prepareLogoBitmap(path, printer)
  const second = await prepareLogoBitmap(path, printer)

  assert.deepEqual(first, second, 'same input produces the same bitmap')
  assert.equal(first.width, logoWidthDots(printer), 'width driven by shared logoWidthDots')
  assert.ok(first.height > 0, 'height keeps the aspect ratio')
  assert.equal(typeof first.data, 'string', 'bits serialized as base64')

  const bits = deserializeBitmap(first).bits
  assert.equal(
    bits.length,
    Math.ceil(first.width / 8) * first.height,
    'serialized bitmap round-trips to width x height bits'
  )
})
