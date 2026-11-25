import type {
  ManifestScriptItem,
  PhaseExecutionPlan,
  PlannedPhase,
  ServerManifest,
} from './types.ts'
import {
  consumeInstallationUserPause,
  USER_PAUSE_MESSAGE,
} from '../installation/installationUserControl.ts'

export type PhaseProgressEvent = {
  phaseId: string
  status: 'running' | 'completed' | 'failed' | 'skipped' | 'blocked'
  message?: string
}

export type PhaseContext = {
  systemId: string
  rootDirectory: string
  manifest: ServerManifest
  platform: PhaseExecutionPlan['platform']
  log: (line: string) => void | Promise<void>
  reportPhase?: (event: PhaseProgressEvent) => void
}

export type PhaseHandlerResult = { ok: boolean; message: string; output?: string }

export type PhaseHandlers = {
  /** Handlers por `capability` (ex.: supabase.ensure-started) — itens 3+. */
  capabilities?: Record<string, (ctx: PhaseContext, phase: PlannedPhase) => Promise<PhaseHandlerResult>>
  /** Execução de scripts do manifesto — itens 3+ (validate-server-manifest roda direto na validação). */
  script?: (ctx: PhaseContext, phase: PlannedPhase, script: ManifestScriptItem) => Promise<PhaseHandlerResult>
}

export type PhaseOutcomeStatus =
  | 'ok'
  | 'skipped'
  | 'planned'
  | 'deferred'
  | 'failed'
  | 'blocked'
  | 'not_implemented'
  | 'not_run'

export type PhaseOutcome = {
  order: number
  phaseId: string
  status: PhaseOutcomeStatus
  message: string
}

export type PhaseExecutionResult = {
  ok: boolean
  /** Primeira fase que impediu a continuação (falha, bloqueio ou handler ausente). */
  stoppedAt?: string
  outcomes: PhaseOutcome[]
}

/**
 * Executor genérico das fases do manifesto (etapa 18).
 * - `dryRun`: apenas lista o que seria executado, na ordem validada.
 * - Sem handler para uma fase `run`: para com `not_implemented` (nunca finge sucesso).
 */
export async function executePhasePlan(
  plan: PhaseExecutionPlan,
  ctx: PhaseContext,
  handlers: PhaseHandlers = {},
  options: {
    dryRun?: boolean
    executeThroughPhaseId?: string
    /** Executa somente fases depois deste id (reinstalação item 4 / retomada). */
    executeOnlyAfterPhaseId?: string
    /** Fases já concluídas (retomada após phases-failed) — não reexecuta. */
    skipCompletedPhaseIds?: Set<string>
    /** Executa somente estes ids (ex.: frontend.build após correção de LAN host). */
    runOnlyPhaseIds?: Set<string>
  } = {},
): Promise<PhaseExecutionResult> {
  const outcomes: PhaseOutcome[] = []
  let stoppedAt: string | undefined
  let deferRemaining = false
  let afterAnchor = !options.executeOnlyAfterPhaseId

  for (const planned of plan.phases) {
    const id = planned.phase.id
    const base = { order: planned.order, phaseId: id }

    if (options.runOnlyPhaseIds && !options.runOnlyPhaseIds.has(id)) {
      continue
    }

    if (!afterAnchor) {
      if (id === options.executeOnlyAfterPhaseId) {
        afterAnchor = true
        continue
      }
      if (planned.status === 'run') {
        const message = 'Já concluída em etapa anterior (item 3).'
        ctx.reportPhase?.({ phaseId: id, status: 'skipped', message })
        outcomes.push({
          ...base,
          status: 'skipped',
          message,
        })
      } else if (planned.status === 'skip') {
        const message = planned.reason ?? 'Ignorada'
        ctx.reportPhase?.({ phaseId: id, status: 'skipped', message })
        outcomes.push({ ...base, status: 'skipped', message })
      }
      continue
    }

    if (stoppedAt) {
      outcomes.push({ ...base, status: 'not_run', message: `Não executada: parou em ${stoppedAt}` })
      continue
    }

    if (planned.status === 'skip') {
      const message = planned.reason ?? 'Ignorada'
      ctx.reportPhase?.({ phaseId: id, status: 'skipped', message })
      outcomes.push({ ...base, status: 'skipped', message })
      continue
    }

    if (options.skipCompletedPhaseIds?.has(id) && planned.status === 'run') {
      const message = 'Concluída na tentativa anterior (retomada).'
      ctx.reportPhase?.({ phaseId: id, status: 'skipped', message })
      outcomes.push({ ...base, status: 'ok', message })
      continue
    }

    if (planned.status === 'blocked') {
      stoppedAt = id
      const message = planned.reason ?? 'Bloqueada'
      ctx.reportPhase?.({ phaseId: id, status: 'blocked', message })
      outcomes.push({ ...base, status: 'blocked', message })
      continue
    }

    if (deferRemaining && planned.status === 'run') {
      outcomes.push({
        ...base,
        status: 'deferred',
        message: 'Prevista no item 4 (Caddy :8080, firewall e testes LAN).',
      })
      continue
    }

    if (options.dryRun) {
      const what =
        planned.resolution?.kind === 'script'
          ? `script ${planned.resolution.script.id}`
          : `capability ${planned.resolution?.kind === 'capability' ? planned.resolution.capability : '?'}`
      outcomes.push({ ...base, status: 'planned', message: `Planejada: ${what}` })
      continue
    }

    if (consumeInstallationUserPause(ctx.systemId)) {
      stoppedAt = id
      const message = USER_PAUSE_MESSAGE
      ctx.reportPhase?.({ phaseId: id, status: 'failed', message })
      outcomes.push({ ...base, status: 'failed', message })
      continue
    }

    ctx.reportPhase?.({ phaseId: id, status: 'running' })

    const resolution = planned.resolution
    let result: PhaseHandlerResult | null = null

    if (resolution?.kind === 'capability') {
      const handler = handlers.capabilities?.[resolution.capability]
      if (handler) result = await handler(ctx, planned)
    } else if (resolution?.kind === 'script' && handlers.script) {
      result = await handlers.script(ctx, planned, resolution.script)
    }

    if (!result) {
      stoppedAt = id
      const message = 'Handler ainda não implementado no Manager para esta fase.'
      ctx.reportPhase?.({ phaseId: id, status: 'failed', message })
      outcomes.push({
        ...base,
        status: 'not_implemented',
        message,
      })
      continue
    }

    await ctx.log(`[${id}] ${result.ok ? 'OK' : 'FALHA'}: ${result.message}`)
    if (result.ok) {
      ctx.reportPhase?.({ phaseId: id, status: 'completed', message: result.message })
      outcomes.push({ ...base, status: 'ok', message: result.message })
      if (options.executeThroughPhaseId && id === options.executeThroughPhaseId) {
        deferRemaining = true
      }
    } else {
      stoppedAt = id
      ctx.reportPhase?.({ phaseId: id, status: 'failed', message: result.message })
      outcomes.push({ ...base, status: 'failed', message: result.message })
    }
  }

  return { ok: !stoppedAt, stoppedAt, outcomes }
}
