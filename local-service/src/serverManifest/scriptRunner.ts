import { execFile, spawn } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { killProcessTree } from '../installation/killProcessTree.ts'
import { buildNpmSubprocessEnv } from '../installation/npmCommandEnv.ts'
import { resolveWindowsBashExecutable } from '../installation/resolveWindowsBash.ts'
import type { ManifestPlatform, ManifestScriptItem } from './types.ts'

const execFileAsync = promisify(execFile)
const DEFAULT_SCRIPT_TIMEOUT_MS = 300_000

export type ScriptRunResult = { ok: boolean; output: string; exitCode: number | null }

function isInsideRoot(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  return resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
}

export function resolveScriptPath(rootDirectory: string, script: ManifestScriptItem): string {
  const resolved = path.resolve(rootDirectory, script.path)
  if (!isInsideRoot(rootDirectory, resolved)) {
    throw new Error('SCRIPT_PATH_OUTSIDE_REPOSITORY')
  }
  return resolved
}

/** Mapeia plataformas do manifesto (`windows`, `linux`, `windows-with-bash`). */
export function scriptSupportsPlatform(script: ManifestScriptItem, platform: ManifestPlatform): boolean {
  if (!script.platforms || script.platforms.length === 0) return true
  if (script.platforms.includes(platform)) return true
  if (platform === 'windows' && script.platforms.includes('windows-with-bash')) return true
  return false
}

export function scriptNeedsBashOnWindows(script: ManifestScriptItem, platform: ManifestPlatform): boolean {
  return (
    platform === 'windows' &&
    script.interpreter === 'bash' &&
    !(script.platforms ?? []).includes('windows')
  )
}

async function buildInvocation(
  interpreter: string | undefined,
  scriptPath: string,
  extraArgs: string[],
): Promise<{ executable: string; args: string[] }> {
  switch (interpreter) {
    case 'node':
      return { executable: process.platform === 'win32' ? 'node' : 'node', args: [scriptPath, ...extraArgs] }
    case 'powershell':
      return {
        executable: process.platform === 'win32' ? 'powershell.exe' : 'pwsh',
        args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...extraArgs],
      }
    case 'bash': {
      if (process.platform === 'win32') {
        const resolved = await resolveWindowsBashExecutable()
        if (!resolved) {
          throw new Error('BASH_NOT_AVAILABLE')
        }
        return { executable: resolved, args: [scriptPath, ...extraArgs] }
      }
      return { executable: 'bash', args: [scriptPath, ...extraArgs] }
    }
    default:
      throw new Error('SCRIPT_INTERPRETER_UNSUPPORTED')
  }
}

/**
 * Executa um script listado em `scripts.items[]` com cwd na raiz do clone.
 * Somente interpretadores declarados no manifesto (node | powershell | bash).
 */
function runManifestScriptSpawn(input: {
  executable: string
  args: string[]
  rootDirectory: string
  env: NodeJS.ProcessEnv
  timeoutMs: number
  onOutputLine?: (line: string) => void
}): Promise<ScriptRunResult> {
  return new Promise((resolve) => {
    const child = spawn(input.executable, input.args, {
      cwd: input.rootDirectory,
      env: input.env,
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      void killProcessTree(child.pid).finally(() => {
        resolve({
          ok: false,
          output: `${stdout}\n${stderr}\nTimeout após ${input.timeoutMs}ms`.trim(),
          exitCode: null,
        })
      })
    }, input.timeoutMs)

    const emitLine = (chunk: string, target: 'stdout' | 'stderr') => {
      if (target === 'stdout') stdout += chunk
      else stderr += chunk
      if (!input.onOutputLine) return
      for (const line of chunk.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed) input.onOutputLine(trimmed)
      }
    }

    child.stdout?.on('data', (buf: Buffer) => emitLine(buf.toString('utf8'), 'stdout'))
    child.stderr?.on('data', (buf: Buffer) => emitLine(buf.toString('utf8'), 'stderr'))

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve({
        ok: false,
        output: `${stdout}\n${stderr}\n${error.message}`.trim(),
        exitCode: null,
      })
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      const output = `${stdout}\n${stderr}`.trim()
      resolve({
        ok: code === 0,
        output,
        exitCode: code,
      })
    })
  })
}

export async function runManifestScript(input: {
  rootDirectory: string
  script: ManifestScriptItem
  args?: string[]
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  /** Atualiza UI/diagnóstico durante scripts longos (npm, build). */
  onOutputLine?: (line: string) => void
}): Promise<ScriptRunResult> {
  const scriptPath = resolveScriptPath(input.rootDirectory, input.script)
  let executable: string
  let args: string[]
  try {
    ;({ executable, args } = await buildInvocation(input.script.interpreter, scriptPath, input.args ?? []))
  } catch (error) {
    if (error instanceof Error && error.message === 'BASH_NOT_AVAILABLE') {
      return {
        ok: false,
        output:
          'Bash funcional não encontrado no Windows (PATH quebrado e Git Bash indisponível). Instale Git for Windows.',
        exitCode: null,
      }
    }
    throw error
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS
  const env = buildNpmSubprocessEnv({ ...process.env, ...input.env })

  if (input.onOutputLine) {
    return runManifestScriptSpawn({
      executable,
      args,
      rootDirectory: input.rootDirectory,
      env,
      timeoutMs,
      onOutputLine: input.onOutputLine,
    })
  }

  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      cwd: input.rootDirectory,
      env,
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    })
    return { ok: true, output: `${stdout}\n${stderr}`.trim(), exitCode: 0 }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string; code?: number }
    return {
      ok: false,
      output: `${err.stdout ?? ''}\n${err.stderr ?? ''}\n${err.message ?? ''}`.trim(),
      exitCode: typeof err.code === 'number' ? err.code : null,
    }
  }
}
