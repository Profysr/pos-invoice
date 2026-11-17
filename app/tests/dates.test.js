import assert from 'node:assert/strict'
import test from 'node:test'
import { formatReceiptDate, formatReceiptTime, groupTrackingNumber } from '../src/shared/dates.js'

test('formats receipt dates with weekday and US order', () => {
  assert.equal(formatReceiptDate('2026-08-10'), 'Mon 08/10/2026')
  assert.equal(formatReceiptDate('2026-08-13'), 'Thu 08/13/2026')
  assert.equal(formatReceiptDate('2026-01-01'), 'Thu 01/01/2026')
  assert.equal(formatReceiptDate(''), '')
  assert.equal(formatReceiptDate('not-a-date'), '')
})

test('formats receipt times in 12-hour clock', () => {
  assert.equal(formatReceiptTime('18:06'), '6:06 PM')
  assert.equal(formatReceiptTime('06:06'), '6:06 AM')
  assert.equal(formatReceiptTime('00:30'), '12:30 AM')
  assert.equal(formatReceiptTime('12:00'), '12:00 PM')
  assert.equal(formatReceiptTime(''), '')
})

test('groups digit-only tracking numbers in fours', () => {
  assert.equal(
    groupTrackingNumber('9201990367007536409945'),
    '9201 9903 6700 7536 4099 45'
  )
  assert.equal(groupTrackingNumber('1234'), '1234')
  assert.equal(groupTrackingNumber('1Z999AA10123456784'), '1Z999AA10123456784')
  assert.equal(groupTrackingNumber(''), '')
})
