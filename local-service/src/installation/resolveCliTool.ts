import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** PATH ampliado para subprocessos (npm global / Git / PostgreSQL no Windows). */
export function buildSubprocessPath(base: NodeJS.ProcessEnv = process.env): string {
  const parts: string[] = []
  const push = (segment: string | undefined) => {
    if (!segment?.trim()) return
    for (const piece of segment.split(path.delimiter)) {
      const trimmed = piece.trim()
      if (trimmed && !parts.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
        parts.push(trimmed)
      }
    }
  }

  push(base.PATH ?? base.Path)

  if (process.platform === 'win32') {
    push(path.join(base.APPDATA ?? '', 'npm'))
    push(path.join(base.LOCALAPPDATA ?? '', 'Programs', 'Supabase'))
    push('C:\\Program Files\\Git\\bin')
    push('C:\\Program Files\\Git\\cmd')
    push('C:\\Program Files\\nodejs')
    const pgRoot = 'C:\\Program Files\\PostgreSQL'
    // Best-effort: versões comuns do cliente psql
    for (const ver of ['17', '16', '15', '14']) {
      push(path.join(pgRoot, ver, 'bin'))
    }
  }

  return parts.join(path.delimiter)
}

export function envWithRefreshedPath(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...base, PATH: buildSubprocessPath(base) }
}

async function fileExecutable(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/** Shims npm no Windows: preferir `.cmd` — o arquivo sem extensão não é spawnável via Node. */
async function normalizeWindowsCliPath(filePath: string): Promise<string> {
  if (process.platform !== 'win32') return filePath
  if (filePath.toLowerCase().endsWith('.cmd')) {
    return (await fileExecutable(filePath)) ? filePath : filePath
  }
  const cmdPath = `${filePath}.cmd`
  if (await fileExecutable(cmdPath)) return cmdPath
  if (await fileExecutable(filePath)) return filePath
  return filePath
}

async function resolveViaWhere(command: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync(
        'cmd.exe',
        ['/d', '/s', '/c', `where ${command}`],
        { env, windowsHide: true, timeout: 15_000 },
      )
      const line = String(stdout)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean)
      return line ?? null
    }
    const { stdout } = await execFileAsync('which', [command], { env, timeout: 10_000 })
    return String(stdout).trim() || null
  } catch {
    return null
  }
}

/**
 * Resolve o executável Supabase CLI sem exigir reinício do Manager após bootstrap/npm -g.
 */
export async function resolveSupabaseCliExecutable(
  baseEnv: NodeJS.ProcessEnv = process.env,
): Promise<{ executable: string; env: NodeJS.ProcessEnv }> {
  const env = envWithRefreshedPath(baseEnv)
  const candidates: string[] = []

  const fromWhere = await resolveViaWhere('supabase', env)
  if (fromWhere) candidates.push(fromWhere)

  if (process.platform === 'win32') {
    const npmShim = path.join(baseEnv.APPDATA ?? '', 'npm', 'supabase.cmd')
    if (await fileExecutable(npmShim)) candidates.push(npmShim)
    const npmExe = path.join(baseEnv.APPDATA ?? '', 'npm', 'supabase')
    if (await fileExecutable(npmExe)) candidates.push(npmExe)
  } else {
    const home = baseEnv.HOME ?? ''
    if (home) {
      const npx = path.join(home, '.local', 'bin', 'supabase')
      if (await fileExecutable(npx)) candidates.push(npx)
    }
  }

  for (const candidate of candidates) {
    if (!candidate) continue
    const executable = await normalizeWindowsCliPath(candidate)
    if (await fileExecutable(executable)) {
      return { executable, env }
    }
  }

  return { executable: 'supabase', env }
}
