import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { redactSupabaseCliOutput } from './redactSupabaseCliOutput.ts'

describe('redactSupabaseCliOutput', () => {
  it('redige sb_secret e chaves tabulares', () => {
    const raw = `│ Secret      │ sb_secret_EXAMPLEONLY_not_a_real_key_000      │
Secret Key │ aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899 │`
    const redacted = redactSupabaseCliOutput(raw)
    assert.doesNotMatch(redacted, /sb_secret_EXAMPLEONLY/)
    assert.doesNotMatch(redacted, /aabbccddeeff0011/)
    assert.match(redacted, /REDACTED/)
  })
})
