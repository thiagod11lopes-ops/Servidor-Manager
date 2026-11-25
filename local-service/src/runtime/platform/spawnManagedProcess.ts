import type { ChildProcess } from 'node:child_process'
import type { ControlledCommand } from '../../installation/controlledCommands.ts'
import {
  spawnDetachedManagedProcess as spawnWindowsDetached,
  spawnManagedProcessWindows,
  type SpawnManagedOptions,
} from './windows/spawnManagedProcess.ts'

export function spawnDetachedManagedProcess(
  command: ControlledCommand,
  cwd: string,
  stdoutPath: string,
  stderrPath: string,
): ChildProcess {
  if (process.platform === 'win32') {
    return spawnWindowsDetached(command, cwd, stdoutPath, stderrPath)
  }

  throw new Error('UNSUPPORTED_PLATFORM')
}

export function spawnManagedProcess(
  command: ControlledCommand,
  cwd: string,
  stdoutPath: string,
  stderrPath: string,
  options?: SpawnManagedOptions,
): ChildProcess {
  if (process.platform === 'win32') {
    return spawnManagedProcessWindows(command, cwd, stdoutPath, stderrPath, options)
  }

  throw new Error('UNSUPPORTED_PLATFORM')
}
