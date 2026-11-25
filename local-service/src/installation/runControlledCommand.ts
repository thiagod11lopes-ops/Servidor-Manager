import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type { ControlledCommand } from './controlledCommands.ts'
import { buildWindowsCommandLine, usesWindowsShellWrapper } from './windowsCommands.ts'
import { buildNpmSubprocessEnv, resolveNpmInstallTimeoutMs } from './npmCommandEnv.ts'
import { envWithRefreshedPath } from './resolveCliTool.ts'
import { killProcessTree } from './killProcessTree.ts'

const execFileAsync = promisify(execFile)

export type ControlledCommandRunResult = { ok: true; output: string } | { ok: false; output: string }

function envForProjectCommand(): NodeJS.ProcessEnv {
  return envWithRefreshedPath(buildNpmSubprocessEnv())
}

function resolveCommandEnv(envOverride?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const base = envForProjectCommand()
  if (!envOverride) return base
  return { ...base, ...envOverride, PATH: envOverride.PATH ?? base.PATH }
}

function spawnInvocation(command: ControlledCommand): { executable: string; args: string[] } {
  const winCmdShim =
    process.platform === 'win32' &&
    (usesWindowsShellWrapper(command.executable) || command.executable.toLowerCase().endsWith('.cmd'))
  if (winCmdShim) {
    return {
      executable: 'cmd.exe',
      args: ['/d', '/s', '/c', buildWindowsCommandLine(command.executable, command.args)],
    }
  }
  return { executable: command.executable, args: command.args }
}

function usesCmdWrapperForExec(executable: string): boolean {
  return (
    usesWindowsShellWrapper(executable) ||
    (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd'))
  )
}

function runControlledCommandSpawn(input: {
  command: ControlledCommand
  cwd: string
  env: NodeJS.ProcessEnv
  timeoutMs: number
  onOutputLine?: (line: string) => void
}): Promise<ControlledCommandRunResult> {
  const { executable, args } = spawnInvocation(input.command)

  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd: input.cwd,
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
          output: `${stdout}\n${stderr}\nTimeout após ${input.timeoutMs}ms (${input.command.label})`.trim(),
        })
      })
    }, input.timeoutMs)

    const emitChunk = (chunk: string, target: 'stdout' | 'stderr') => {
      if (target === 'stdout') stdout += chunk
      else stderr += chunk
      if (!input.onOutputLine) return
      const parts = chunk.split(/\r?\n/)
      for (const line of parts) {
        const trimmed = line.trim()
        if (!trimmed) continue
        input.onOutputLine(trimmed)
      }
    }

    child.stdout?.on('data', (buf: Buffer) => emitChunk(buf.toString('utf8'), 'stdout'))
    child.stderr?.on('data', (buf: Buffer) => emitChunk(buf.toString('utf8'), 'stderr'))

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve({
        ok: false,
        output: `${stdout}\n${stderr}\n${error.message}`.trim(),
      })
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      const output = `${stdout}\n${stderr}`.trim()
      if (code === 0) {
        resolve({ ok: true, output })
        return
      }
      resolve({
        ok: false,
        output: `${output}\n${input.command.label} encerrou com código ${code ?? '?'}.`.trim(),
      })
    })

  })
}

export async function runControlledCommand(
  command: ControlledCommand,
  cwd: string,
  options: {
    onOutputLine?: (line: string) => void
    timeoutMs?: number
    envOverride?: NodeJS.ProcessEnv
  } = {},
): Promise<ControlledCommandRunResult> {
  const env = resolveCommandEnv(options.envOverride)
  const timeoutMs = options.timeoutMs ?? resolveNpmInstallTimeoutMs()

  if (options.onOutputLine) {
    return runControlledCommandSpawn({
      command,
      cwd,
      env,
      timeoutMs,
      onOutputLine: options.onOutputLine,
    })
  }

  try {
    const { stdout, stderr } = usesCmdWrapperForExec(command.executable)
      ? await execFileAsync(
          'cmd.exe',
          ['/d', '/s', '/c', buildWindowsCommandLine(command.executable, command.args)],
          {
            cwd,
            env,
            windowsHide: true,
            timeout: timeoutMs,
            maxBuffer: 8 * 1024 * 1024,
          },
        )
      : await execFileAsync(command.executable, command.args, {
          cwd,
          env,
          windowsHide: true,
          timeout: timeoutMs,
          maxBuffer: 8 * 1024 * 1024,
        })
    return { ok: true, output: `${stdout}\n${stderr}`.trim() }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string; killed?: boolean; signal?: string }
    const timedOut = err.killed && err.signal === 'SIGTERM'
    const suffix = timedOut ? `\nTimeout após ${timeoutMs}ms (${command.label}).` : ''
    const output = `${err.stdout ?? ''}\n${err.stderr ?? ''}\n${err.message ?? ''}${suffix}`.trim()
    return { ok: false, output }
  }
}
