import { scriptNeedsBashOnWindows, scriptSupportsPlatform } from './scriptRunner.ts'
import type {
  ManifestPhase,
  ManifestPlatform,
  ManifestScriptItem,
  PhaseExecutionPlan,
  PlannedPhase,
  ServerManifest,
} from './types.ts'

export function detectManifestPlatform(): ManifestPlatform | null {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'linux') return 'linux'
  return null
}

/** Ordem do array do manifesto, adiando fases cujos `dependsOn` ainda não foram emitidos. */
function orderPhases(phases: ManifestPhase[]): ManifestPhase[] {
  const emitted = new Set<string>()
  const ordered: ManifestPhase[] = []
  const pending = [...phases]

  while (pending.length > 0) {
    const index = pending.findIndex((phase) => (phase.dependsOn ?? []).every((dep) => emitted.has(dep)))
    if (index === -1) {
      // Ciclo/ref inexistente: a validação já reporta; mantém o restante na ordem original.
      ordered.push(...pending)
      break
    }
    const [phase] = pending.splice(index, 1)
    ordered.push(phase)
    emitted.add(phase.id)
  }

  return ordered
}

function resolveScriptId(phase: ManifestPhase, platform: ManifestPlatform): string | null {
  if (phase.scriptIdByPlatform) return phase.scriptIdByPlatform[platform] ?? null
  return phase.scriptId ?? null
}

export type BuildPlanOptions = {
  platform: ManifestPlatform
  /** `ACOMOPMS_OVERLAY_ENABLED=true` — habilita fases `overlay.*` opcionais. */
  overlayEnabled?: boolean
  /** Outras fases opcionais habilitadas explicitamente pelo usuário. */
  enabledOptionalPhases?: string[]
}

/**
 * Monta o plano de execução a partir de `installPlan.phases` (etapas 18 e 46).
 * Não executa nada; respeita dependsOn, optional, platforms e scriptIdByPlatform.
 */
export function buildPhaseExecutionPlan(manifest: ServerManifest, options: BuildPlanOptions): PhaseExecutionPlan {
  const scriptsById = new Map<string, ManifestScriptItem>(
    (manifest.scripts?.items ?? []).map((item) => [item.id, item]),
  )
  const overlayEnabled = options.overlayEnabled === true
  const enabledOptional = new Set(options.enabledOptionalPhases ?? [])
  if (overlayEnabled) enabledOptional.add('overlay.server')

  const planned: PlannedPhase[] = []
  let order = 0

  for (const phase of orderPhases(manifest.installPlan?.phases ?? [])) {
    order += 1
    const base = { order, phase, requiresElevation: false }

    if (
      phase.id === 'network.firewall' &&
      options.platform === 'linux' &&
      phase.platforms?.includes('windows') &&
      !phase.platforms.includes('linux')
    ) {
      planned.push({
        ...base,
        status: 'run',
        resolution: { kind: 'capability', capability: 'manager.lan-firewall-linux' },
        note: 'Firewall LAN via ufw (Manager) — equivalente à fase Windows.',
      })
      continue
    }

    if (phase.platforms && phase.platforms.length > 0 && !phase.platforms.includes(options.platform)) {
      planned.push({ ...base, status: 'skip', reason: `Somente em: ${phase.platforms.join(', ')}` })
      continue
    }

    if (phase.optional === true && !enabledOptional.has(phase.id)) {
      planned.push({ ...base, status: 'skip', reason: 'Fase opcional desligada (overlay/WireGuard)' })
      continue
    }

    if (phase.type === 'capability') {
      if (!phase.capability) {
        planned.push({ ...base, status: 'blocked', reason: 'Fase sem campo "capability"' })
        continue
      }
      planned.push({
        ...base,
        status: 'run',
        resolution: { kind: 'capability', capability: phase.capability },
      })
      continue
    }

    const scriptId = resolveScriptId(phase, options.platform)
    if (!scriptId) {
      planned.push({
        ...base,
        status: 'blocked',
        reason: `Sem script para a plataforma ${options.platform}`,
      })
      continue
    }

    const script = scriptsById.get(scriptId)
    if (!script) {
      planned.push({ ...base, status: 'blocked', reason: `scriptId inexistente: ${scriptId}` })
      continue
    }

    if (!scriptSupportsPlatform(script, options.platform)) {
      planned.push({
        ...base,
        status: 'blocked',
        reason: `Script ${script.id} não suporta ${options.platform}`,
      })
      continue
    }

    planned.push({
      ...base,
      status: 'run',
      resolution: { kind: 'script', script },
      requiresElevation: script.requiresElevation === true,
      note: scriptNeedsBashOnWindows(script, options.platform)
        ? 'Exige bash no Windows (Git Bash ou WSL)'
        : undefined,
    })
  }

  return { platform: options.platform, overlayEnabled, phases: planned }
}
