import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs/promises'
import {
  beginInstallationProgress,
  beginInstallationProgressForAttempt,
  clearInstallationProgressState,
  computeInstallProgressPercent,
  estimateRemainingMs,
  getInstallationProgress,
  markInstallationAwaitingDocker,
  markInstallationPhaseCompleted,
  markInstallationPhaseFailed,
  markInstallationPhaseRunning,
  markInstallationResumedFromDockerWait,
} from './installationProgressStore.ts'
import {
  drainInstallationProgressWrites,
  getInstallationProgressSnapshotPath,
} from './installationProgressPersistence.ts'

describe('installationProgressStore', () => {
  it('percentual só avança com fases concluídas ou ignoradas', () => {
    const phases = [
      { id: 'a', label: 'A', status: 'completed' as const },
      { id: 'b', label: 'B', status: 'running' as const },
      { id: 'c', label: 'C', status: 'pending' as const },
    ]
    assert.equal(computeInstallProgressPercent(phases), 42)
  })

  it('estima tempo restante após ao menos uma fase concluída', () => {
    const phases = [
      {
        id: 'a',
        label: 'A',
        status: 'completed' as const,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:02:00.000Z',
      },
      { id: 'b', label: 'B', status: 'pending' as const },
    ]
    assert.equal(estimateRemainingMs(phases, 120_000), 120_000)
  })

  it('inicializa progresso em execução', () => {
    const systemId = '74aa3a55-7150-4242-ab2e-114bdf637789'
    const snap = beginInstallationProgress(systemId, [{ id: 'step-1', label: 'Passo 1' }])
    assert.equal(snap.status, 'running')
    assert.equal(snap.percent, 0)
    markInstallationPhaseRunning(systemId, 'step-1')
    markInstallationPhaseCompleted(systemId, 'step-1')
  })

  it('retoma tentativa preservando fases concluídas no disco', async () => {
    const systemId = '94aa3a55-7150-4242-ab2e-114bdf637791'
    beginInstallationProgress(systemId, [
      { id: 'install.prepare', label: 'Prep' },
      { id: 'install.git-clone', label: 'Clone' },
    ])
    markInstallationPhaseCompleted(systemId, 'install.prepare')
    markInstallationPhaseRunning(systemId, 'install.git-clone')
    markInstallationPhaseFailed(systemId, 'install.git-clone', 'falha git')
    await drainInstallationProgressWrites(systemId)
    const snapPath = getInstallationProgressSnapshotPath(systemId)
    const raw = await fs.readFile(snapPath, 'utf8')
    assert.match(raw, /"status": "failed"/)

    const resumed = await beginInstallationProgressForAttempt(systemId, [
      { id: 'install.prepare', label: 'Prep' },
      { id: 'install.git-clone', label: 'Clone' },
    ])
    assert.equal(resumed.phases.find((p) => p.id === 'install.prepare')?.status, 'completed')
    assert.equal(resumed.phases.find((p) => p.id === 'install.git-clone')?.status, 'pending')
    assert.ok(resumed.percent > 0)

    clearInstallationProgressState(systemId)
  })

  it('pausa aguardando Docker sem marcar falha', () => {
    const systemId = '84aa3a55-7150-4242-ab2e-114bdf637790'
    beginInstallationProgress(systemId, [{ id: 'install.prerequisites', label: 'Pré-requisitos' }])
    markInstallationPhaseRunning(systemId, 'install.prerequisites')
    markInstallationAwaitingDocker(systemId, 'install.prerequisites', 'DOCKER NECESSÁRIO, INICIE DOCKER PARA CONTINUAR')
    const paused = getInstallationProgress(systemId)
    assert.equal(paused?.status, 'awaiting_docker')
    assert.equal(paused?.failedPhaseId, undefined)
    markInstallationResumedFromDockerWait(systemId)
    assert.equal(getInstallationProgress(systemId)?.status, 'running')
  })
})
