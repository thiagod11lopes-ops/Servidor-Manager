import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { manifestRequiresDocker } from './manifestRequiresDocker.ts'
import type { ServerManifest } from './types.ts'

describe('manifestRequiresDocker', () => {
  it('supabase-local-v1 exige Docker', () => {
    const manifest = {
      manager: { backendProfile: 'supabase-local-v1' },
      requirements: {},
    } as ServerManifest
    assert.equal(manifestRequiresDocker(manifest), true)
  })

  it('manifesto genérico sem docker não exige', () => {
    const manifest = {
      manager: { backendProfile: 'legacy' },
      requirements: { git: { required: true } },
    } as ServerManifest
    assert.equal(manifestRequiresDocker(manifest), false)
  })
})
