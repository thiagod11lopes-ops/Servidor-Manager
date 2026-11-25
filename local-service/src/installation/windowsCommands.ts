const WINDOWS_SHELL_COMMANDS = new Set(['npm', 'pnpm', 'yarn', 'npx', 'bun', 'composer', 'supabase'])

export function buildWindowsCommandLine(executable: string, args: string[]): string {
  const quoteIfNeeded = (part: string) => (/\s/.test(part) ? `"${part}"` : part)
  return [quoteIfNeeded(executable), ...args.map(quoteIfNeeded)].join(' ')
}

export function usesWindowsShellWrapper(executable: string): boolean {
  if (process.platform !== 'win32') return false
  if (executable.includes('\\') || executable.includes('/')) return false
  return WINDOWS_SHELL_COMMANDS.has(executable)
}

export async function isCommandAvailable(command: string): Promise<boolean> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)

  try {
    if (process.platform === 'win32') {
      await execFileAsync('where', [command], { windowsHide: true, timeout: 10_000 })
      return true
    }

    await execFileAsync('which', [command], { windowsHide: true, timeout: 10_000 })
    return true
  } catch {
    return false
  }
}
