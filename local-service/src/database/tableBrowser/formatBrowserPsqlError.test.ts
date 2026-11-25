import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatBrowserPsqlError } from './formatBrowserPsqlError.ts'

describe('formatBrowserPsqlError', () => {
  it('oculta dump do psql em falha de conexão', () => {
    const raw =
      'Command failed: psql postgresql://postgres:postgres@127.0.0.1:54322/postgres ... fechou a conex'
    const msg = formatBrowserPsqlError(raw, 'CONNECTION_FAILED')
    assert.match(msg, /Sistemas/)
    assert.doesNotMatch(msg, /SELECT table_schema/)
  })
})
