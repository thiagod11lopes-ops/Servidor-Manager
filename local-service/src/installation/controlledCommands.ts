import type { InstallationPlanPayload } from '../plan/buildInstallationPlan.ts'

export type ControlledCommand = {
  executable: string
  args: string[]
  label: string
}

const SCRIPT_NAME_RE = /^[a-z0-9:_-]+$/i

function parseRunScript(command: string): { manager: string; script: string } | null {
  const npmMatch = /^npm run ([a-z0-9:_-]+)$/i.exec(command.trim())
  if (npmMatch) return { manager: 'npm', script: npmMatch[1] }

  const yarnMatch = /^yarn ([a-z0-9:_-]+)$/i.exec(command.trim())
  if (yarnMatch) return { manager: 'yarn', script: yarnMatch[1] }

  const pnpmMatch = /^pnpm run ([a-z0-9:_-]+)$/i.exec(command.trim())
  if (pnpmMatch) return { manager: 'pnpm', script: pnpmMatch[1] }

  const bunMatch = /^bun run ([a-z0-9:_-]+)$/i.exec(command.trim())
  if (bunMatch) return { manager: 'bun', script: bunMatch[1] }

  return null
}

export function resolveInstallCommand(plan: InstallationPlanPayload): ControlledCommand | null {
  const manager = plan.packageManager.toLowerCase()
  const expected = plan.installCommands[0]?.trim()

  if (manager === 'npm') {
    if (expected && expected !== 'npm install') return null
    return {
      executable: 'npm',
      args: ['install', '--include=dev', '--prefer-offline', '--no-audit', '--no-fund'],
      label: 'npm install --include=dev',
    }
  }
  if (manager === 'pnpm') {
    if (expected && expected !== 'pnpm install') return null
    return { executable: 'pnpm', args: ['install'], label: 'pnpm install' }
  }
  if (manager === 'yarn') {
    if (expected && expected !== 'yarn install') return null
    return { executable: 'yarn', args: ['install'], label: 'yarn install' }
  }
  if (manager === 'bun') {
    if (expected && expected !== 'bun install') return null
    return { executable: 'bun', args: ['install'], label: 'bun install' }
  }
  if (manager === 'pip') {
    if (expected && expected !== 'pip install -r requirements.txt') return null
    return {
      executable: 'python',
      args: ['-m', 'pip', 'install', '-r', 'requirements.txt'],
      label: 'pip install -r requirements.txt',
    }
  }
  if (manager === 'composer') {
    if (expected && expected !== 'composer install') return null
    return { executable: 'composer', args: ['install'], label: 'composer install' }
  }
  if (manager === 'cargo') {
    if (expected && expected !== 'cargo build') return null
    return { executable: 'cargo', args: ['build'], label: 'cargo build' }
  }

  return null
}

function resolveRunScriptCommand(
  plan: InstallationPlanPayload,
  command: string,
): ControlledCommand | null {
  const parsed = parseRunScript(command)
  if (!parsed || !SCRIPT_NAME_RE.test(parsed.script)) return null

  const manager = plan.packageManager.toLowerCase()
  if (parsed.manager !== manager) return null
  if (command.trim() !== command) return null

  if (parsed.manager === 'npm') {
    return { executable: 'npm', args: ['run', parsed.script], label: command }
  }
  if (parsed.manager === 'yarn') {
    return { executable: 'yarn', args: [parsed.script], label: command }
  }
  if (parsed.manager === 'pnpm') {
    return { executable: 'pnpm', args: ['run', parsed.script], label: command }
  }
  if (parsed.manager === 'bun') {
    return { executable: 'bun', args: ['run', parsed.script], label: command }
  }

  return null
}

export function resolveBuildCommand(plan: InstallationPlanPayload): ControlledCommand | null {
  if (!plan.buildCommand) return null
  return resolveRunScriptCommand(plan, plan.buildCommand)
}

export function resolveStartCommand(plan: InstallationPlanPayload): ControlledCommand | null {
  if (plan.startCommand) {
    const start = resolveRunScriptCommand(plan, plan.startCommand)
    if (start) return start
  }
  if (plan.devCommand) {
    return resolveRunScriptCommand(plan, plan.devCommand)
  }
  return null
}
