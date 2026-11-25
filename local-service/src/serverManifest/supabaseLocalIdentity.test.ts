import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applySupabasePortBlockToConfig,
  configMatchesSupabasePortBlock,
  isGenericSupabaseProjectId,
  managerSupabaseProjectId,
  parseSupabaseApiPortFromConfig,
  pickSupabasePortBlockIndex,
  setSupabaseProjectIdInConfig,
  supabaseDefaultPortBlockIsTaken,
  supabasePortBlockHostPorts,
} from './supabaseLocalIdentity.ts'

describe('managerSupabaseProjectId', () => {
  it('gera id estável a partir do systemId', () => {
    assert.equal(
      managerSupabaseProjectId('42765375-a486-4541-8ef0-b028cb80556f'),
      'sm42765375a486',
    )
  })
})

describe('isGenericSupabaseProjectId', () => {
  it('detecta workspace', () => {
    assert.equal(isGenericSupabaseProjectId('workspace'), true)
    assert.equal(isGenericSupabaseProjectId('sm42765375a486'), false)
  })
})

describe('config.toml helpers', () => {
  const sample = `project_id = "workspace"

[api]
port = 54321

[db]
port = 54322
shadow_port = 54320
`

  it('altera project_id', () => {
    const next = setSupabaseProjectIdInConfig(sample, 'sm42765375a486')
    assert.match(next, /project_id = "sm42765375a486"/)
  })

  it('altera project_id em config CRLF sem colapsar linhas (regressão CliConfigParseError)', () => {
    const withComment = `# working directory name when running \`supabase init\`.\n${sample}`
    const crlf = withComment.replace(/\n/g, '\r\n')
    const next = setSupabaseProjectIdInConfig(crlf, 'sm9fca4c13cf47')
    assert.match(next, /project_id = "sm9fca4c13cf47"/)
    assert.doesNotMatch(next, /init`\.[^\n]*project_id/)
    assert.match(next, /init`\.\nproject_id = "sm9fca4c13cf47"/)
  })

  it('aplica bloco de portas', () => {
    const next = applySupabasePortBlockToConfig(sample, 1)
    assert.equal(parseSupabaseApiPortFromConfig(next), 54421)
  })

  it('aplica bloco de portas incluindo analytics (54327+N×100)', () => {
    const withAnalytics = `${sample}\n[analytics]\nenabled = true\nport = 54327\n`
    const next = applySupabasePortBlockToConfig(withAnalytics, 1)
    assert.match(next, /\[analytics\][\s\S]*port = 54427/m)
    assert.equal(configMatchesSupabasePortBlock(next, 1), true)
  })
})

describe('pickSupabasePortBlockIndex', () => {
  it('ignora bloco 0 ocupado e escolhe o próximo', () => {
    assert.equal(pickSupabasePortBlockIndex(new Set([54321])), 1)
  })

  it('escolhe bloco 1 quando só a porta DB padrão (54322) está ocupada', () => {
    assert.equal(pickSupabasePortBlockIndex(new Set([54322])), 1)
  })

  it('bloco 0 exige faixa completa livre (inclui analytics 54327)', () => {
    assert.deepEqual(supabasePortBlockHostPorts(0).includes(54327), true)
    assert.equal(pickSupabasePortBlockIndex(new Set([54327])), 1)
  })

  it('retorna null quando não há faixa livre', () => {
    const full = new Set<number>()
    for (let block = 0; block < 40; block += 1) {
      full.add(54321 + block * 100)
    }
    assert.equal(pickSupabasePortBlockIndex(full), null)
  })
})

describe('supabaseDefaultPortBlockIsTaken', () => {
  it('detecta ocupação parcial do bloco 0 (só DB)', () => {
    assert.equal(supabaseDefaultPortBlockIsTaken(new Set([54322])), true)
    assert.equal(supabaseDefaultPortBlockIsTaken(new Set([59999])), false)
  })
})
