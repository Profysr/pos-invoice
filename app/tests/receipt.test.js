import assert from 'node:assert/strict'
import test from 'node:test'
import { wrapText } from '../src/shared/receipt.js'
import { opsToReceiptLines } from '../src/shared/receipt-ops-lines.js'

test('wraps long receipt text to the configured character width', () => {
  const lines = wrapText('one two three four five six seven eight nine ten', 12)
  assert.ok(lines.length > 1)
  assert.ok(lines.every((line) => line.length <= 12))
})

test('preserves alignment and printer styles in the canonical line model', () => {
  const lines = opsToReceiptLines(
    [
      { kind: 'align', align: 'center' },
      { kind: 'style', style: { bold: true, underline: 2 } },
      { kind: 'font', font: 'b' },
      { kind: 'size', width: 2, height: 1 },
      { kind: 'text', text: 'Styled\n' },
      { kind: 'style', style: { bold: false, underline: 0 } },
      { kind: 'font', font: 'a' },
      { kind: 'size', width: 1, height: 1 },
      { kind: 'text', text: 'Plain\n' }
    ],
    { width: 20 }
  )

  assert.deepEqual(lines[0], {
    text: 'Styled',
    align: 'center',
    bold: true,
    underline: 2,
    font: 'b',
    widthScale: 2,
    heightScale: 1
  })
  assert.equal(lines[1].bold, false)
  assert.equal(lines[1].align, 'center')
})

test('represents template rules as dividers and spacing as blank lines', () => {
  const lines = opsToReceiptLines(
    [
      { kind: 'text', text: '----\n' },
      { kind: 'newline', count: 1 },
      { kind: 'text', text: 'Receipt\n' }
    ],
    { width: 4 }
  )

  assert.deepEqual(lines[0], { type: 'divider', character: '-' })
  assert.equal(lines[1].text, '')
  assert.equal(lines[2].text, 'Receipt')
})

test('fails loudly when an operation cannot be represented in the preview', () => {
  assert.throws(
    () => opsToReceiptLines([{ kind: 'qr', data: 'value' }], { width: 48 }),
    /cannot represent qr/
  )
})
