#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadServidorOmpsProductSource, normalizeLanAccessFromProduct } from './omps-fixed-lan-contract.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const clienteDir = join(root, 'AcompSolemp-cursor-servidor-lan-etapa16-bcc8/Instalador OPMS/cliente')

function main() {
  const product = loadServidorOmpsProductSource()
  const lan = normalizeLanAccessFromProduct(product)
  if (lan.lanHostMode !== 'auto' && lan.lanHostMode !== 'local' && lan.lanHostMode !== 'fixed') {
    throw new Error('Produto OMPS Usuário: lanHostMode inválido no contrato')
  }
  if (lan.requiredHttpPort !== 8080 || lan.discoveryUdpPort !== 47808 || lan.allowHttpPortFallback !== true) {
    throw new Error('Contrato inválido (HTTP preferida 8080 + fallback, UDP 47808)')
  }
  if (!existsSync(join(clienteDir, 'package.json'))) {
    throw new Error(`Cliente ausente: ${clienteDir}`)
  }
  console.log(`[omps-usuario] contrato OK → lanHostMode=${lan.lanHostMode}, HTTP 8080, UDP :47808`)
  const r = spawnSync('npm', ['ci', '--no-fund', '--no-audit'], {
    cwd: clienteDir,
    stdio: 'inherit',
    shell: true,
  })
  if (r.status !== 0) throw new Error('npm ci falhou em Instalador OPMS/cliente')
  console.log('[omps-usuario] dependências do cliente OK')
}

main()
