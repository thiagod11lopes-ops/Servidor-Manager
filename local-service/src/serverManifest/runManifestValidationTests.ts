import { appendManifestPhaseLog, writeManifestPhaseOutput } from './manifestPhaseLog.ts'
import { loadServidorEnvIntoProcessEnv } from './loadServidorEnvIntoProcessEnv.ts'
import { runManifestScript } from './scriptRunner.ts'
import type { PhaseContext } from './executePhasePlan.ts'
import type { ServerManifest } from './types.ts'

function truncateOutput(output: string, max = 2000): string {
  const trimmed = output.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}\n… (truncado)`
}

/**
 * Etapas 25–27: testes obrigatórios em validation.postInstall.tests (ex.: verify-lan-security).
 * Ignora scripts já executados como fase do installPlan (ex.: test-server-lan).
 */
export async function runRequiredPostInstallTests(input: {
  ctx: PhaseContext
  manifest: ServerManifest
  completedScriptIds: Set<string>
}): Promise<{ ok: boolean; outcomes: Array<{ id: string; scriptId: string; ok: boolean; message: string }> }> {
  const tests = input.manifest.validation?.postInstall?.tests?.filter((t) => t.requiredForInstall) ?? []
  const scriptsById = new Map((input.manifest.scripts?.items ?? []).map((item) => [item.id, item]))
  const outcomes: Array<{ id: string; scriptId: string; ok: boolean; message: string }> = []

  for (const test of tests) {
    if (input.completedScriptIds.has(test.scriptId)) {
      outcomes.push({
        id: test.id,
        scriptId: test.scriptId,
        ok: true,
        message: 'Já executado na fase validation.post-install.',
      })
      continue
    }

    const script = scriptsById.get(test.scriptId)
    if (!script) {
      outcomes.push({
        id: test.id,
        scriptId: test.scriptId,
        ok: false,
        message: `Script ${test.scriptId} não encontrado no manifesto.`,
      })
      return { ok: false, outcomes }
    }

    const phaseId = `validation.test.${test.id}`
    await appendManifestPhaseLog(input.ctx.systemId, phaseId, `Teste obrigatório ${test.id} (${script.id})`)
    const env = await loadServidorEnvIntoProcessEnv(input.ctx.rootDirectory, input.ctx.manifest)
    const run = await runManifestScript({
      rootDirectory: input.ctx.rootDirectory,
      script,
      env,
      timeoutMs: 300_000,
    })
    await writeManifestPhaseOutput(input.ctx.systemId, phaseId, run.output)

    if (!run.ok) {
      outcomes.push({
        id: test.id,
        scriptId: test.scriptId,
        ok: false,
        message: `${test.id} falhou: ${truncateOutput(run.output)}`,
      })
      return { ok: false, outcomes }
    }

    outcomes.push({ id: test.id, scriptId: test.scriptId, ok: true, message: `${test.id} OK.` })
  }

  return { ok: true, outcomes }
}
