import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  findCurrentInstallPhase,
  formatInstallElapsed,
  formatInstallEta,
  partitionInstallPhases,
} from './installationProgressDisplay.ts'
import type { InstallationProgressSnapshot } from '../types/installationProgress.ts'

function snapshot(partial: Partial<InstallationProgressSnapshot>): InstallationProgressSnapshot {
  return {
    systemId: 'test',
    status: 'running',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phases: [],
    currentPhaseId: null,
    percent: 0,
    elapsedMs: 0,
    estimatedRemainingMs: null,
    ...partial,
  }
}

describe('installationProgressDisplay', () => {
  it('formata tempo decorrido', () => {
    assert.equal(formatInstallElapsed(65_000), '1m 05s')
  })

  it('informa quando a estimativa ainda não está disponível', () => {
    assert.match(formatInstallEta(snapshot({ estimatedRemainingMs: null })), /calculada/i)
  })

  it('identifica fase atual e partições', () => {
    const phases = [
      { id: 'a', label: 'A', status: 'completed' as const },
      { id: 'b', label: 'B', status: 'running' as const },
      { id: 'c', label: 'C', status: 'pending' as const },
    ]
    const snap = snapshot({ phases, currentPhaseId: 'b', percent: 33 })
    assert.equal(findCurrentInstallPhase(snap)?.id, 'b')
    const parts = partitionInstallPhases(phases)
    assert.equal(parts.completed.length, 1)
    assert.equal(parts.pending.length, 1)
  })
})
