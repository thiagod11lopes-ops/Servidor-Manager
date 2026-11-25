import fs from 'node:fs/promises'
import path from 'node:path'
import type { ControlledCommand } from '../installation/controlledCommands.ts'
import { withNpmDirectoryLock } from '../installation/npmInstallLock.ts'
import { resolveNpmInstallTimeoutMs } from '../installation/npmCommandEnv.ts'
import { runControlledCommand } from '../installation/runControlledCommand.ts'

export function resolveManifestFrontendDirectory(rootDirectory: string): string {
  return path.join(rootDirectory, 'frontend')
}

export async function frontendDependencyBinsReady(frontendDirectory: string): Promise<boolean> {
  const bin = path.join(frontendDirectory, 'node_modules', '.bin')
  try {
    await fs.access(path.join(bin, 'tsc.cmd'))
    await fs.access(path.join(bin, 'vite.cmd'))
    return true
  } catch {
    try {
      await fs.access(path.join(bin, 'tsc'))
      await fs.access(path.join(bin, 'vite'))
      return true
    } catch {
      return false
    }
  }
}

export async function resolveFrontendNpmInstallCommand(frontendDirectory: string): Promise<ControlledCommand | null> {
  try {
    await fs.access(path.join(frontendDirectory, 'package.json'))
  } catch {
    return null
  }
  const hasLock = await fileExists(path.join(frontendDirectory, 'package-lock.json'))
  const subcommand = hasLock ? 'ci' : 'install'
  return {
    executable: 'npm',
    args: [subcommand, '--include=dev', '--prefer-offline', '--no-audit', '--no-fund'],
    label: `npm ${subcommand} --include=dev (frontend)`,
  }
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

export type EnsureFrontendDepsResult =
  | { ok: true; skipped: true; message: string }
  | { ok: true; skipped: false; message: string; output: string }
  | { ok: false; message: string; output: string; logHint: string }

/**
 * Instala dependências do frontend antes de `build-producao-lan.ps1`, com logs lineares (CI=1)
 * e lock por diretório — o script OMPS pula `npm ci` quando tsc/vite já existem.
 */
export async function ensureManifestFrontendDependencies(input: {
  rootDirectory: string
  onOutputLine?: (line: string) => void
}): Promise<EnsureFrontendDepsResult> {
  const frontendDirectory = resolveManifestFrontendDirectory(input.rootDirectory)
  const { getSystemsRoot } = await import('../installation/paths.ts')
  const logHint = `Consulte logs/phase-frontend.build.log em ${path.join(getSystemsRoot(), '<systemId>', 'logs')}`

  if (await frontendDependencyBinsReady(frontendDirectory)) {
    return {
      ok: true,
      skipped: true,
      message: 'Dependências do frontend já presentes (tsc/vite).',
    }
  }

  const command = await resolveFrontendNpmInstallCommand(frontendDirectory)
  if (!command) {
    return {
      ok: false,
      message: 'Pasta frontend/ ou package.json ausente no clone.',
      output: '',
      logHint,
    }
  }

  return withNpmDirectoryLock(frontendDirectory, async () => {
    if (await frontendDependencyBinsReady(frontendDirectory)) {
      return {
        ok: true,
        skipped: true,
        message: 'Dependências do frontend instaladas por outra etapa.',
      }
    }

    input.onOutputLine?.(`Iniciando ${command.label}…`)

    const run = await runControlledCommand(command, frontendDirectory, {
      onOutputLine: input.onOutputLine,
      timeoutMs: resolveNpmInstallTimeoutMs(),
    })

    if (!run.ok) {
      return {
        ok: false,
        message: `${command.label} falhou. ${logHint}`,
        output: run.output,
        logHint,
      }
    }

    if (!(await frontendDependencyBinsReady(frontendDirectory))) {
      return {
        ok: false,
        message: `${command.label} terminou, mas tsc/vite não foram encontrados em node_modules/.bin. ${logHint}`,
        output: run.output,
        logHint,
      }
    }

    return {
      ok: true,
      skipped: false,
      message: `${command.label} concluído.`,
      output: run.output,
    }
  })
}
