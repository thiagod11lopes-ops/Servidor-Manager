import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runManifestInstallDockerGate } from './installManifestDockerGate.ts'
import type { ServerManifest } from '../serverManifest/types.ts'

const manifestWithoutDocker: ServerManifest = {
  manifestVersion: '1',
  manager: { backendProfile: 'generic' },
  requirements: {},
} as ServerManifest

describe('runManifestInstallDockerGate', () => {
  it('manifesto sem Docker obrigatório não bloqueia', async () => {
    const result = await runManifestInstallDockerGate({ manifest: manifestWithoutDocker })
    assert.deepEqual(result, { ok: true })
  })
})
