import type { ServerManifest } from './types.ts'
import { prepareBundledOmpsLanResume } from '../bundledOmps/prepareBundledOmpsLanResume.ts'
import { lanBuildHttpPortMismatch } from './regenerateLanHttpPortConsumers.ts'

const FIREWALL_PHASES = ['network.firewall', 'network.block-internal-ports'] as const

/**
 * Antes do item 4: sincroniza scripts OMPS empacotados e invalida fases LAN/firewall
 * quando porta ou payload não coincidem com o estado persistido.
 */
export async function prepareManifestLanItem4Resume(input: {
  systemId: string
  projectDirectory: string
  sourceUrl: string
  manifest: ServerManifest
  skipCompletedPhaseIds: Set<string>
  messages: string[]
}): Promise<void> {
  await prepareBundledOmpsLanResume({
    systemId: input.systemId,
    projectDirectory: input.projectDirectory,
    sourceUrl: input.sourceUrl,
    skipCompletedPhaseIds: input.skipCompletedPhaseIds,
    messages: input.messages,
  })

  const portCheck = await lanBuildHttpPortMismatch(input.projectDirectory, input.manifest)
  if (portCheck.mismatch) {
    input.messages.push(
      `Porta em servidor.env (${portCheck.envPort}) difere do frontend/dist/lan-build.json (${portCheck.buildPort}) — rebuild/proxy serão revalidados.`,
    )
    for (const phaseId of ['frontend.build', 'proxy.generate-config', 'connection.generate-runtime', 'proxy.start']) {
      input.skipCompletedPhaseIds.delete(phaseId)
    }
  }

  for (const phaseId of FIREWALL_PHASES) {
    input.skipCompletedPhaseIds.delete(phaseId)
  }
}
