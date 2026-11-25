import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  findInstallationDuplicateConflict,
  validateInstallationActionForSourceKeys,
} from './installationDuplicateGuard.ts'
import { bundledOmpsInstallationSourceKeys } from './normalizeInstallationSourceKey.ts'
import { beginInstallationProgress, clearInstallationProgressState } from './installationProgressStore.ts'
import { installationSourceKeyFromSourceUrl } from './normalizeInstallationSourceKey.ts'
import { resetInstallationSourceLocksForTests } from './installationSourceLock.ts'
import { getSystemsRoot } from './paths.ts'

const SYSTEM_ID = 'ddb19ca9-6ae4-4e63-abb1-fa8af8d9127a'
const OTHER_ID = '42765375-a486-4541-8ef0-b028cb80556f'

async function withIsolatedSystemsRoot(run: () => Promise<void>): Promise<void> {
  const prev = process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
  const tempRoot = path.join(process.cwd(), '.tmp-duplicate-guard-test')
  process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = tempRoot
  await fs.rm(tempRoot, { recursive: true, force: true })
  await fs.mkdir(tempRoot, { recursive: true })
  try {
    await run()
  } finally {
    resetInstallationSourceLocksForTests()
    await fs.rm(tempRoot, { recursive: true, force: true })
    if (prev === undefined) delete process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
    else process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = prev
  }
}

async function writeFailedManifest(systemId: string, sourceUrl: string): Promise<void> {
  const root = path.join(getSystemsRoot(), systemId)
  await fs.mkdir(root, { recursive: true })
  await fs.writeFile(
    path.join(root, 'installation-manifest.json'),
    JSON.stringify(
      {
        ok: false,
        systemId,
        installDirectory: root,
        projectDirectory: path.join(root, 'project'),
        installedAt: '2026-01-01T00:00:00.000Z',
        sourceUrl,
      },
      null,
      2,
    ),
    'utf8',
  )
  await fs.writeFile(
    path.join(root, 'server-manifest-state.json'),
    JSON.stringify({ status: 'phases-failed', sourceUrl }, null, 2),
    'utf8',
  )
}

test('detecta instalação concluída com a mesma origem Git', async () => {
  await withIsolatedSystemsRoot(async () => {
    const sourceUrl = 'https://github.com/example/acomp.git'
    const root = path.join(getSystemsRoot(), SYSTEM_ID)
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(
      path.join(root, 'installation-manifest.json'),
      JSON.stringify(
        {
          ok: true,
          systemId: SYSTEM_ID,
          installDirectory: root,
          projectDirectory: path.join(root, 'project'),
          installedAt: '2026-01-02T00:00:00.000Z',
          sourceUrl,
        },
        null,
        2,
      ),
      'utf8',
    )

    const key = installationSourceKeyFromSourceUrl('https://github.com/example/acomp')
    const conflict = await findInstallationDuplicateConflict({ sourceKeys: [key] })
    assert.ok(conflict)
    assert.equal(conflict?.existing.systemId, SYSTEM_ID)
    assert.equal(conflict?.options.canOpen, true)
    assert.equal(conflict?.options.canResume, false)
  })
})

test('instalação in_progress obsoleta (sem job) ainda permite retomar e excluir', async () => {
  await withIsolatedSystemsRoot(async () => {
    const systemId = '84aa3a55-7150-4242-ab2e-114bdf637790'
    const root = path.join(getSystemsRoot(), systemId)
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(
      path.join(root, 'install-progress.snapshot.json'),
      JSON.stringify(
        {
          systemId,
          status: 'running',
          startedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          phases: [],
          currentPhaseId: null,
          percent: 10,
          elapsedMs: 0,
          estimatedRemainingMs: null,
        },
        null,
        2,
      ),
      'utf8',
    )
    await fs.writeFile(
      path.join(root, 'installation-manifest.json'),
      JSON.stringify(
        {
          ok: false,
          systemId,
          installDirectory: root,
          projectDirectory: path.join(root, 'project'),
          installedAt: '2026-01-01T00:00:00.000Z',
          sourceUrl: 'https://github.com/example/stale-running.git',
        },
        null,
        2,
      ),
      'utf8',
    )

    const key = installationSourceKeyFromSourceUrl('https://github.com/example/stale-running.git')
    const conflict = await findInstallationDuplicateConflict({ sourceKeys: [key] })
    assert.ok(conflict)
    assert.equal(conflict?.options.canResume, true)
    assert.equal(conflict?.options.canReplace, true)
  })
})

test('detecta instalação interrompida e permite retomar', async () => {
  await withIsolatedSystemsRoot(async () => {
    const sourceUrl = 'local-folder:C:\\omps-payload'
    await writeFailedManifest(SYSTEM_ID, sourceUrl)
    const key = installationSourceKeyFromSourceUrl('local-folder:c:/omps-payload')
    const conflict = await findInstallationDuplicateConflict({ sourceKeys: [key] })
    assert.ok(conflict)
    assert.equal(conflict?.existing.lifecycle, 'failed')
    assert.equal(conflict?.options.canResume, true)
  })
})

test('excludeSystemId evita falso positivo ao retomar o mesmo sistema', async () => {
  await withIsolatedSystemsRoot(async () => {
    const sourceUrl = 'https://github.com/example/acomp.git'
    await writeFailedManifest(SYSTEM_ID, sourceUrl)
    const key = installationSourceKeyFromSourceUrl(sourceUrl)
    const conflict = await findInstallationDuplicateConflict({
      sourceKeys: [key],
      excludeSystemId: SYSTEM_ID,
    })
    assert.equal(conflict, null)
  })
})

test('lock serializa verificações concorrentes para a mesma origem', async () => {
  await withIsolatedSystemsRoot(async () => {
    const sourceUrl = 'https://github.com/example/race.git'
    const key = installationSourceKeyFromSourceUrl(sourceUrl)
    const { withInstallationSourceLock } = await import('./installationSourceLock.ts')

    let active = 0
    let maxActive = 0
    const tasks = Array.from({ length: 4 }, () =>
      withInstallationSourceLock([key], async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
      }),
    )
    await Promise.all(tasks)
    assert.equal(maxActive, 1)
  })
})

test('detecta origem via checkpoint Docker sem manifesto', async () => {
  await withIsolatedSystemsRoot(async () => {
    const systemId = '91aa3a55-7150-4242-ab2e-114bdf637792'
    const root = path.join(getSystemsRoot(), systemId)
    const sourceUrl = 'local-folder:C:\\omps-payload-dir'
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(
      path.join(root, 'install-docker-pause.json'),
      JSON.stringify(
        {
          version: 1,
          reason: 'docker',
          savedAt: '2026-01-01T00:00:00.000Z',
          systemId,
          sourceUrl,
          plan: { projectName: 'OMPS Test' },
        },
        null,
        2,
      ),
      'utf8',
    )
    await fs.writeFile(
      path.join(root, 'install-progress.snapshot.json'),
      JSON.stringify(
        {
          systemId,
          status: 'awaiting_docker',
          startedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          phases: [],
          currentPhaseId: null,
          percent: 5,
          elapsedMs: 0,
          estimatedRemainingMs: null,
        },
        null,
        2,
      ),
      'utf8',
    )

    const key = installationSourceKeyFromSourceUrl('local-folder:c:/omps-payload-dir')
    const conflict = await findInstallationDuplicateConflict({ sourceKeys: [key] })
    assert.ok(conflict)
    assert.equal(conflict?.originMatch, 'proven')
    assert.equal(conflict?.existing.systemId, systemId)
  })
})

test('duas tentativas comprovadas marcam ambiguidade e listam candidatos', async () => {
  await withIsolatedSystemsRoot(async () => {
    const sourceUrl = 'https://github.com/example/dup.git'
    const key = installationSourceKeyFromSourceUrl(sourceUrl)
    for (const [systemId, lifecycle] of [
      ['11aa3a55-7150-4242-ab2e-114bdf637791', false],
      ['22aa3a55-7150-4242-ab2e-114bdf637792', false],
    ] as const) {
      const root = path.join(getSystemsRoot(), systemId)
      await fs.mkdir(root, { recursive: true })
      await fs.writeFile(
        path.join(root, 'installation-manifest.json'),
        JSON.stringify(
          {
            ok: lifecycle,
            systemId,
            installDirectory: root,
            projectDirectory: path.join(root, 'project'),
            installedAt: systemId.startsWith('11') ? '2026-01-01T00:00:00.000Z' : '2026-01-02T00:00:00.000Z',
            sourceUrl,
          },
          null,
          2,
        ),
        'utf8',
      )
    }

    const conflict = await findInstallationDuplicateConflict({ sourceKeys: [key] })
    assert.ok(conflict)
    assert.equal(conflict?.ambiguous, true)
    assert.equal(conflict?.candidates?.length, 2)
    assert.equal(conflict?.options.canResume, false)
    assert.equal(conflict?.options.canReplace, false)
  })
})

test('retomada rejeita systemId que não pertence à origem', async () => {
  await withIsolatedSystemsRoot(async () => {
    const sourceUrl = 'https://github.com/example/acomp.git'
    await writeFailedManifest(SYSTEM_ID, sourceUrl)
    const key = installationSourceKeyFromSourceUrl(sourceUrl)
    const validated = await validateInstallationActionForSourceKeys({
      systemId: OTHER_ID,
      action: 'resume',
      sourceKeys: [key],
    })
    assert.equal(validated.ok, false)
    if (!validated.ok) {
      assert.equal(validated.options.canResume, false)
      assert.ok((validated.candidates?.length ?? 0) >= 1)
    }
  })
})

test('substituição bloqueada para instalação realmente ativa em memória', async () => {
  await withIsolatedSystemsRoot(async () => {
    const sourceUrl = 'https://github.com/example/active.git'
    await writeFailedManifest(SYSTEM_ID, sourceUrl)
    beginInstallationProgress(SYSTEM_ID, [{ id: 'install.prepare', label: 'Prep' }])
    const key = installationSourceKeyFromSourceUrl(sourceUrl)
    const validated = await validateInstallationActionForSourceKeys({
      systemId: SYSTEM_ID,
      action: 'replace',
      sourceKeys: [key],
    })
    assert.equal(validated.ok, false)
    if (!validated.ok) assert.equal(validated.options.canReplace, false)
    clearInstallationProgressState(SYSTEM_ID)
  })
})

test('instalação concluída não é a única opção quando há interrupção mais recente (recomendação)', async () => {
  await withIsolatedSystemsRoot(async () => {
    const sourceUrl = 'https://github.com/example/priority.git'
    const key = installationSourceKeyFromSourceUrl(sourceUrl)
    const completedId = '31aa3a55-7150-4242-ab2e-114bdf637791'
    const interruptedId = '32aa3a55-7150-4242-ab2e-114bdf637792'
    for (const [systemId, ok] of [
      [completedId, true],
      [interruptedId, false],
    ] as const) {
      const root = path.join(getSystemsRoot(), systemId)
      await fs.mkdir(root, { recursive: true })
      await fs.writeFile(
        path.join(root, 'installation-manifest.json'),
        JSON.stringify(
          {
            ok,
            systemId,
            installDirectory: root,
            projectDirectory: path.join(root, 'project'),
            installedAt: '2026-01-02T00:00:00.000Z',
            sourceUrl,
          },
          null,
          2,
        ),
        'utf8',
      )
      if (!ok) {
        await fs.writeFile(
          path.join(root, 'install-progress.snapshot.json'),
          JSON.stringify(
            {
              systemId,
              status: 'interrupted',
              startedAt: '2026-01-03T00:00:00.000Z',
              updatedAt: '2026-01-03T00:00:00.000Z',
              phases: [],
              currentPhaseId: null,
              percent: 40,
              elapsedMs: 0,
              estimatedRemainingMs: null,
            },
            null,
            2,
          ),
          'utf8',
        )
      }
    }

    const conflict = await findInstallationDuplicateConflict({ sourceKeys: [key] })
    assert.ok(conflict)
    assert.equal(conflict?.ambiguous, true)
    assert.equal(conflict?.existing.systemId, interruptedId)
  })
})

test('pacote OMPS bundled reconhece duas chaves da mesma origem', async () => {
  await withIsolatedSystemsRoot(async () => {
    const payloadDir = 'C:\\Program Files\\ServidorManager\\omps-payload'
    const sha = 'e46ddf09ccf7312d5ef2fd42e35dfa7d6d74292d4a2c0042a87a411efe06cd78'
    const root = path.join(getSystemsRoot(), SYSTEM_ID)
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(
      path.join(root, 'installation-manifest.json'),
      JSON.stringify(
        {
          ok: false,
          systemId: SYSTEM_ID,
          installDirectory: root,
          projectDirectory: path.join(root, 'project'),
          installedAt: '2026-01-01T00:00:00.000Z',
          sourceUrl: `local-folder:${payloadDir}`,
        },
        null,
        2,
      ),
      'utf8',
    )
    const keys = bundledOmpsInstallationSourceKeys(payloadDir, sha)
    const conflict = await findInstallationDuplicateConflict({ sourceKeys: keys })
    assert.ok(conflict)
    assert.equal(conflict?.existing.systemId, SYSTEM_ID)
  })
})

test('não confunde systemId diferente sem origem em comum', async () => {
  await withIsolatedSystemsRoot(async () => {
    const root = path.join(getSystemsRoot(), OTHER_ID)
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(
      path.join(root, 'installation-manifest.json'),
      JSON.stringify(
        {
          ok: true,
          systemId: OTHER_ID,
          installDirectory: root,
          projectDirectory: path.join(root, 'project'),
          installedAt: '2026-01-02T00:00:00.000Z',
          sourceUrl: 'https://github.com/other/project.git',
        },
        null,
        2,
      ),
      'utf8',
    )

    const key = installationSourceKeyFromSourceUrl('https://github.com/unrelated/new.git')
    const conflict = await findInstallationDuplicateConflict({ sourceKeys: [key] })
    assert.equal(conflict, null)
  })
})
