import { ensureLanHttpPortForSystem } from './lanHttpPortGuard.ts'
import { isRecoverableLanHttpPortFailure } from './portBindConflict.ts'
import { loadActiveServidorOmpsFixedLanPolicy } from '../products/servidorOmpsFixedLanRuntime.ts'
import { regenerateLanHttpPortConsumers } from './regenerateLanHttpPortConsumers.ts'
import { loadServidorEnvIntoProcessEnv } from './loadServidorEnvIntoProcessEnv.ts'
import { runManifestScript, type ScriptRunResult } from './scriptRunner.ts'
import type { ManifestPlatform, ManifestScriptItem, ServerManifest } from './types.ts'

export const PROXY_START_PORT_RETRY_MAX = 5
const SCRIPT_TIMEOUT_MS = 900_000

export type ProxyStartAttemptContext = {
  systemId: string
  rootDirectory: string
  manifest: ServerManifest
  platform: ManifestPlatform
  startScript: ManifestScriptItem
  phaseIdForLog?: string
  onLog?: (line: string) => void | Promise<void>
}

async function runStartScript(
  ctx: ProxyStartAttemptContext,
  env: NodeJS.ProcessEnv,
): Promise<ScriptRunResult> {
  return runManifestScript({
    rootDirectory: ctx.rootDirectory,
    script: ctx.startScript,
    env,
    timeoutMs: SCRIPT_TIMEOUT_MS,
  })
}

/**
 * Executa start-server-lan com retentativas: nova porta + regeneração de consumidores LAN.
 */
export async function runProxyStartWithPortRecovery(
  ctx: ProxyStartAttemptContext,
  initialHttpPort: number,
): Promise<{ ok: true; httpPort: number; output: string } | { ok: false; httpPort: number; output: string; message: string }> {
  const fixedPolicy = await loadActiveServidorOmpsFixedLanPolicy()
  const strictHttpPort =
    fixedPolicy != null && fixedPolicy.fixed.allowHttpPortFallback === false
  let httpPort = strictHttpPort ? fixedPolicy!.fixed.requiredHttpPort : initialHttpPort
  let env = { ...(await loadServidorEnvIntoProcessEnv(ctx.rootDirectory, ctx.manifest)), ACOMOPMS_SUPABASE_BOOTSTRAP_DONE: '1' }

  let run = await runStartScript(ctx, env)
  let combinedOutput = run.output

  if (strictHttpPort && !run.ok) {
    const recoverable = isRecoverableLanHttpPortFailure(run.output)
    const hint = recoverable
      ? `Recuperação por troca de porta desabilitada (Servidor OMPS exige ${fixedPolicy!.fixed.requiredHttpPort}).`
      : 'Falha não recuperável por troca de porta (veja logs).'
    return {
      ok: false,
      httpPort,
      output: combinedOutput,
      message: `${ctx.startScript.id} falhou (código ${run.exitCode ?? '?'}): ${hint}`,
    }
  }

  for (let attempt = 0; attempt < PROXY_START_PORT_RETRY_MAX && !run.ok; attempt += 1) {
    if (!isRecoverableLanHttpPortFailure(run.output)) {
      break
    }

    const nextBase = httpPort + 1
    await ctx.onLog?.(
      `Conflito ou falha recuperável na porta HTTP ${httpPort} — tentando faixa a partir de ${nextBase} (tentativa ${attempt + 1}/${PROXY_START_PORT_RETRY_MAX}).`,
    )

    const bumped = await ensureLanHttpPortForSystem({
      systemId: ctx.systemId,
      rootDirectory: ctx.rootDirectory,
      manifest: ctx.manifest,
      preferredPort: nextBase,
      scanFromPort: nextBase,
    })
    if (!bumped.ok) {
      return {
        ok: false,
        httpPort,
        output: combinedOutput,
        message: bumped.message,
      }
    }
    httpPort = bumped.httpPort
    await ctx.onLog?.(bumped.message)

    const regen = await regenerateLanHttpPortConsumers({
      systemId: ctx.systemId,
      rootDirectory: ctx.rootDirectory,
      manifest: ctx.manifest,
      platform: ctx.platform,
      includeFrontendBuild: true,
      phaseIdForLog: ctx.phaseIdForLog ?? 'proxy.start',
    })
    combinedOutput = `${combinedOutput}\n${regen.output}`
    if (!regen.ok) {
      return {
        ok: false,
        httpPort,
        output: combinedOutput,
        message: regen.message,
      }
    }

    env = await loadServidorEnvIntoProcessEnv(ctx.rootDirectory, ctx.manifest)
    env.ACOMOPMS_SUPABASE_BOOTSTRAP_DONE = '1'
    run = await runStartScript(ctx, env)
    combinedOutput = `${combinedOutput}\n${run.output}`
  }

  if (!run.ok) {
    const hint = isRecoverableLanHttpPortFailure(run.output)
      ? 'Nenhuma porta livre na faixa ou falha persistente do Caddy.'
      : 'Falha não recuperável por troca de porta (veja logs).'
    return {
      ok: false,
      httpPort,
      output: combinedOutput,
      message: `${ctx.startScript.id} falhou (código ${run.exitCode ?? '?'}): ${hint}`,
    }
  }

  return { ok: true, httpPort, output: combinedOutput }
}
