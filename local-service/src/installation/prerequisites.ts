import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { buildWindowsCommandLine, isCommandAvailable, usesWindowsShellWrapper } from './windowsCommands.ts'

const execFileAsync = promisify(execFile)

export type MissingPrerequisite = {
  tool: string
  reason: string
  step: string
}

async function readNodeMajorVersion(): Promise<number | null> {
  if (!(await isCommandAvailable('node'))) return null
  try {
    const line = usesWindowsShellWrapper('node')
      ? (
          await execFileAsync('cmd.exe', ['/d', '/s', '/c', 'node --version'], {
            windowsHide: true,
            timeout: 15_000,
          })
        ).stdout
      : (await execFileAsync('node', ['--version'], { windowsHide: true, timeout: 15_000 })).stdout
    const m = /v?(\d+)/.exec(String(line).trim())
    return m ? Number(m[1]) : null
  } catch {
    return null
  }
}

async function toolAvailable(command: string, args: string[] = ['--version']): Promise<boolean> {
  if (!(await isCommandAvailable(command))) return false

  try {
    if (usesWindowsShellWrapper(command)) {
      const line = buildWindowsCommandLine(command, args)
      await execFileAsync('cmd.exe', ['/d', '/s', '/c', line], { windowsHide: true, timeout: 15_000 })
      return true
    }

    await execFileAsync(command, args, { windowsHide: true, timeout: 15_000 })
    return true
  } catch {
    return false
  }
}

export async function checkInstallationPrerequisites(input: {
  packageManager: string
  installCommands: string[]
}): Promise<{ ok: true } | { ok: false; missing: MissingPrerequisite[] }> {
  const missing: MissingPrerequisite[] = []
  const manager = input.packageManager.toLowerCase()

  if (!(await toolAvailable('git'))) {
    missing.push({
      tool: 'Git',
      reason: 'Necessário para obter o código-fonte do repositório.',
      step: 'Obter código-fonte',
    })
  }

  const needsNode = ['npm', 'pnpm', 'yarn', 'bun'].includes(manager)
  if (needsNode) {
    if (!(await toolAvailable('node'))) {
      missing.push({
        tool: 'Node.js',
        reason: 'Necessário para instalar dependências do projeto Node.',
        step: 'Instalar dependências',
      })
    } else {
      const major = await readNodeMajorVersion()
      if (major !== null && major < 20) {
        missing.push({
          tool: 'Node.js 20+',
          reason: `Versão detectada: v${major}. Projetos Vite/React recentes (ex.: AcompSolemp) exigem Node 20 ou superior.`,
          step: 'Gerar build de produção',
        })
      }
    }

    if (manager === 'npm' && !(await toolAvailable('npm'))) {
      missing.push({
        tool: 'npm',
        reason: 'Gerenciador identificado na análise do projeto.',
        step: 'Instalar dependências',
      })
    }
    if (manager === 'pnpm' && !(await toolAvailable('pnpm'))) {
      missing.push({
        tool: 'pnpm',
        reason: 'Gerenciador identificado na análise do projeto.',
        step: 'Instalar dependências',
      })
    }
    if (manager === 'yarn' && !(await toolAvailable('yarn'))) {
      missing.push({
        tool: 'Yarn',
        reason: 'Gerenciador identificado na análise do projeto.',
        step: 'Instalar dependências',
      })
    }
    if (manager === 'bun' && !(await toolAvailable('bun'))) {
      missing.push({
        tool: 'Bun',
        reason: 'Gerenciador identificado na análise do projeto.',
        step: 'Instalar dependências',
      })
    }
  }

  if (manager === 'pip' || manager === 'composer' || manager === 'cargo') {
    if (manager === 'pip' && !(await toolAvailable('python', ['--version']))) {
      missing.push({
        tool: 'Python',
        reason: 'Necessário para instalar dependências Python.',
        step: 'Instalar dependências',
      })
    }
    if (manager === 'composer' && !(await toolAvailable('composer'))) {
      missing.push({
        tool: 'Composer',
        reason: 'Gerenciador identificado na análise do projeto.',
        step: 'Instalar dependências',
      })
    }
    if (manager === 'cargo' && !(await toolAvailable('cargo'))) {
      missing.push({
        tool: 'Cargo',
        reason: 'Gerenciador identificado na análise do projeto.',
        step: 'Instalar dependências',
      })
    }
  }

  if (
    needsNode &&
    !['npm', 'pnpm', 'yarn', 'bun'].includes(manager) &&
    input.installCommands.length === 0
  ) {
    missing.push({
      tool: 'Gerenciador de pacotes',
      reason: 'Não foi possível determinar com segurança como instalar dependências.',
      step: 'Instalar dependências',
    })
  }

  if (manager.includes('identificado')) {
    missing.push({
      tool: 'Gerenciador de pacotes',
      reason: 'Gerenciador não identificado com segurança.',
      step: 'Instalar dependências',
    })
  }

  if (missing.length > 0) return { ok: false, missing }
  return { ok: true }
}
