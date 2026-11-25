import fs from 'node:fs/promises'
import path from 'node:path'
import { getSystemRoot } from '../installation/paths.ts'
import { appendManifestPhaseLog, writeManifestPhaseOutput } from './manifestPhaseLog.ts'
import { ensureLanHttpPortForSystem } from './lanHttpPortGuard.ts'
import { parseExistingHttpPort } from './maintenancePrepareServidorEnv.ts'
import { resolveServidorEnvPaths } from './prepareServidorEnv.ts'
import { redactSupabaseCliOutput } from './redactSupabaseCliOutput.ts'
import { ensureManifestFrontendDependencies } from './ensureManifestFrontendDependencies.ts'
import { loadServidorEnvIntoProcessEnv } from './loadServidorEnvIntoProcessEnv.ts'
import { runElevatedPowerShellScript } from './runElevatedPowerShell.ts'
import { resolveScriptPath, runManifestScript } from './scriptRunner.ts'
import { runEnsureLanFirewallLinux } from './ensureLanFirewallLinux.ts'
import { supabaseEnsureStarted, supabaseRestart } from './supabaseLocalCommands.ts'
import {
  lanBuildHttpPortMismatch,
  regenerateLanHttpPortConsumers,
} from './regenerateLanHttpPortConsumers.ts'
import { runProxyStartWithPortRecovery } from './proxyStartPortRecovery.ts'
import { verifyManifestLanReadiness } from './verifyManifestLanReadiness.ts'
import { loadActiveServidorOmpsFixedLanPolicy } from '../products/servidorOmpsFixedLanRuntime.ts'
import { probeLocalHttpUrl } from '../network/probeLocalHttpUrl.ts'
import { writeOmpsSystemHttpPort } from './ompsSystemPorts.ts'
import type { PhaseContext, PhaseHandlerResult, PhaseHandlers } from './executePhasePlan.ts'
import type { ManifestScriptItem, PlannedPhase } from './types.ts'

const SCRIPT_TIMEOUT_MS = 900_000

/** Scripts de firewall no manifesto 1.2.0 não marcam requiresElevation; o Manager eleva aqui. */
const ELEVATED_MANIFEST_PHASE_IDS = new Set(['network.firewall', 'network.block-internal-ports'])

function formatScriptFailureMessage(script: ManifestScriptItem, exitCode: number | null | undefined, output: string): string {
  const truncated = truncateOutput(output)
  if (exitCode === 1223) {
    return (
      `${script.id} cancelado (código 1223): permissão de Administrador negada ou prompt UAC fechado antes de aplicar regras de firewall LAN. ` +
      'Execute a instalação novamente no mesmo systemId — fases já concluídas (ex.: 78%) são preservadas (phases-failed). ' +
      'Quando o progresso chegar em network · block-internal-ports, aceite o UAC (Sim). ' +
      'Opcional: inicie o Servidor OMPS “Como administrador” para pular o prompt nesta fase.'
    )
  }
  return `${script.id} falhou (código ${exitCode ?? '?'}): ${truncated}`
}

function truncateOutput(output: string, max = 2000): string {
  const trimmed = output.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}\n… (truncado, veja logs/phase-*.log)`
}

async function runScriptPhase(
  ctx: PhaseContext,
  phase: PlannedPhase,
  script: ManifestScriptItem,
): Promise<PhaseHandlerResult> {
  const phaseId = phase.phase.id
  await appendManifestPhaseLog(ctx.systemId, phaseId, `Iniciando script ${script.id} (${script.path})`)

  if (phaseId === 'proxy.start') {
    const envPaths = resolveServidorEnvPaths(ctx.rootDirectory, ctx.manifest)
    let preferredHttpPort = 8080
    try {
      const envContent = await fs.readFile(envPaths.envPath, 'utf8')
      preferredHttpPort = parseExistingHttpPort(envContent) ?? 8080
    } catch {
      // servidor.env deve existir nesta fase
    }
    const lanPort = await ensureLanHttpPortForSystem({
      systemId: ctx.systemId,
      rootDirectory: ctx.rootDirectory,
      manifest: ctx.manifest,
      preferredPort: preferredHttpPort,
    })
    if (!lanPort.ok) {
      return { ok: false, message: lanPort.message, output: lanPort.message }
    }
    if (lanPort.changed) {
      await appendManifestPhaseLog(ctx.systemId, phaseId, lanPort.message)
    }

    const portCheck = await lanBuildHttpPortMismatch(ctx.rootDirectory, ctx.manifest)
    if (lanPort.changed || portCheck.mismatch) {
      const regen = await regenerateLanHttpPortConsumers({
        systemId: ctx.systemId,
        rootDirectory: ctx.rootDirectory,
        manifest: ctx.manifest,
        platform: ctx.platform,
        includeFrontendBuild: true,
        phaseIdForLog: phaseId,
      })
      if (!regen.ok) {
        return { ok: false, message: regen.message, output: regen.output }
      }
      await appendManifestPhaseLog(ctx.systemId, phaseId, regen.message)
    }

    await appendManifestPhaseLog(
      ctx.systemId,
      phaseId,
      'Pré-checagem Supabase (stack + edge runtime) antes de start-servidor-lan.ps1',
    )
    const supa = await supabaseEnsureStarted(ctx.rootDirectory, { systemId: ctx.systemId })
    await writeManifestPhaseOutput(ctx.systemId, phaseId, supa.output)
    if (!supa.ok) {
      return {
        ok: false,
        message: `Supabase indisponível antes do proxy LAN: ${truncateOutput(supa.output)}`,
        output: supa.output,
      }
    }

    const proxyResult = await runProxyStartWithPortRecovery(
      {
        systemId: ctx.systemId,
        rootDirectory: ctx.rootDirectory,
        manifest: ctx.manifest,
        platform: ctx.platform,
        startScript: script,
        phaseIdForLog: phaseId,
        onLog: (line) => appendManifestPhaseLog(ctx.systemId, phaseId, line),
      },
      lanPort.httpPort,
    )

    await writeManifestPhaseOutput(ctx.systemId, phaseId, proxyResult.output)
    if (!proxyResult.ok) {
      return {
        ok: false,
        message: formatScriptFailureMessage(script, null, `${proxyResult.message}\n${proxyResult.output}`),
        output: proxyResult.output,
      }
    }

    await writeOmpsSystemHttpPort(ctx.systemId, proxyResult.httpPort)
    const fixedLanPolicy = await loadActiveServidorOmpsFixedLanPolicy()
    const readiness = await verifyManifestLanReadiness(proxyResult.httpPort, probeLocalHttpUrl, {
      fixedLan: fixedLanPolicy?.fixed,
      resolvedLanHost: fixedLanPolicy?.resolvedHost,
    })
    await appendManifestPhaseLog(ctx.systemId, phaseId, readiness.message)
    for (const check of readiness.checks) {
      await appendManifestPhaseLog(
        ctx.systemId,
        phaseId,
        `  prontidão ${check.id}: ${check.ok ? 'OK' : 'FALHA'} — ${check.detail}`,
      )
    }
    if (!readiness.ok) {
      return {
        ok: false,
        message: readiness.message,
        output: `${proxyResult.output}\n${readiness.message}`,
      }
    }

    return {
      ok: true,
      message: `${script.id} concluído (porta HTTP ${proxyResult.httpPort}). ${readiness.message}`,
      output: proxyResult.output,
    }
  }

  const env = await loadServidorEnvIntoProcessEnv(ctx.rootDirectory, ctx.manifest)

  if (phaseId === 'frontend.build') {
    await appendManifestPhaseLog(
      ctx.systemId,
      phaseId,
      'Pré-instalação de dependências do frontend (Manager, antes do build-producao-lan.ps1)',
    )
    const deps = await ensureManifestFrontendDependencies({
      rootDirectory: ctx.rootDirectory,
      onOutputLine: (line) => {
        ctx.reportPhase?.({
          phaseId,
          status: 'running',
          message: line.length > 160 ? `${line.slice(0, 157)}…` : line,
        })
      },
    })
    if (!deps.ok) {
      await writeManifestPhaseOutput(ctx.systemId, phaseId, deps.output)
      return {
        ok: false,
        message: deps.message,
        output: deps.output,
      }
    }
    if (!deps.skipped) {
      await appendManifestPhaseLog(ctx.systemId, phaseId, deps.message)
    }
  }

  const needsElevation =
    script.requiresElevation === true ||
    phase.requiresElevation === true ||
    ELEVATED_MANIFEST_PHASE_IDS.has(phaseId)

  const run =
    needsElevation && script.interpreter === 'powershell' && process.platform === 'win32'
      ? await (async () => {
          const scriptPath = resolveScriptPath(ctx.rootDirectory, script)
          const elevated = await runElevatedPowerShellScript(scriptPath, ctx.rootDirectory, {
            onStatus: (line) => {
              void appendManifestPhaseLog(ctx.systemId, phaseId, line)
              ctx.reportPhase?.({
                phaseId,
                status: 'running',
                message: line.length > 160 ? `${line.slice(0, 157)}…` : line,
              })
            },
          })
          return {
            ok: elevated.ok && (elevated.exitCode ?? 1) === 0,
            output: elevated.output,
            exitCode: elevated.exitCode,
          }
        })()
      : await runManifestScript({
          rootDirectory: ctx.rootDirectory,
          script,
          env,
          timeoutMs: SCRIPT_TIMEOUT_MS,
          onOutputLine: (line) => {
            ctx.reportPhase?.({
              phaseId,
              status: 'running',
              message: line.length > 160 ? `${line.slice(0, 157)}…` : line,
            })
          },
        })

  await writeManifestPhaseOutput(ctx.systemId, phaseId, run.output)

  if (!run.ok) {
    return {
      ok: false,
      message: formatScriptFailureMessage(script, run.exitCode, run.output),
      output: run.output,
    }
  }

  return {
    ok: true,
    message: `${script.id} concluído.`,
    output: run.output,
  }
}

export function createManifestPhaseHandlers(): PhaseHandlers {
  return {
    capabilities: {
      'supabase.ensure-started': async (ctx, phase) => {
        await appendManifestPhaseLog(ctx.systemId, phase.phase.id, 'Capability supabase.ensure-started')
        const result = await supabaseEnsureStarted(ctx.rootDirectory, { systemId: ctx.systemId })
        await writeManifestPhaseOutput(ctx.systemId, phase.phase.id, result.output)
        const logPath = path.join(getSystemRoot(ctx.systemId), 'logs', `phase-${phase.phase.id}.log`)
        return result.ok
          ? { ok: true, message: 'Supabase local iniciado (Docker).', output: result.output }
          : {
              ok: false,
              message: `Supabase / edge runtime: ${truncateOutput(redactSupabaseCliOutput(result.output))} (log: ${logPath})`,
              output: result.output,
            }
      },
      'manager.lan-firewall-linux': async (ctx, phase) => {
        await appendManifestPhaseLog(ctx.systemId, phase.phase.id, 'Capability manager.lan-firewall-linux')
        const result = await runEnsureLanFirewallLinux({
          rootDirectory: ctx.rootDirectory,
          manifest: ctx.manifest,
        })
        await writeManifestPhaseOutput(ctx.systemId, phase.phase.id, result.output)
        return result.ok
          ? { ok: true, message: 'Firewall LAN (Linux) aplicado ou documentado.', output: result.output }
          : { ok: false, message: result.output, output: result.output }
      },
      'supabase.restart': async (ctx, phase) => {
        await appendManifestPhaseLog(ctx.systemId, phase.phase.id, 'Capability supabase.restart')
        const result = await supabaseRestart(ctx.rootDirectory, { systemId: ctx.systemId })
        await writeManifestPhaseOutput(ctx.systemId, phase.phase.id, result.output)
        return result.ok
          ? { ok: true, message: 'Supabase reiniciado após configure-auth-lan.', output: result.output }
          : { ok: false, message: `Supabase restart falhou: ${truncateOutput(result.output)}`, output: result.output }
      },
    },
    script: (ctx, phase, script) => runScriptPhase(ctx, phase, script),
  }
}

/** Fases do item 3 (manifesto 1.2.0) — inclusive `frontend.build`. */
export const MANIFEST_PHASES_THROUGH_BUILD = new Set([
  'backend.ensure-started',
  'database.schema',
  'backend.configure-auth',
  'backend.restart',
  'frontend.build',
])
