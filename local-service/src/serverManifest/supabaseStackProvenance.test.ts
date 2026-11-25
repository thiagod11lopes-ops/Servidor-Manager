import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { evaluateSupabaseStackProvenance } from './supabaseStackProvenance.ts'

const SYSTEM = '42765375-a486-4541-8ef0-b028cb80556f'
const ROOT = `C:\\ServidorManager\\systems\\${SYSTEM}\\project`

describe('evaluateSupabaseStackProvenance', () => {
  it('aceita stack alinhada (propriedade correta)', () => {
    const verdict = evaluateSupabaseStackProvenance({
      systemId: SYSTEM,
      rootDirectory: ROOT,
      configProjectId: 'sm42765375a486',
      identityProjectId: 'sm42765375a486',
      identityLegacyGeneric: false,
      dockerWorkdir: ROOT,
      dockerCliProject: 'sm42765375a486',
      ownerSystemId: SYSTEM,
      foreignActive: null,
    })
    assert.equal(verdict.ok, true)
    if (verdict.ok) assert.equal(verdict.running, true)
  })

  it('rejeita proprietário estrangeiro ativo', () => {
    const verdict = evaluateSupabaseStackProvenance({
      systemId: SYSTEM,
      rootDirectory: ROOT,
      configProjectId: 'workspace',
      identityProjectId: 'workspace',
      identityLegacyGeneric: true,
      dockerWorkdir: 'C:\\ServidorManager\\systems\\other\\project',
      dockerCliProject: 'workspace',
      ownerSystemId: '300442b8-0a0c-443c-a2dd-4fcdb69fa825',
      foreignActive: {
        foreignSystemId: '300442b8-0a0c-443c-a2dd-4fcdb69fa825',
        foreignProjectRoot: 'C:\\ServidorManager\\systems\\other\\project',
        foreignStatus: 'installed-lan',
      },
    })
    assert.equal(verdict.ok, false)
    if (!verdict.ok) assert.match(verdict.reason, /outra instalação ativa/i)
  })

  it('rejeita project_id incompatível config vs identidade', () => {
    const verdict = evaluateSupabaseStackProvenance({
      systemId: SYSTEM,
      rootDirectory: ROOT,
      configProjectId: 'workspace',
      identityProjectId: 'sm42765375a486',
      identityLegacyGeneric: false,
      dockerWorkdir: null,
      dockerCliProject: null,
      ownerSystemId: null,
      foreignActive: null,
    })
    assert.equal(verdict.ok, false)
    if (!verdict.ok) assert.match(verdict.reason, /difere do registrado/i)
  })

  it('permite stack parada (proprietário indeterminado no Docker)', () => {
    const verdict = evaluateSupabaseStackProvenance({
      systemId: SYSTEM,
      rootDirectory: ROOT,
      configProjectId: 'sm42765375a486',
      identityProjectId: 'sm42765375a486',
      identityLegacyGeneric: false,
      dockerWorkdir: null,
      dockerCliProject: null,
      ownerSystemId: null,
      foreignActive: null,
    })
    assert.equal(verdict.ok, true)
    if (verdict.ok) assert.equal(verdict.running, false)
  })

  it('rejeita workdir Docker de outro systemId sem instalação ativa', () => {
    const verdict = evaluateSupabaseStackProvenance({
      systemId: SYSTEM,
      rootDirectory: ROOT,
      configProjectId: 'sm42765375a486',
      identityProjectId: 'sm42765375a486',
      identityLegacyGeneric: false,
      dockerWorkdir: 'C:\\ServidorManager\\systems\\other\\project',
      dockerCliProject: 'sm42765375a486',
      ownerSystemId: '300442b8-0a0c-443c-a2dd-4fcdb69fa825',
      foreignActive: null,
    })
    assert.equal(verdict.ok, false)
    if (!verdict.ok) assert.match(verdict.reason, /workdir não corresponde|systemId/)
  })

  it('rejeita workdir Docker divergente do clone', () => {
    const verdict = evaluateSupabaseStackProvenance({
      systemId: SYSTEM,
      rootDirectory: ROOT,
      configProjectId: 'sm42765375a486',
      identityProjectId: 'sm42765375a486',
      identityLegacyGeneric: false,
      dockerWorkdir: 'C:\\ServidorManager\\systems\\other\\project',
      dockerCliProject: 'sm42765375a486',
      ownerSystemId: SYSTEM,
      foreignActive: null,
    })
    assert.equal(verdict.ok, false)
    if (!verdict.ok) assert.match(verdict.reason, /workdir não corresponde/i)
  })
})
