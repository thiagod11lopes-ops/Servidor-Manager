import fs from 'node:fs/promises'
import path from 'node:path'
import { getAppBindHost } from '../config/networkAccess.ts'
import type { InstallationPlanPayload } from '../plan/buildInstallationPlan.ts'
import { directoryUsesManifestProfile } from '../serverManifest/loadServerManifest.ts'
import { resolveStartCommand, type ControlledCommand } from './controlledCommands.ts'

type PackageScripts = Record<string, string>

async function readPackageScripts(projectDirectory: string): Promise<PackageScripts | null> {
  try {
    const raw = await fs.readFile(path.join(projectDirectory, 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as { scripts?: PackageScripts }
    return parsed.scripts ?? null
  } catch {
    return null
  }
}

function runScript(manager: string, script: string): string {
  if (manager === 'yarn') return `yarn ${script}`
  if (manager === 'pnpm') return `pnpm run ${script}`
  if (manager === 'bun') return `bun run ${script}`
  return `npm run ${script}`
}

export async function resolveProductionStartCommand(
  plan: InstallationPlanPayload,
  projectDirectory: string,
): Promise<ControlledCommand | null> {
  // Perfil supabase-local-v1: sem vite preview/dev genérico; runtime próprio chega nos itens 5+.
  if (await directoryUsesManifestProfile(projectDirectory)) return null

  const scripts = await readPackageScripts(projectDirectory)
  const manager = plan.packageManager.toLowerCase()
  const bindHost = getAppBindHost()

  if (scripts) {
    if (scripts.preview) {
      const previewArgs =
        manager === 'npm'
          ? { executable: 'npm', args: ['run', 'preview', '--', '--host', bindHost, '--port', '4173'], label: 'npm run preview' }
          : manager === 'pnpm'
            ? { executable: 'pnpm', args: ['run', 'preview', '--', '--host', bindHost, '--port', '4173'], label: 'pnpm run preview' }
            : null
      if (previewArgs) return previewArgs
    }

    if (scripts.dev) {
      const devArgs =
        manager === 'npm'
          ? { executable: 'npm', args: ['run', 'dev', '--', '--host', bindHost, '--port', '5173'], label: 'npm run dev' }
          : manager === 'pnpm'
            ? { executable: 'pnpm', args: ['run', 'dev', '--', '--host', bindHost, '--port', '5173'], label: 'pnpm run dev' }
            : null
      if (devArgs) return devArgs
    }

    for (const scriptName of ['start'] as const) {
      if (!scripts[scriptName]) continue
      const command = runScript(manager, scriptName)
      const resolved = resolveStartCommand({ ...plan, startCommand: command, devCommand: null })
      if (resolved) return resolved
    }
  }

  return resolveStartCommand(plan)
}
