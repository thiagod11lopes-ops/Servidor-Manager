#!/usr/bin/env node
/**
 * Monta release/omps-unified-bundle/subinstallers para o hub OMPS.exe.
 * Não executa subinstaladores — apenas copia artefatos de build existentes.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { collectWinUnpackedFingerprint, sha256FileSync } from './servidor-omps-artifact-fingerprint.mjs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  CLIENT_SUBINSTALLER_DIR_REL,
  CLIENT_SUBINSTALLER_EXE_PREFIX,
  CLIENT_SUBINSTALLER_NSIS_FILENAME,
  CLIENT_SUBINSTALLER_NSIS_REL,
  OMPS_USUARIO_BUILD_OUTPUT_DIR,
  OMPS_UNIFIED_BUNDLE_DIR,
  OMPS_UNIFIED_MANIFEST_FILENAME,
  SERVER_SUBINSTALLER_DIR_REL,
  SERVER_SUBINSTALLER_NSIS_REL,
} from './omps-unified-product-spec.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundleRoot = join(root, OMPS_UNIFIED_BUNDLE_DIR)
const subRoot = join(bundleRoot, 'subinstallers')

function parseArgs(argv) {
  let buildClient = false
  let allowMissingClient = false
  let allowMissingServerNsis = false
  for (const arg of argv) {
    if (arg === '--build-client') buildClient = true
    else if (arg === '--allow-missing-client') allowMissingClient = true
    else if (arg === '--allow-missing-server-nsis') allowMissingServerNsis = true
    else if (arg === '--help' || arg === '-h') {
      console.log(`Uso: node scripts/prepare-omps-unified-subinstallers.mjs [opções]
  --build-client              npm run package:omps-usuario
  --allow-missing-client      manifest sem cliente (somente dev/teste)
  --allow-missing-server-nsis inclui win-unpacked mesmo sem Servidor OMPS.exe`)
      process.exit(0)
    }
  }
  return { buildClient, allowMissingClient, allowMissingServerNsis }
}

function copyDir(from, to) {
  rmSync(to, { recursive: true, force: true })
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to, { recursive: true })
}

function copyFile(from, to) {
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to)
}

function buildClientInstaller() {
  console.log('[omps-unified] build cliente: npm run package:omps-usuario')
  const r = spawnSync('npm', ['run', 'package:omps-usuario'], { cwd: root, stdio: 'inherit', shell: true })
  if (r.status !== 0) throw new Error('npm run package:omps-usuario falhou')
}

function findClientPortableExe(clientDir) {
  if (!existsSync(clientDir)) return null
  return readdirSync(clientDir).find((f) => f.startsWith(CLIENT_SUBINSTALLER_EXE_PREFIX) && f.endsWith('.exe')) ?? null
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const servidorRelease = join(root, 'release', 'servidor-omps')
  const serverNsisSrc = join(servidorRelease, 'Servidor OMPS.exe')
  const serverUnpackedSrc = join(servidorRelease, 'win-unpacked')

  if (!existsSync(serverUnpackedSrc)) {
    throw new Error(
      'release/servidor-omps/win-unpacked ausente. Rode: npm run package:servidor-omps:dir',
    )
  }

  if (opts.buildClient) buildClientInstaller()

  rmSync(subRoot, { recursive: true, force: true })
  mkdirSync(subRoot, { recursive: true })

  const serverDestDir = join(subRoot, 'servidor-omps')
  mkdirSync(serverDestDir, { recursive: true })

  if (existsSync(serverNsisSrc)) {
    copyFile(serverNsisSrc, join(subRoot, SERVER_SUBINSTALLER_NSIS_REL))
    console.log('[omps-unified] Servidor OMPS.exe copiado')
  } else if (!opts.allowMissingServerNsis) {
    throw new Error(
      'Servidor OMPS.exe não encontrado em release/servidor-omps/. Rode npm run package:servidor-omps (NSIS) ou use --allow-missing-server-nsis para bundle parcial.',
    )
  } else {
    console.warn('[omps-unified] AVISO: Servidor OMPS.exe ausente — hub não poderá instalar servidor até NSIS existir.')
  }

  copyDir(serverUnpackedSrc, join(subRoot, SERVER_SUBINSTALLER_DIR_REL))

  const clientNsisSrc = join(root, OMPS_USUARIO_BUILD_OUTPUT_DIR, CLIENT_SUBINSTALLER_NSIS_FILENAME)
  let clientManifest = null
  if (existsSync(clientNsisSrc)) {
    const clientDestDir = join(subRoot, CLIENT_SUBINSTALLER_DIR_REL)
    mkdirSync(clientDestDir, { recursive: true })
    copyFile(clientNsisSrc, join(subRoot, CLIENT_SUBINSTALLER_NSIS_REL))
    clientManifest = {
      kind: 'omps-usuario-nsis',
      exeRelative: CLIENT_SUBINSTALLER_NSIS_REL,
      nsisSha256: sha256FileSync(clientNsisSrc),
    }
    console.log('[omps-unified] cliente:', CLIENT_SUBINSTALLER_NSIS_FILENAME)
  } else {
    const legacyDir = join(subRoot, CLIENT_SUBINSTALLER_DIR_REL)
    const legacyName = findClientPortableExe(legacyDir)
    if (legacyName) {
      clientManifest = { kind: 'portable-legacy', exeRelative: `${CLIENT_SUBINSTALLER_DIR_REL}/${legacyName}` }
      console.warn('[omps-unified] AVISO: usando portable legado', legacyName)
    }
  }
  if (!clientManifest && !opts.allowMissingClient) {
    throw new Error(
      'Instalador OMPS Usuario.exe não encontrado. Rode: npm run package:omps-usuario ou --build-client neste script.',
    )
  }
  if (!clientManifest && opts.allowMissingClient) {
    console.warn('[omps-unified] AVISO: instalador cliente ausente (modo allow-missing-client).')
  }

  let ompsVersion = '0.0.0'
  try {
    const frontendPkg = JSON.parse(
      readFileSync(
        join(root, 'AcompSolemp-cursor-servidor-lan-etapa16-bcc8/frontend/package.json'),
        'utf8',
      ),
    )
    ompsVersion = frontendPkg.version ?? ompsVersion
  } catch {
    // optional
  }

  const serverFingerprint = collectWinUnpackedFingerprint(serverUnpackedSrc)
  const nsisInBundle = join(subRoot, SERVER_SUBINSTALLER_NSIS_REL)
  const serverArtifact = {
    kind: 'servidor-omps-nsis',
    nsisRelative: SERVER_SUBINSTALLER_NSIS_REL,
    unpackedRelative: SERVER_SUBINSTALLER_DIR_REL,
    nsisPresent: existsSync(nsisInBundle),
    dataRootWindows: 'C:\\ServidorManager',
    appId: 'com.servidor.omps',
    uiMainJs: serverFingerprint.uiMainJs,
    uiMainSha256: serverFingerprint.uiMainSha256,
    payloadFileCount: serverFingerprint.payloadFileCount,
    payloadContentSha256: serverFingerprint.payloadContentSha256,
    bundleMetaBuiltAt: serverFingerprint.bundleMetaBuiltAt,
    nsisSha256: existsSync(nsisInBundle) ? sha256FileSync(nsisInBundle) : null,
  }

  const manifest = {
    schema: 'omps-unified-bundle/1',
    builtAt: new Date().toISOString(),
    ompsVersion,
    server: serverArtifact,
    client: clientManifest,
    hub: {
      appId: 'com.servidor.omps.unified',
      doesNotMergeData: true,
    },
  }

  writeFileSync(join(bundleRoot, OMPS_UNIFIED_MANIFEST_FILENAME), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log('[omps-unified] bundle OK:', bundleRoot)
}

main()
