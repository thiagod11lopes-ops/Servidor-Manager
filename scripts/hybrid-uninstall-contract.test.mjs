import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('HybridLocalManagerService não usa mock de desinstalação fora do Vite dev', () => {
  const hybrid = fs.readFileSync(path.join(root, 'src', 'services', 'hybridLocalManagerService.ts'), 'utf8')
  const uninstallBlock = hybrid.slice(hybrid.indexOf('async uninstallSystem('))
  assert.match(
    uninstallBlock,
    /allowMockApiFallback\(\)/,
    'uninstallSystem deve respeitar allowMockApiFallback antes de cair no mock',
  )
  assert.doesNotMatch(
    uninstallBlock.slice(0, uninstallBlock.indexOf('async analyzeSystem')),
    /catch\s*\{\s*return this\.fallback\.uninstallSystem/,
    'não deve cair direto no mock sem guarda',
  )
})

test('httpLocalManagerClient.uninstallSystem trata falhas sem propagar exceção genérica ao mock', () => {
  const client = fs.readFileSync(path.join(root, 'src', 'services', 'httpLocalManagerClient.ts'), 'utf8')
  const block = client.slice(client.indexOf('async uninstallSystem('), client.indexOf('async runManifestBackup'))
  assert.match(block, /formatLocalServiceCommunicationError/)
  assert.match(block, /catch \(error\)/)
})
