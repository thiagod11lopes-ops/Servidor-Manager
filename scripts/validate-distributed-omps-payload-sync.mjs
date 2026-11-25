#!/usr/bin/env node
/**
 * Garante que o payload em release/omps-payload (fonte do build) está refletido
 * em release/servidor-omps/.../omps-payload quando o win-unpacked existir.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePayload = path.join(root, 'release', 'omps-payload')
const distributedRel = path.join(
  'release',
  'servidor-omps',
  'win-unpacked',
  'resources',
  'omps-payload',
)
const distributedPayload = path.join(root, distributedRel)

const markerRel = 'Transferir para Servidor/servidor-lan/start-servidor-lan.ps1'

async function sha256File(filePath) {
  const buf = await fsp.readFile(filePath)
  return crypto.createHash('sha256').update(buf).digest('hex')
}

async function main() {
  const sourceMarker = path.join(sourcePayload, ...markerRel.split('/'))
  if (!fs.existsSync(sourceMarker)) {
    console.error(`[validate-distributed-omps] Fonte ausente: ${sourceMarker}`)
    process.exit(1)
  }

  if (!fs.existsSync(distributedPayload)) {
    console.warn(
      `[validate-distributed-omps] SKIP: ${distributedRel} ausente — rode npm run package:servidor-omps:dir`,
    )
    process.exit(0)
  }

  const distMarker = path.join(distributedPayload, ...markerRel.split('/'))
  if (!fs.existsSync(distMarker)) {
    console.error(`[validate-distributed-omps] Instalador sem: ${markerRel}`)
    process.exit(1)
  }

  const [sourceHash, distHash] = await Promise.all([sha256File(sourceMarker), sha256File(distMarker)])
  if (sourceHash !== distHash) {
    console.error('[validate-distributed-omps] start-servidor-lan.ps1 difere entre omps-payload e servidor-omps win-unpacked.')
    console.error(`  source: ${sourceHash}`)
    console.error(`  dist:   ${distHash}`)
    console.error('  Rode: npm run package:servidor-omps:dir (ou package:servidor-omps)')
    process.exit(1)
  }

  const mustInclude = 'Start-CaddyLanProcess'
  const distText = await fsp.readFile(distMarker, 'utf8')
  if (!distText.includes(mustInclude)) {
    console.error(`[validate-distributed-omps] Script distribuído não contém ${mustInclude}`)
    process.exit(1)
  }

  console.log('[validate-distributed-omps] OK — payload distribuído alinhado ao release/omps-payload.')
  console.log(`  marker SHA256: ${sourceHash.slice(0, 16)}…`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
