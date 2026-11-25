import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildPhaseExecutionPlan } from './buildPhaseExecutionPlan.ts'
import type { ServerManifest } from './types.ts'

const manifest = {
  installPlan: {
    phases: [
      {
        id: 'network.firewall',
        type: 'script',
        scriptId: 'firewall-lan-windows',
        platforms: ['windows'],
        description: 'Firewall LAN',
      },
    ],
  },
  scripts: {
    items: [
      {
        id: 'firewall-lan-windows',
        path: 'x.ps1',
        platforms: ['windows'],
        interpreter: 'powershell',
      },
    ],
  },
} as unknown as ServerManifest

describe('buildPhaseExecutionPlan — network.firewall linux', () => {
  it('substitui fase Windows por capability Manager no Linux', () => {
    const plan = buildPhaseExecutionPlan(manifest, { platform: 'linux' })
    assert.equal(plan.phases.length, 1)
    assert.equal(plan.phases[0]?.status, 'run')
    assert.equal(plan.phases[0]?.resolution?.kind, 'capability')
    if (plan.phases[0]?.resolution?.kind === 'capability') {
      assert.equal(plan.phases[0].resolution.capability, 'manager.lan-firewall-linux')
    }
  })
})
