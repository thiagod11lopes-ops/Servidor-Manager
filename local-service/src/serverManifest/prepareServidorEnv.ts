import fs from 'node:fs/promises'
import path from 'node:path'
import type { SystemAccessMode } from '../config/systemAccessMode.ts'
import {
  getPhysicalLanIPv4,
  getPrimaryLanIPv4,
  isCarrierGradeNatIPv4,
  selectPhysicalLanIPv4,
} from '../config/networkAccess.ts'
import {
  isPhysicalLanHostForLocalMode,
  isValidServidorEnvPublicHost,
} from './resolveInstallAccessHost.ts'
import type { ServerManifest } from './types.ts'

const DEFAULT_RELATIVE_DIR = 'Transferir para Servidor/servidor-lan'
const DEFAULT_ENV_FILE = 'servidor.env'
const DEFAULT_EXAMPLE_FILE = 'servidor.env.example'

export type ServidorEnvPaths = {
  envPath: string
  examplePath: string
  relativeEnvPath: string
}

export function resolveServidorEnvPaths(rootDirectory: string, manifest: ServerManifest): ServidorEnvPaths {
  const single = manifest.configuration?.singleSourceOfTruthRelativePath
  const relativeEnvPath =
    typeof single === 'string' && single.trim().length > 0
      ? single.replace(/\\/g, '/')
      : `${DEFAULT_RELATIVE_DIR}/${DEFAULT_ENV_FILE}`

  const envPath = path.resolve(rootDirectory, ...relativeEnvPath.split('/'))
  const dir = path.dirname(envPath)
  const examplePath = path.join(dir, DEFAULT_EXAMPLE_FILE)

  return { envPath, examplePath, relativeEnvPath }
}

function isInsideRoot(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
}

export function setEnvLine(content: string, key: string, value: string): string {
  const line = `${key}=${value}`
  const re = new RegExp(`^${key}=.*$`, 'm')
  if (re.test(content)) return content.replace(re, line)
  return `${content.trimEnd()}\n${line}\n`
}

function removeEnvLine(content: string, key: string): string {
  const without = content.replace(new RegExp(`^${key}=.*(?:\\r?\\n)?`, 'gm'), '')
  const trimmed = without.trimEnd()
  return trimmed.length > 0 ? `${trimmed}\n` : ''
}

/**
 * Aplica chaves de política de acesso no conteúdo de servidor.env (AcompSolemp lê na instalação).
 * Exportado para testes unitários.
 */
export function applyAccessModeToServidorEnvContent(
  content: string,
  accessMode: SystemAccessMode,
): string {
  let next = content
  next = setEnvLine(next, 'ACOMOPMS_ACCESS_MODE', accessMode)
  if (accessMode === 'lan') {
    next = setEnvLine(next, 'ACOMOPMS_FIREWALL_SCOPE', 'lan')
  } else {
    next = removeEnvLine(next, 'ACOMOPMS_SECONDARY_LAN_REDIRECTS')
    next = removeEnvLine(next, 'ACOMOPMS_FIREWALL_SCOPE')
  }
  return next
}

export type PrepareServidorEnvInput = {
  rootDirectory: string
  manifest: ServerManifest
  /** `auto` (padrão) ou IPv4 fixo para ACOMOPMS_LAN_HOST. */
  lanHost?: string
  httpPort?: number
  /** Quando definido, grava ACOMOPMS_OVERLAY_ENABLED. Omitir em atualizações para preservar o valor existente. */
  overlayEnabled?: boolean
  /** Política explícita (local neste PC vs LAN); não inferir só pelo hostname. */
  accessMode?: SystemAccessMode
  /** Código exposto aos utilizadores (ex.: BNC01) — ACOMOPMS_DATABASE_NUMBER. */
  databaseNumber?: string
}

export type PrepareServidorEnvResult =
  | { ok: true; created: boolean; paths: ServidorEnvPaths; lanHost: string; httpPort: number; message: string }
  | { ok: false; message: string }

/**
 * Etapas 13–17: copia `servidor.env.example` → `servidor.env` se ainda não existir;
 * garante overlay desligado e Supabase interno em 127.0.0.1:54321.
 */
export async function prepareServidorEnv(input: PrepareServidorEnvInput): Promise<PrepareServidorEnvResult> {
  const paths = resolveServidorEnvPaths(input.rootDirectory, input.manifest)
  if (!isInsideRoot(input.rootDirectory, paths.envPath)) {
    return { ok: false, message: 'Caminho de servidor.env inválido (fora do clone).' }
  }

  let created = false
  let content: string

  try {
    content = await fs.readFile(paths.envPath, 'utf8')
  } catch {
    try {
      content = await fs.readFile(paths.examplePath, 'utf8')
      created = true
    } catch {
      return {
        ok: false,
        message: `Arquivo exemplo não encontrado: ${paths.examplePath}`,
      }
    }
  }

  const httpPort =
    input.httpPort ??
    readDefaultHttpPort(input.manifest)

  const existingLanHostMatch = /^ACOMOPMS_LAN_HOST=(.+)$/m.exec(content)
  const existingLanHost = existingLanHostMatch ? existingLanHostMatch[1].trim() : 'auto'

  let lanHostForResult = existingLanHost

  let localLanSelectionNote: string | undefined

  const resolveLocalPhysicalLanHost = (): string | 'auto' => {
    const selection = selectPhysicalLanIPv4()
    if (selection.note) localLanSelectionNote = selection.note
    return selection.address ?? 'auto'
  }

  const applyLanHostLine = (lanHost: string) => {
    content = setEnvLine(content, 'ACOMOPMS_LAN_HOST', lanHost)
    lanHostForResult = lanHost
  }

  if (input.lanHost !== undefined) {
    let lanHost = input.lanHost.trim()
    if (lanHost !== 'auto') {
      lanHost = lanHost.trim()
      if (!isValidServidorEnvPublicHost(lanHost)) {
        return { ok: false, message: `ACOMOPMS_LAN_HOST inválido: ${lanHost}` }
      }
      if (input.accessMode === 'lan' && !isPhysicalLanHostForLocalMode(lanHost)) {
        return {
          ok: false,
          message:
            'Modo rede local (LAN): ACOMOPMS_LAN_HOST deve ser IPv4 da LAN física (Wi‑Fi ou cabo).',
        }
      }
      if (input.accessMode === 'local' && lanHost !== '127.0.0.1' && lanHost !== 'localhost') {
        return {
          ok: false,
          message: 'Modo local (neste PC): use 127.0.0.1 em ACOMOPMS_LAN_HOST.',
        }
      }
      applyLanHostLine(lanHost)
    } else if (input.accessMode === 'lan') {
      applyLanHostLine(resolveLocalPhysicalLanHost())
    } else if (input.accessMode === 'local') {
      applyLanHostLine('127.0.0.1')
    } else {
      applyLanHostLine('auto')
    }
  } else if (input.accessMode === 'lan') {
    const shouldResolve =
      existingLanHost === 'auto' ||
      isCarrierGradeNatIPv4(existingLanHost) ||
      existingLanHost === '127.0.0.1' ||
      existingLanHost === 'localhost'
    if (shouldResolve) {
      applyLanHostLine(resolveLocalPhysicalLanHost())
    }
  } else if (input.accessMode === 'local') {
    if (
      existingLanHost === 'auto' ||
      isCarrierGradeNatIPv4(existingLanHost) ||
      existingLanHost.toLowerCase().endsWith('.ts.net')
    ) {
      applyLanHostLine('127.0.0.1')
    }
  }

  content = setEnvLine(content, 'ACOMOPMS_HTTP_PORT', String(httpPort))

  if (input.accessMode === 'local' || input.accessMode === 'lan') {
    content = applyAccessModeToServidorEnvContent(content, input.accessMode)
    if (input.overlayEnabled === true) {
      content = setEnvLine(content, 'ACOMOPMS_OVERLAY_ENABLED', 'true')
    } else if (input.overlayEnabled === false || created) {
      content = setEnvLine(content, 'ACOMOPMS_OVERLAY_ENABLED', 'false')
    }
  } else if (input.overlayEnabled === true) {
    content = setEnvLine(content, 'ACOMOPMS_OVERLAY_ENABLED', 'true')
  } else if (input.overlayEnabled === false || created) {
    content = setEnvLine(content, 'ACOMOPMS_OVERLAY_ENABLED', 'false')
  }

  content = setEnvLine(content, 'ACOMOPMS_SUPABASE_INTERNAL', 'http://127.0.0.1:54321')

  if (input.databaseNumber !== undefined) {
    const code = input.databaseNumber.trim()
    if (code.length > 0) {
      content = setEnvLine(content, 'ACOMOPMS_DATABASE_NUMBER', code)
    }
  }

  await fs.mkdir(path.dirname(paths.envPath), { recursive: true })
  await fs.writeFile(paths.envPath, content, 'utf8')

  const detectedForMessage = getPhysicalLanIPv4() ?? getPrimaryLanIPv4()
  const message = created
    ? `servidor.env criado a partir de ${DEFAULT_EXAMPLE_FILE} (${paths.relativeEnvPath}).`
    : `servidor.env atualizado (${paths.relativeEnvPath}).`

  return {
    ok: true,
    created,
    paths,
    lanHost: lanHostForResult,
    httpPort,
    message: `${message} LAN host=${lanHostForResult}${
      detectedForMessage && lanHostForResult === 'auto' ? ` (IPv4 detectado: ${detectedForMessage})` : ''
    }, porta=${httpPort}${
      input.overlayEnabled === true
        ? ', overlay=WireGuard (opcional).'
        : input.overlayEnabled === false || created
          ? ', overlay=false.'
          : ', overlay=mantido.'
    }${input.accessMode === 'local' ? ', acesso=local (neste PC).' : ''}${
      input.accessMode === 'lan' ? ', acesso=LAN.' : ''
    }${input.accessMode === 'lan' && localLanSelectionNote ? ` ${localLanSelectionNote}` : ''}`,
  }
}

function readDefaultHttpPort(manifest: ServerManifest): number {
  const client = manifest.clientConnection as
    | { lan?: { variables?: { httpPort?: { default?: unknown } } } }
    | undefined
  const value = client?.lan?.variables?.httpPort?.default
  if (typeof value === 'number' && value > 0 && value < 65536) return value
  return 8080
}
