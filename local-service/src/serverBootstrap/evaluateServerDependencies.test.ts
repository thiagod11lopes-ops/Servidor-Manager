import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildPhaseExecutionPlan } from '../serverManifest/buildPhaseExecutionPlan.ts'
import { evaluateServerDependencies } from './evaluateServerDependencies.ts'
import { REFERENCE_SUPABASE_LOCAL_MANIFEST } from './referenceSupabaseLocalManifest.ts'

const bootstrapInput = {
  manifest: REFERENCE_SUPABASE_LOCAL_MANIFEST,
  wingetAvailable: true,
  wslAvailable: false,
  isAdmin: false,
}

describe('REFERENCE_SUPABASE_LOCAL_MANIFEST', () => {
  it('marca database.schema como fase run que exige bash no Windows', () => {
    const plan = buildPhaseExecutionPlan(REFERENCE_SUPABASE_LOCAL_MANIFEST, {
      platform: 'windows',
      overlayEnabled: false,
    })
    const schema = plan.phases.find((phase) => phase.phase.id === 'database.schema')
    assert.equal(schema?.status, 'run')
    assert.match(schema?.note ?? '', /bash/i)
  })
})

describe('evaluateServerDependencies — bash (Windows)', () => {
  it('registra bash ausente quando não há executável funcional', async () => {
    if (process.platform !== 'win32') return

    const result = await evaluateServerDependencies({
      ...bootstrapInput,
      bashAvailableForTest: false,
    })
    const bash = result.dependencies.find((item) => item.id === 'bash')
    assert.equal(bash?.critical, true)
    assert.equal(bash?.state, 'missing')
    assert.equal(result.criticalOk, false)
  })

  it('registra bash ok quando há executável funcional', async () => {
    if (process.platform !== 'win32') return

    const result = await evaluateServerDependencies({
      ...bootstrapInput,
      bashAvailableForTest: true,
    })
    const bash = result.dependencies.find((item) => item.id === 'bash')
    assert.equal(bash?.state, 'ok')

    const baseline = await evaluateServerDependencies(bootstrapInput)
    if (baseline.criticalOk) {
      assert.equal(result.criticalOk, true)
    }
  })
})
