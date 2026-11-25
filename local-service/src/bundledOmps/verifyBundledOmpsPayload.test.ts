import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { computeBundledPayloadContentSha256 } from './verifyBundledOmpsPayload.ts'
import { BUNDLE_META_SCHEMA } from './payloadFileSpec.ts'

test('isTrusted rejeita caminho fora do payload esperado', async () => {
  const { isTrustedBundledOmpsPayloadDirectory } = await import('./verifyBundledOmpsPayload.ts')
  const prev = process.env.SERVIDOR_MANAGER_INSTALL_ROOT
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-bundled-'))
  process.env.SERVIDOR_MANAGER_INSTALL_ROOT = tmp
  try {
    assert.equal(await isTrustedBundledOmpsPayloadDirectory(path.join(tmp, 'resources', 'omps-payload')), false)
    assert.equal(await isTrustedBundledOmpsPayloadDirectory(tmp), false)
  } finally {
    if (prev === undefined) delete process.env.SERVIDOR_MANAGER_INSTALL_ROOT
    else process.env.SERVIDOR_MANAGER_INSTALL_ROOT = prev
    await fs.rm(tmp, { recursive: true, force: true })
  }
})

test('verifyBundledOmpsPayloadAtInstallRoot valida hash do meta', async () => {
  const { verifyBundledOmpsPayloadAtInstallRoot } = await import('./verifyBundledOmpsPayload.ts')
  const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-bundled-ok-'))
  const payload = path.join(installRoot, 'resources', 'omps-payload')
  const bundle = path.join(installRoot, 'resources', 'omps-bundle')
  await fs.mkdir(path.join(payload, 'supabase'), { recursive: true })
  await fs.mkdir(path.join(payload, 'frontend'), { recursive: true })
  await fs.mkdir(path.join(payload, 'Transferir para Servidor'), { recursive: true })
  await fs.mkdir(path.join(payload, 'schemas'), { recursive: true })
  await fs.writeFile(path.join(payload, 'server-manifest.json'), '{}\n')
  await fs.writeFile(path.join(payload, 'supabase', 'config.toml'), '[project]\n')
  await fs.writeFile(path.join(payload, 'frontend', 'package.json'), '{"version":"1.0.0"}\n')
  await fs.writeFile(
    path.join(payload, 'Transferir para Servidor', 'aplicar-schema-local.sh'),
    '#!/bin/bash\n',
  )
  await fs.writeFile(path.join(payload, 'schemas', 'server-manifest.schema.json'), '{}\n')
  await fs.writeFile(path.join(payload, 'schemas', 'package.json'), '{}\n')

  const { sha256 } = await computeBundledPayloadContentSha256(payload)
  await fs.mkdir(bundle, { recursive: true })
  await fs.writeFile(
    path.join(bundle, 'bundle-meta.json'),
    `${JSON.stringify(
      {
        schema: BUNDLE_META_SCHEMA,
        productId: 'servidor-omps',
        ompsVersion: '1.0.0',
        ompsGitSha: null,
        payloadContentSha256: sha256,
      },
      null,
      2,
    )}\n`,
  )

  const result = await verifyBundledOmpsPayloadAtInstallRoot(installRoot)
  assert.equal(result.ok, true)
  await fs.rm(installRoot, { recursive: true, force: true })
})
