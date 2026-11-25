#!/usr/bin/env node
/**
 * Copia o win-unpacked do OMPS Usuário para dentro do Servidor OMPS (resources/omps-usuario-client).
 * Necessário para a sessão unificada abrir AcompOPMS.exe ao iniciar o Servidor OMPS.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const clientSrc = path.join(root, 'release', 'omps-usuario', 'win-unpacked')
const serverUnpacked = path.join(root, 'release', 'servidor-omps', 'win-unpacked')
const dest = path.join(serverUnpacked, 'resources', 'omps-usuario-client')

function copyRecursive(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name)
    const to = path.join(dst, name)
    const stat = fs.statSync(from)
    if (stat.isDirectory()) copyRecursive(from, to)
    else fs.copyFileSync(from, to)
  }
}

if (!fs.existsSync(clientSrc)) {
  console.warn('[stage-omps-usuario] SKIP: release/omps-usuario/win-unpacked ausente (npm run package:omps-usuario:dir)')
  process.exit(0)
}
if (!fs.existsSync(serverUnpacked)) {
  console.warn('[stage-omps-usuario] SKIP: release/servidor-omps/win-unpacked ausente')
  process.exit(0)
}

if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
copyRecursive(clientSrc, dest)
console.log('[stage-omps-usuario] OK →', dest)
