import assert from 'node:assert/strict'
import { assertSqlIdentifier, escapeIlikePattern, quoteSqlIdent } from './sqlIdentifiers.ts'

assert.throws(() => assertSqlIdentifier('bad-name', 'X'))
assert.equal(quoteSqlIdent('public'), '"public"')
assert.equal(escapeIlikePattern('100%'), '100\\%')
console.log('sqlIdentifiers.test.ts OK')
