import assert from 'node:assert/strict'
import test from 'node:test'
import { paperPreset, PAPER_PRESETS } from '../src/shared/paper.js'

test('derives the printable width and character grid from the paper width', () => {
  assert.deepEqual(paperPreset(80), {
    paperWidthMm: 80,
    printableWidthMm: 72,
    characterWidth: 48
  })
  assert.deepEqual(paperPreset('58'), {
    paperWidthMm: 58,
    printableWidthMm: 50,
    characterWidth: 32
  })
})

test('falls back to the 80 mm grid for unknown widths', () => {
  assert.equal(paperPreset(999).paperWidthMm, 80)
  assert.equal(paperPreset(undefined).paperWidthMm, 80)
  assert.equal(Object.keys(PAPER_PRESETS).length, 2)
})
