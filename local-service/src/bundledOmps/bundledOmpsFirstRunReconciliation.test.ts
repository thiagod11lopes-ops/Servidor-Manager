import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { reconcileBundledOmpsFirstRunOnStartup } from './bundledOmpsFirstRunReconciliation.ts'
import { readBundledOmpsFirstRunRecord, writeBundledOmpsFirstRunStarted } from './bundledOmpsFirstRunStore.ts'
import { getManifestPath } from '../installation/paths.ts'

const systemId = 'b2c3d4e5-f6a7-4789-bcde-f12345678901'

async function withIsolatedManagerData(run: () => Promise<void>): Promise<void> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-first-run-'))
  const prev = process.env.SERVIDOR_MANAGER_DATA_ROOT
  const prevSystems = process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
  process.env.SERVIDOR_MANAGER_DATA_ROOT = tempRoot
  delete process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
  try {
    await run()
  } finally {
    if (prev === undefined) delete process.env.SERVIDOR_MANAGER_DATA_ROOT
    else process.env.SERVIDOR_MANAGER_DATA_ROOT = prev
    if (prevSystems === undefined) delete process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
    else process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = prevSystems
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
}

test('first-run incompleto ganha completedAt quando manifesto ok', async () => {
  await withIsolatedManagerData(async () => {
    await fs.mkdir(path.dirname(getManifestPath(systemId)), { recursive: true })
    await writeBundledOmpsFirstRunStarted({
      installRoot: 'C:\\Program Files\\Servidor OMPS',
      bundleContentSha256: 'abc',
      systemId,
      accessMode: 'local',
    })
    await fs.writeFile(
      getManifestPath(systemId),
      JSON.stringify({ ok: true, systemId }, null, 2),
      'utf8',
    )

    await reconcileBundledOmpsFirstRunOnStartup()
    const after = await readBundledOmpsFirstRunRecord()
    assert.ok(after?.completedAt)
  })
})

test('first-run não repointa silenciosamente para outro systemId', async () => {
  await withIsolatedManagerData(async () => {
    const firstId = 'd4e5f6a7-b8c9-4789-bcde-f12345678903'
    const secondId = 'e5f6a7b8-c9d0-4789-bcde-f12345678904'
    await writeBundledOmpsFirstRunStarted({
      installRoot: 'C:\\Program Files\\Servidor OMPS',
      bundleContentSha256: 'abc',
      systemId: firstId,
      accessMode: 'local',
    })
    const second = await writeBundledOmpsFirstRunStarted({
      installRoot: 'C:\\Program Files\\Servidor OMPS',
      bundleContentSha256: 'abc',
      systemId: secondId,
      accessMode: 'local',
    })
    assert.equal(second.written, false)
    const record = await readBundledOmpsFirstRunRecord()
    assert.equal(record?.systemId, firstId)
  })
})

test('first-run órfão (pasta do sistema ausente) é removido', async () => {
  await withIsolatedManagerData(async () => {
    await writeBundledOmpsFirstRunStarted({
      installRoot: 'C:\\Program Files\\Servidor OMPS',
      bundleContentSha256: 'abc',
      systemId,
      accessMode: 'local',
    })

    await reconcileBundledOmpsFirstRunOnStartup()
    assert.equal(await readBundledOmpsFirstRunRecord(), null)
  })
})
