import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  clearInstallationProgressState,
  ensureInstallationProgressHydrated,
  getInstallationProgress,
} from './installationProgressStore.ts'
import {
  getInstallationProgressSnapshotPath,
  persistInstallationProgressSnapshot,
} from './installationProgressPersistence.ts'

const systemId = 'c3d4e5f6-a7b8-4242-9cde-f12345678902'

async function withIsolatedSystemsRoot(run: () => Promise<void>): Promise<void> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-progress-persist-'))
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

describe('installationProgressPersistence', () => {
  it('marca running persistido como interrupted após reinício do serviço', async () => {
    await withIsolatedSystemsRoot(async () => {
      await fs.mkdir(path.dirname(getInstallationProgressSnapshotPath(systemId)), { recursive: true })
      await persistInstallationProgressSnapshot({
        systemId,
        status: 'running',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        phases: [{ id: 'install.git-clone', label: 'Clone', status: 'running' }],
        currentPhaseId: 'install.git-clone',
        percent: 12,
        elapsedMs: 1000,
        estimatedRemainingMs: null,
      })

      await ensureInstallationProgressHydrated(systemId)
      const snap = getInstallationProgress(systemId)
      assert.equal(snap?.status, 'interrupted')
      assert.match(snap?.error ?? '', /47831/)

      await fs.unlink(getInstallationProgressSnapshotPath(systemId)).catch(() => {})
      clearInstallationProgressState(systemId)
    })
  })
})
