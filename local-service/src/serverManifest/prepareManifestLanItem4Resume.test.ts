import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { ServerManifest } from './types.ts'
import { prepareManifestLanItem4Resume } from './prepareManifestLanItem4Resume.ts'

const minimalManifest = {
  configuration: { singleSourceOfTruthRelativePath: 'Transferir para Servidor/servidor.env' },
  scripts: { items: [] },
} as unknown as ServerManifest

test('prepareManifestLanItem4Resume remove skip de firewall e fases LAN em mismatch de porta', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-item4-resume-'))
  const envRel = 'Transferir para Servidor/servidor.env'
  await fs.mkdir(path.dirname(path.join(root, envRel)), { recursive: true })
  await fs.writeFile(path.join(root, envRel), 'ACOMOPMS_HTTP_PORT=9090\n', 'utf8')
  await fs.mkdir(path.join(root, 'frontend', 'dist'), { recursive: true })
  await fs.writeFile(
    path.join(root, 'frontend', 'dist', 'lan-build.json'),
    `${JSON.stringify({ httpPort: 8080 })}\n`,
    'utf8',
  )

  const skip = new Set([
    'network.firewall',
    'network.block-internal-ports',
    'frontend.build',
    'proxy.start',
  ])
  const messages: string[] = []

  await prepareManifestLanItem4Resume({
    systemId: 'test-system',
    projectDirectory: root,
    sourceUrl: 'https://github.com/example/repo',
    manifest: minimalManifest,
    skipCompletedPhaseIds: skip,
    messages,
  })

  assert.equal(skip.has('network.firewall'), false)
  assert.equal(skip.has('network.block-internal-ports'), false)
  assert.equal(skip.has('frontend.build'), false)
  assert.equal(skip.has('proxy.start'), false)
  assert.ok(messages.some((m) => m.includes('9090') && m.includes('8080')))
})
