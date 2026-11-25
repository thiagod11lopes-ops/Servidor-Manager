import fs from 'node:fs/promises'
import path from 'node:path'
import { runControlledCommand } from '../installation/runControlledCommand.ts'
import { readSupabaseProjectIdFromRoot } from '../database/tableBrowser/supabaseLocalDbContainer.ts'
import { redactSupabaseCliOutput } from './redactSupabaseCliOutput.ts'
import {
  detectSupabaseWorkdirMismatch,
  readSupabaseStackWorkdir,
  supabaseWorkdirsEqual,
} from './supabaseStackWorkdir.ts'
import {
  detectForeignActiveStackOwner,
  resolveSystemIdForProjectRoot,
} from './supabaseStackOwnership.ts'
import { verifySupabaseStackProvenanceForMutation } from './supabaseStackProvenance.ts'
import { ensureManagerSupabaseLocalIdentity } from './supabaseLocalIdentity.ts'
import { resolveSupabaseCliExecutable } from '../installation/resolveCliTool.ts'

export type SupabaseCommandResult = { ok: boolean; output: string; label: string }

/** Invoca o CLI Supabase (Windows: wrapper `cmd` para shims npm `.cmd`). */
export async function runSupabase(args: string[], cwd: string): Promise<SupabaseCommandResult> {
  const label = `supabase ${args.join(' ')}`
  const resolved = await resolveSupabaseCliExecutable()
  const result = await runControlledCommand(
    { executable: resolved.executable, args, label },
    cwd,
    { envOverride: resolved.env },
  )
  return { ok: result.ok, output: result.output, label }
}

export async function assertSupabaseProjectRoot(rootDirectory: string): Promise<string | null> {
  const configPath = path.join(rootDirectory, 'supabase', 'config.toml')
  try {
    await fs.access(configPath)
    return null
  } catch {
    return `supabase/config.toml não encontrado em ${rootDirectory}`
  }
}

const ENSURE_EDGE_RUNTIME_REL = path.join(
  'Transferir para Servidor',
  'servidor-lan',
  'lib',
  'ensure-edge-runtime.mjs',
)

function supabaseStatusLooksRunning(output: string): boolean {
  return /API URL|is running|running/i.test(output)
}

function extractStoppedServices(output: string): string[] {
  const match = output.match(/Stopped services:\s*\[([^\]]+)\]/i)
  if (!match?.[1]) return []
  return match[1]
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function formatSupabaseWorkdirMismatchMessage(mismatch: {
  registeredWorkdir: string
  expectedWorkdir: string
}): string {
  const projectHint = 'O project_id em supabase/config.toml coincide com outra instalação local (mesmos containers Docker).'
  return [
    'Stack Supabase local registrado para outro diretório de instalação.',
    `Workdir nos containers: ${mismatch.registeredWorkdir}`,
    `Workdir deste sistema: ${mismatch.expectedWorkdir}`,
    projectHint,
    'O Manager executará supabase stop e supabase start neste clone para realinhar (volumes Docker não são apagados).',
  ].join('\n')
}

async function reconcileSupabaseStackWorkdir(
  rootDirectory: string,
  systemId?: string,
): Promise<SupabaseCommandResult | null> {
  const mismatch = await detectSupabaseWorkdirMismatch(rootDirectory)
  if (!mismatch) return null

  const blocked = await assertSafeSupabaseStackMutation(rootDirectory, systemId, 'reconcile')
  if (blocked) return blocked

  const preamble = formatSupabaseWorkdirMismatchMessage(mismatch)
  const stop = await runSupabase(['stop'], rootDirectory)
  if (!stop.ok && !/not running|No such container/i.test(stop.output)) {
    return {
      ok: false,
      output: `${preamble}\n\nFalha em supabase stop (realinhamento):\n${stop.output}`,
      label: 'supabase stop (workdir)',
    }
  }

  const start = await runSupabase(['start'], rootDirectory)
  if (!start.ok) {
    return {
      ok: false,
      output: `${preamble}\n\nsupabase stop concluído; supabase start falhou:\n${start.output}`,
      label: 'supabase start (workdir)',
    }
  }

  const afterWorkdir = await readSupabaseStackWorkdir(rootDirectory)
  if (afterWorkdir && !supabaseWorkdirsEqual(afterWorkdir, rootDirectory)) {
    return {
      ok: false,
      output: `${preamble}\n\nApós stop/start o workdir ainda difere (${afterWorkdir}).`,
      label: 'supabase workdir',
    }
  }

  return {
    ok: true,
    output: `${preamble}\n\nRealinhamento concluído.\n${start.output}`.trim(),
    label: 'supabase start (workdir)',
  }
}

/** Verifica edge runtime via script do manifesto (project_id + workdir). */
export async function probeEdgeRuntimeForProject(rootDirectory: string): Promise<{
  ok: boolean
  output: string
  skipped: boolean
}> {
  const scriptPath = path.join(rootDirectory, ENSURE_EDGE_RUNTIME_REL)
  try {
    await fs.access(scriptPath)
  } catch {
    return { ok: true, output: 'ensure-edge-runtime.mjs ausente — verificação omitida.', skipped: true }
  }

  const result = await runControlledCommand(
    { executable: 'node', args: [scriptPath, rootDirectory], label: 'ensure-edge-runtime' },
    rootDirectory,
  )
  return { ok: result.ok, output: result.output, skipped: false }
}

function formatEdgeRuntimeFailure(input: {
  rootDirectory: string
  startOutput: string
  edgeOutput: string
}): string {
  const stopped = extractStoppedServices(input.startOutput)
  const projectId = readSupabaseProjectIdFromRoot(input.rootDirectory)
  const lines = [
    'Supabase CLI reportou sucesso, mas o edge runtime deste clone não ficou disponível.',
  ]
  if (projectId) {
    lines.push(`project_id: ${projectId}`)
  }
  if (stopped.length > 0) {
    lines.push(`Serviços ainda parados após start: ${stopped.join(', ')}`)
  }
  if (/ausente para este projeto/i.test(input.edgeOutput)) {
    lines.push(
      'Nenhum container supabase_edge_runtime_* corresponde ao workdir desta instalação (stack de outro clone ou edge parado).',
    )
  }
  lines.push(input.edgeOutput.trim())
  return lines.filter(Boolean).join('\n')
}

export type SupabaseEnsureOptions = {
  /** systemId Manager — evita supabase stop em stack de outra instalação ativa. */
  systemId?: string
}

/** Capability `supabase.ensure-started` — Docker + `supabase start` na raiz do clone. */
export async function supabaseEnsureStarted(
  rootDirectory: string,
  options: SupabaseEnsureOptions = {},
): Promise<SupabaseCommandResult> {
  const missing = await assertSupabaseProjectRoot(rootDirectory)
  if (missing) return { ok: false, output: missing, label: 'supabase.ensure-started' }

  if (options.systemId?.trim()) {
    const identity = await ensureManagerSupabaseLocalIdentity({
      systemId: options.systemId.trim(),
      rootDirectory,
    })
    if (!identity.ok) {
      return { ok: false, output: identity.message, label: 'supabase-local-identity' }
    }
  }

  const reconcile = await reconcileSupabaseStackWorkdir(rootDirectory, options.systemId)
  if (reconcile && !reconcile.ok) {
    return reconcile
  }

  const status = await runSupabase(['status'], rootDirectory)
  if (status.ok && supabaseStatusLooksRunning(status.output)) {
    const edge = await probeEdgeRuntimeForProject(rootDirectory)
    if (edge.ok) {
      const combined = [
        reconcile?.output,
        `Supabase já em execução.\n${status.output}`,
        edge.skipped ? '' : edge.output,
      ]
        .filter(Boolean)
        .join('\n')
      return {
        ok: true,
        output: combined.trim(),
        label: reconcile ? reconcile.label : 'supabase status',
      }
    }

    const start = await runSupabase(['start'], rootDirectory)
    if (!start.ok) {
      return {
        ok: false,
        output: redactSupabaseCliOutput(
          `${formatEdgeRuntimeFailure({ rootDirectory, startOutput: start.output, edgeOutput: edge.output })}\n${start.output}`,
        ),
        label: 'supabase start (reconciliar edge)',
      }
    }

    const edgeRetry = await probeEdgeRuntimeForProject(rootDirectory)
    if (!edgeRetry.ok) {
      return {
        ok: false,
        output: redactSupabaseCliOutput(
          formatEdgeRuntimeFailure({
            rootDirectory,
            startOutput: start.output,
            edgeOutput: edgeRetry.output,
          }) + `\n${start.output}`,
        ),
        label: 'supabase start + edge-runtime',
      }
    }

    return {
      ok: true,
      output: redactSupabaseCliOutput(`${start.output}\n${edgeRetry.output}`.trim()),
      label: 'supabase start (reconciliar edge)',
    }
  }

  const start = await runSupabase(['start'], rootDirectory)
  if (!start.ok) return { ...start, output: redactSupabaseCliOutput(start.output) }

  const edge = await probeEdgeRuntimeForProject(rootDirectory)
  if (!edge.skipped && !edge.ok) {
    return {
      ok: false,
      output: redactSupabaseCliOutput(
        formatEdgeRuntimeFailure({ rootDirectory, startOutput: start.output, edgeOutput: edge.output }) +
          `\n${start.output}`,
      ),
      label: 'supabase start + edge-runtime',
    }
  }

  return {
    ok: true,
    output: redactSupabaseCliOutput(
      `${reconcile?.output ? `${reconcile.output}\n` : ''}${start.output}${edge.skipped ? '' : `\n${edge.output}`}`.trim(),
    ),
    label: start.label,
  }
}

/** Indica se o stack Supabase local parece estar em execução (Docker). */
export async function supabaseIsRunning(rootDirectory: string): Promise<boolean> {
  const missing = await assertSupabaseProjectRoot(rootDirectory)
  if (missing) return false
  const status = await runSupabase(['status'], rootDirectory)
  return status.ok && /API URL|is running|running/i.test(status.output)
}

async function assertSafeSupabaseStackMutation(
  rootDirectory: string,
  systemId: string | undefined,
  action: 'stop' | 'reconcile',
): Promise<SupabaseCommandResult | null> {
  const actionLabel = action === 'stop' ? 'reiniciar' : 'realinhar'
  if (!systemId?.trim()) {
    return {
      ok: false,
      output: `Operação supabase (${actionLabel}) exige systemId do Manager para validar propriedade da stack Docker.`,
      label: 'supabase ownership',
    }
  }

  const registeredWorkdir =
    (await readSupabaseStackWorkdir(rootDirectory)) ??
    (await detectSupabaseWorkdirMismatch(rootDirectory))?.registeredWorkdir ??
    null

  const foreign = registeredWorkdir
    ? await detectForeignActiveStackOwner({
        currentSystemId: systemId,
        registeredWorkdir,
      })
    : null

  const ownerSystemId = registeredWorkdir
    ? await resolveSystemIdForProjectRoot(registeredWorkdir)
    : null

  const verdict = await verifySupabaseStackProvenanceForMutation({
    systemId,
    rootDirectory,
    ownerSystemId,
    foreignActive: foreign,
  })

  if (!verdict.ok) {
    const hints =
      action === 'reconcile'
        ? 'Realinhamento automático só é permitido quando a stack Docker comprova workdir e project_id deste clone (ou está parada).'
        : undefined
    return {
      ok: false,
      output: [`Não foi possível ${actionLabel} Supabase: ${verdict.reason}`, hints].filter(Boolean).join('\n'),
      label: verdict.label,
    }
  }

  return null
}

/** Capability `supabase.restart` — `supabase stop` && `supabase start`. */
export async function supabaseRestart(
  rootDirectory: string,
  options: SupabaseEnsureOptions = {},
): Promise<SupabaseCommandResult> {
  const missing = await assertSupabaseProjectRoot(rootDirectory)
  if (missing) return { ok: false, output: missing, label: 'supabase.restart' }

  const blocked = await assertSafeSupabaseStackMutation(rootDirectory, options.systemId, 'stop')
  if (blocked) return blocked

  const stop = await runSupabase(['stop'], rootDirectory)
  if (!stop.ok && !/not running|No such container/i.test(stop.output)) {
    return { ok: false, output: `Falha em supabase stop:\n${stop.output}`, label: stop.label }
  }

  const start = await runSupabase(['start'], rootDirectory)
  if (!start.ok) return start
  return {
    ok: true,
    output: redactSupabaseCliOutput(`${stop.output ? `stop: ${stop.output}\n` : ''}${start.output}`.trim()),
    label: 'supabase restart',
  }
}
