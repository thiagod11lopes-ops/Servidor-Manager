import { existsSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLIENT_SUBINSTALLER_DIR_REL,
  CLIENT_SUBINSTALLER_EXE_PREFIX,
  CLIENT_SUBINSTALLER_NSIS_REL,
  SERVER_SUBINSTALLER_DIR_REL,
  SERVER_SUBINSTALLER_NSIS_REL,
} from '../../scripts/omps-unified-product-spec.mjs'

/**
 * @param {string} subinstallersRoot — pasta resources/subinstallers (absoluta)
 * @param {object} [manifest] — omps-unified-manifest.json
 */
export function resolveSubinstallers(subinstallersRoot, manifest = {}) {
  const serverNsis = join(subinstallersRoot, SERVER_SUBINSTALLER_NSIS_REL)
  const serverDir = join(subinstallersRoot, SERVER_SUBINSTALLER_DIR_REL)
  const clientDir = join(subinstallersRoot, CLIENT_SUBINSTALLER_DIR_REL)

  let clientExe = null
  const clientNsis = join(subinstallersRoot, CLIENT_SUBINSTALLER_NSIS_REL)
  if (existsSync(clientNsis)) clientExe = clientNsis
  if (manifest.client?.exeRelative) {
    const candidate = join(subinstallersRoot, manifest.client.exeRelative)
    if (existsSync(candidate)) clientExe = candidate
  }
  if (!clientExe && existsSync(clientDir)) {
    const found = readdirSync(clientDir).find(
      (f) => f.startsWith(CLIENT_SUBINSTALLER_EXE_PREFIX) && f.endsWith('.exe'),
    )
    if (found) clientExe = join(clientDir, found)
  }

  const server = {
    nsisExe: existsSync(serverNsis) ? serverNsis : null,
    unpackedDir: existsSync(serverDir) ? serverDir : null,
    managerExe:
      existsSync(join(serverDir, 'ServidorManager.exe')) ? join(serverDir, 'ServidorManager.exe') : null,
  }

  return {
    server,
    clientExe,
    ok: {
      server: Boolean(server.nsisExe),
      client: Boolean(clientExe),
    },
    messages: {
      serverMissing: server.nsisExe
        ? null
        : 'Subinstalador Servidor OMPS ausente (Servidor OMPS.exe). Gere com npm run package:servidor-omps.',
      clientMissing: clientExe
        ? null
        : 'Instalador OMPS Usuario.exe ausente. Gere com npm run package:omps-usuario.',
    },
  }
}

/** @param {'server'|'client'} choice */
export function resolveLaunchTarget(subinstallersRoot, manifest, choice) {
  const resolved = resolveSubinstallers(subinstallersRoot, manifest)
  if (choice === 'server') {
    if (!resolved.server.nsisExe) {
      return {
        ok: false,
        message:
          resolved.messages.serverMissing ||
          'Não foi possível localizar o instalador do Servidor OMPS neste pacote.',
      }
    }
    return { ok: true, executable: resolved.server.nsisExe, kind: 'servidor-omps-nsis' }
  }
  if (choice === 'client') {
    if (!resolved.clientExe) {
      return {
        ok: false,
        message:
          resolved.messages.clientMissing ||
          'Não foi possível localizar o instalador do cliente AcompOPMS neste pacote.',
      }
    }
    const kind =
      resolved.clientExe.replace(/\\/g, '/').endsWith(CLIENT_SUBINSTALLER_NSIS_REL.replace(/\\/g, '/')) ||
      /OMPS Usuario\.exe$/i.test(resolved.clientExe)
        ? 'omps-usuario-nsis'
        : 'acompopms-client-portable'
    return { ok: true, executable: resolved.clientExe, kind }
  }
  return { ok: false, message: 'Escolha inválida.' }
}
