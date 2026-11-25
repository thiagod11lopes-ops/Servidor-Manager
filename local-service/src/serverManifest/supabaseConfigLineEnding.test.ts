import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  applySupabasePortBlockToConfig,
  setSupabaseProjectIdInConfig,
} from './supabaseLocalIdentity.ts'

const sampleLf = `# comment line
project_id = "workspace"

[api]
port = 54321
`

test('setSupabaseProjectIdInConfig preserves line breaks with CRLF input', () => {
  const crlf = sampleLf.replace(/\n/g, '\r\n')
  const next = setSupabaseProjectIdInConfig(crlf, 'sm9fca4c13cf47')
  assert.match(next, /project_id = "sm9fca4c13cf47"/)
  assert.doesNotMatch(next, /comment line[^\n]*project_id/)
  assert.match(next, /comment line\r?\nproject_id/)
})

test('applySupabasePortBlockToConfig keeps valid TOML structure after CRLF round-trip', () => {
  const crlf = sampleLf.replace(/\n/g, '\r\n')
  let next = setSupabaseProjectIdInConfig(crlf, 'sm9fca4c13cf47')
  next = applySupabasePortBlockToConfig(next, 1)
  assert.match(next, /port = 54421/)
  assert.doesNotMatch(next, /comment line[^\n]*project_id/)
})
