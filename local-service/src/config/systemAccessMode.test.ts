import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSystemAccessMode } from './systemAccessMode.ts'

test('parseSystemAccessMode accepts local and lan only', () => {
  assert.equal(parseSystemAccessMode('local'), 'local')
  assert.equal(parseSystemAccessMode('lan'), 'lan')
  assert.equal(parseSystemAccessMode('internet'), null)
  assert.equal(parseSystemAccessMode(null), null)
})
