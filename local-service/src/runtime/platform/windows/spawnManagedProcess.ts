import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import type { ControlledCommand } from '../../../installation/controlledCommands.ts'
import { buildWindowsCommandLine, usesWindowsShellWrapper } from '../../../installation/windowsCommands.ts'

export type SpawnManagedOptions = {
  detached?: boolean
  env?: Record<string, string>
}

export function spawnManagedProcessWindows(
  command: ControlledCommand,
  cwd: string,
  stdoutPath: string,
  stderrPath: string,
  options: SpawnManagedOptions = {},
): ChildProcess {
  const stdoutFd = fs.openSync(stdoutPath, 'a')
  const stderrFd = fs.openSync(stderrPath, 'a')
  const detached = options.detached ?? true

  const spawnOptions = {
    cwd,
    detached,
    stdio: ['ignore', stdoutFd, stderrFd] as const,
    windowsHide: true,
    env: options.env ? { ...process.env, ...options.env } : process.env,
  }

  const child = usesWindowsShellWrapper(command.executable)
    ? spawn(
        'cmd.exe',
        ['/d', '/s', '/c', buildWindowsCommandLine(command.executable, command.args)],
        spawnOptions,
      )
    : spawn(command.executable, command.args, spawnOptions)

  if (detached) {
    child.unref()
  }
  return child
}

export function spawnDetachedManagedProcess(
  command: ControlledCommand,
  cwd: string,
  stdoutPath: string,
  stderrPath: string,
): ChildProcess {
  return spawnManagedProcessWindows(command, cwd, stdoutPath, stderrPath, { detached: true })
}
