import type { ManifestPhase, ManifestPlatform, ManifestScriptItem, ServerManifest } from './types.ts'

const STOP_CADDY_SCRIPT_ID = 'stop-server-lan-sh'

function scriptsById(manifest: ServerManifest): Map<string, ManifestScriptItem> {
  return new Map((manifest.scripts?.items ?? []).map((item) => [item.id, item]))
}

function resolveScriptId(phase: ManifestPhase, platform: ManifestPlatform): string | null {
  if (phase.scriptIdByPlatform) return phase.scriptIdByPlatform[platform] ?? null
  return phase.scriptId ?? null
}

/** Script da fase `proxy.start` (Caddy LAN). */
export function resolveProxyStartScript(
  manifest: ServerManifest,
  platform: ManifestPlatform,
): ManifestScriptItem | null {
  const phase = manifest.installPlan?.phases?.find((p) => p.id === 'proxy.start')
  if (!phase || phase.type !== 'script') return null
  const scriptId = resolveScriptId(phase, platform)
  if (!scriptId) return null
  return scriptsById(manifest).get(scriptId) ?? null
}

/** Para Caddy — no manifesto AcompOPMS só existe `stop-server-lan-sh` (bash, incl. Windows+Git Bash). */
export function resolveProxyStopScript(manifest: ServerManifest): ManifestScriptItem | null {
  return scriptsById(manifest).get(STOP_CADDY_SCRIPT_ID) ?? null
}
