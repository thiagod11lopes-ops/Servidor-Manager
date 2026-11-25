import { getManagerInstallRoot } from './managerInstallRoot.ts'
import {
  getBundledOmpsServerStatus,
  startBundledOmpsServerInstall,
} from './installBundledOmpsServer.ts'
import {
  isServidorOmpsProduct,
  normalizeServidorOmpsLanAccess,
  readActiveServidorOmpsProductConfig,
} from '../products/servidorOmpsProductConfig.ts'
import { isInstallationDuplicateConflict } from '../installation/installationDuplicateGuard.ts'
import { readBundledOmpsFirstRunRecord } from './bundledOmpsFirstRunStore.ts'
import { isEmbeddedOmpsInstallBusy } from '../servidorOmps/servidorOmpsEmbeddedInstallHint.ts'

/**
 * Servidor OMPS: materializa o payload embarcado uma vez, sem wizard na UI.
 * OMPS Usuário (cliente) usa a URL local do contrato (127.0.0.1) quando aplicável.
 */
export async function ensureServidorOmpsProvisionOnStartup(): Promise<void> {
  const installRoot = getManagerInstallRoot()
  if (!installRoot) return

  const product = await readActiveServidorOmpsProductConfig()
  if (!isServidorOmpsProduct(product)) return

  const status = await getBundledOmpsServerStatus()
  if (!status.ok || !status.available) return
  if (status.firstRun?.completed) return

  const persistedFirstRun = await readBundledOmpsFirstRunRecord()
  const resumeSystemId =
    status.firstRun && !status.firstRun.completed
      ? status.firstRun.systemId
      : persistedFirstRun && !persistedFirstRun.completedAt
        ? persistedFirstRun.systemId
        : null
  const resumeDecision = resumeSystemId
    ? ({ action: 'resume', systemId: resumeSystemId } as const)
    : undefined

  const lan = normalizeServidorOmpsLanAccess(product)
  const provisionAccessMode = lan.lanHostMode === 'local' ? 'local' : 'lan'

  if (resumeSystemId && isEmbeddedOmpsInstallBusy(resumeSystemId)) {
    return
  }

  let result = await startBundledOmpsServerInstall({
    accessMode: provisionAccessMode,
    ...(resumeDecision ? { duplicateDecision: resumeDecision } : {}),
  })

  if (isInstallationDuplicateConflict(result)) {
    if (result.options.canResume) {
      result = await startBundledOmpsServerInstall({
        accessMode: provisionAccessMode,
        duplicateDecision: { action: 'resume', systemId: result.existing.systemId },
      })
    } else {
      console.warn('[servidor-omps] Provisionamento automático não concluído:', result.message)
      return
    }
  }

  if (result.ok && 'accepted' in result && result.accepted) {
    console.log('[servidor-omps] Provisionamento automático do payload embarcado iniciado:', result.systemId)
    return
  }

  if (!result.ok && 'paused' in result && result.paused) {
    console.warn('[servidor-omps] Provisionamento aguardando Docker:', result.message)
    return
  }

  if (!result.ok) {
    const benign =
      result.message.includes('instalação em andamento') ||
      result.message.includes('Instalação já está em execução')
    if (!benign) {
      console.warn('[servidor-omps] Provisionamento automático:', result.message)
    }
  }
}
