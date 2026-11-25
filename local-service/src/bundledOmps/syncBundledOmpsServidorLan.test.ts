import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { computeBundledPayloadContentSha256 } from './verifyBundledOmpsPayload.ts'
import { BUNDLE_META_SCHEMA } from './payloadFileSpec.ts'

test('syncBundledOmpsServidorLan copia start-servidor-lan do payload verificado', async () => {
  const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-omps-install-'))
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-omps-project-'))
  const payload = path.join(installRoot, 'resources', 'omps-payload')
  const lanRel = path.join('Transferir para Servidor', 'servidor-lan')
  await fs.mkdir(path.join(payload, lanRel), { recursive: true })
  const marker = path.join(payload, lanRel, 'start-servidor-lan.ps1')
  await fs.writeFile(marker, 'Start-CaddyLanProcess test-marker', 'utf8')
  await fs.mkdir(path.join(payload, 'supabase'), { recursive: true })
  await fs.mkdir(path.join(payload, 'frontend'), { recursive: true })
  await fs.mkdir(path.join(payload, 'schemas'), { recursive: true })
  await fs.writeFile(path.join(payload, 'server-manifest.json'), '{}\n')
  await fs.writeFile(path.join(payload, 'supabase', 'config.toml'), '[project]\n')
  await fs.writeFile(path.join(payload, 'frontend', 'package.json'), '{"version":"1"}\n')
  await fs.writeFile(path.join(payload, 'schemas', 'server-manifest.schema.json'), '{}\n')
  await fs.writeFile(path.join(payload, 'schemas', 'package.json'), '{}\n')
  await fs.writeFile(
    path.join(payload, 'Transferir para Servidor', 'aplicar-schema-local.sh'),
    '#!/bin/sh\n',
  )

  const { sha256 } = await computeBundledPayloadContentSha256(payload)
  await fs.mkdir(path.join(installRoot, 'resources', 'omps-bundle'), { recursive: true })
  await fs.writeFile(
    path.join(installRoot, 'resources', 'omps-bundle', 'bundle-meta.json'),
    `${JSON.stringify({
      schema: BUNDLE_META_SCHEMA,
      productId: 'servidor-omps',
      payloadContentSha256: sha256,
      ompsVersion: '0.0.0',
    })}\n`,
  )

  process.env.SERVIDOR_MANAGER_INSTALL_ROOT = installRoot
  process.env.SM_RESOURCES_PATH = path.join(installRoot, 'resources')

  const { syncBundledOmpsServidorLanToProject } = await import('./syncBundledOmpsServidorLan.ts')
  const result = await syncBundledOmpsServidorLanToProject({
    projectDirectory: project,
    payloadSourceDirectory: payload,
  })
  assert.equal(result.ok, true)
  if (!result.ok) assert.fail(result.message)
  if (!result.synced) assert.fail(result.reason)
  const copied = await fs.readFile(path.join(project, lanRel, 'start-servidor-lan.ps1'), 'utf8')
  assert.match(copied, /Start-CaddyLanProcess test-marker/)
})
