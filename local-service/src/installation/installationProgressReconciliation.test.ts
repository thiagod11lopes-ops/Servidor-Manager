import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  reconcileInstallationProgressForSystem,
  reconcilePersistedProgressSnapshot,
} from './installationProgressReconciliation.ts'
import {
  getInstallationProgressSnapshotPath,
  persistInstallationProgressSnapshot,
} from './installationProgressPersistence.ts'
import { clearInstallationProgressState } from './installationProgressStore.ts'

const systemId = 'a1b2c3d4-e5f6-4789-abcd-ef1234567890'

async function withIsolatedSystemsRoot(run: () => Promise<void>): Promise<void> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-progress-reconcile-'))
  const prev = process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
  process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = tempRoot
  try {
    await run()
  } finally {
    if (prev === undefined) delete process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
    else process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = prev
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
}

test('running persistido sem job vira interrupted', () => {
  const next = reconcilePersistedProgressSnapshot(
    {
      systemId,
      status: 'running',
      startedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      phases: [{ id: 'install.prepare', label: 'Prep', status: 'running' }],
      currentPhaseId: 'install.prepare',
      percent: 10,
      elapsedMs: 100,
      estimatedRemainingMs: 1000,
    },
    { hasDockerPauseCheckpoint: false, manifestOk: null },
  )
  assert.equal(next.status, 'interrupted')
  assert.match(next.error ?? '', /47831|reiniciou|encerrou/i)
})

test('succeeded sem manifesto ok vira partial', () => {
  const next = reconcilePersistedProgressSnapshot(
    {
      systemId,
      status: 'succeeded',
      startedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      phases: [],
      currentPhaseId: null,
      percent: 100,
      elapsedMs: 1,
      estimatedRemainingMs: null,
    },
    { hasDockerPauseCheckpoint: false, manifestOk: false },
  )
  assert.equal(next.status, 'partial')
})

test('reconcileInstallationProgressForSystem persiste interrupted no disco', async () => {
  await withIsolatedSystemsRoot(async () => {
    await fs.mkdir(path.dirname(getInstallationProgressSnapshotPath(systemId)), { recursive: true })
    await persistInstallationProgressSnapshot({
      systemId,
      status: 'running',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phases: [{ id: 'backend.restart', label: 'Restart', status: 'running' }],
      currentPhaseId: 'backend.restart',
      percent: 46,
      elapsedMs: 1000,
      estimatedRemainingMs: null,
    })

    const changed = await reconcileInstallationProgressForSystem(systemId)
    assert.equal(changed, true)
    const raw = JSON.parse(await fs.readFile(getInstallationProgressSnapshotPath(systemId), 'utf8')) as {
      status: string
    }
    assert.equal(raw.status, 'interrupted')

    await fs.unlink(getInstallationProgressSnapshotPath(systemId)).catch(() => {})
    clearInstallationProgressState(systemId)
  })
})
