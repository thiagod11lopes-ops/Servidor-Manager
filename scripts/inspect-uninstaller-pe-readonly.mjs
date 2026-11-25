#!/usr/bin/env node
/**
 * Somente leitura: tenta UninstallerReader nos desinstaladores instalados vs instalador release.
 * Nao executa PE — apenas leitura de arquivo (equivalente ao verify-servidor-omps-uninstaller-stub).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { UninstallerReader } from '../node_modules/app-builder-lib/out/targets/nsis/nsisUtil.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const targets = [
  {
    label: 'Hub instalado Uninstall OMPS.exe',
    path: 'C:\\Users\\User\\AppData\\Local\\Programs\\OMPS\\Uninstall OMPS.exe',
  },
  {
    label: 'Servidor OMPS instalado Uninstall ServidorManager.exe',
    path: 'C:\\OMPS-Teste\\ServidorManager\\Uninstall ServidorManager.exe',
  },
  {
    label: 'Release Instalar OMPS.exe (instalador hub 7z)',
    path: path.join(root, 'release', 'omps-unified', 'Instalar OMPS.exe'),
  },
  {
    label: 'Release Servidor OMPS.exe (instalador completo 7z)',
    path: path.join(root, 'release', 'servidor-omps', 'Servidor OMPS.exe'),
  },
]

async function probe(label, filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`[probe] ${label}: AUSENTE (${filePath})`)
    return
  }
  const stat = fs.statSync(filePath)
  const tmp = path.join(root, 'release', '_audit-probe-should-not-keep.exe')
  try {
    await UninstallerReader.exec(filePath, tmp)
    console.log(`[probe] ${label}: UninstallerReader OK (formato stub+inner extraivel) bytes=${stat.size}`)
  } catch (e) {
    console.log(`[probe] ${label}: UninstallerReader FALHOU (${e.message}) bytes=${stat.size}`)
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
  }
}

for (const t of targets) {
  await probe(t.label, t.path)
}
