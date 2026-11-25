import { access } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { isCommandAvailable } from './windowsCommands.ts'

const execFileAsync = promisify(execFile)

/** Caminhos conhecidos do Git for Windows (validados com existência + `--version`). */
export const GIT_BASH_KNOWN_PATHS = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
] as const

const VERSION_ARGS = ['--version'] as const
const VERSION_TIMEOUT_MS = 20_000

export type ResolveWindowsBashDeps = {
  /** Somente para testes; produção usa `process.platform`. */
  platform?: NodeJS.Platform
  isCommandAvailable: (command: string) => Promise<boolean>
  bashVersionOk: (executable: string) => Promise<boolean>
  fileExists: (filePath: string) => Promise<boolean>
}

async function defaultBashVersionOk(executable: string): Promise<boolean> {
  try {
    await execFileAsync(executable, [...VERSION_ARGS], {
      windowsHide: true,
      timeout: VERSION_TIMEOUT_MS,
    })
    return true
  } catch {
    return false
  }
}

async function defaultFileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function defaultDeps(): ResolveWindowsBashDeps {
  return {
    isCommandAvailable,
    bashVersionOk: defaultBashVersionOk,
    fileExists: defaultFileExists,
  }
}

/**
 * Resolve um executável Bash funcional no Windows.
 * 1) Tenta `bash` do PATH; 2) caminhos conhecidos do Git Bash.
 * Retorna `null` se nenhum responder a `--version`.
 */
export async function resolveWindowsBashExecutable(
  deps: Partial<ResolveWindowsBashDeps> = {},
): Promise<string | null> {
  const platform = deps.platform ?? process.platform
  if (platform !== 'win32') return null

  const { isCommandAvailable: commandAvailable, bashVersionOk, fileExists } = {
    ...defaultDeps(),
    ...deps,
  }

  if (await commandAvailable('bash')) {
    if (await bashVersionOk('bash')) return 'bash'
  }

  for (const candidate of GIT_BASH_KNOWN_PATHS) {
    if (!(await fileExists(candidate))) continue
    if (await bashVersionOk(candidate)) return candidate
  }

  return null
}

/** Pré-requisito manifest-lan no Windows (`database.schema` / apply-local-schema). */
export async function isWindowsBashAvailable(deps?: Partial<ResolveWindowsBashDeps>): Promise<boolean> {
  if (process.platform !== 'win32') return false
  return (await resolveWindowsBashExecutable(deps)) !== null
}
