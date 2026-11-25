import {
  getBundledOmpsServerStatus,
  startBundledOmpsServerInstall,
} from '../bundledOmps/installBundledOmpsServer.ts'
import { isInstallationDuplicateConflict } from '../installation/installationDuplicateGuard.ts'
import {
  clearInstallationUserPause,
  requestInstallationUserPause,
  USER_PAUSE_MESSAGE,
} from '../installation/installationUserControl.ts'
import {
  ensureInstallationProgressHydrated,
  getInstallationProgress,
  interruptInstallationProgress,
  isInstallationInProgress,
} from '../installation/installationProgressStore.ts'
import { isInstallationJobRunning } from '../installation/installationJobRunner.ts'
import {
  isServidorOmpsProduct,
  normalizeServidorOmpsLanAccess,
  readActiveServidorOmpsProductConfig,
} from '../products/servidorOmpsProductConfig.ts'
import { resolveEmbeddedOmpsSystemId } from './ensureServidorOmpsEmbeddedRuntime.ts'
import { getServidorOmpsEmbeddedInstallProgress } from './servidorOmpsEmbeddedInstallProgress.ts'

export type ServidorOmpsEmbeddedInstallControlResponse =
  | {
      ok: true
      action: 'pause' | 'restart'
      message: string
      systemId: string | null
      progress: Awaited<ReturnType<typeof getServidorOmpsEmbeddedInstallProgress>>['progress']
    }
  | { ok: false; message: string }

async function resolveAccessMode(): Promise<'local' | 'lan' | null> {
  const product = await readActiveServidorOmpsProductConfig()
  if (!isServidorOmpsProduct(product)) return null
  const lan = normalizeServidorOmpsLanAccess(product)
  return lan.lanHostMode === 'local' ? 'local' : 'lan'
}

/** Pausa a instalação embutida (para entre fases; a fase atual pode concluir). */
export async function pauseServidorOmpsEmbeddedInstall(): Promise<ServidorOmpsEmbeddedInstallControlResponse> {
  const systemId = await resolveEmbeddedOmpsSystemId()
  if (!systemId) {
    return { ok: false, message: 'Nenhuma instalação do motor embutido encontrada para pausar.' }
  }

  await ensureInstallationProgressHydrated(systemId)
  const busy = isInstallationJobRunning(systemId) || isInstallationInProgress(systemId)
  if (!busy) {
    const progress = getInstallationProgress(systemId)
    if (progress?.status === 'interrupted') {
      const snapshot = await getServidorOmpsEmbeddedInstallProgress()
      return {
        ok: true,
        action: 'pause',
        message: 'Instalação já estava pausada.',
        systemId,
        progress: snapshot.progress,
      }
    }
    return { ok: false, message: 'Não há instalação em andamento para pausar.' }
  }

  requestInstallationUserPause(systemId)
  interruptInstallationProgress(systemId, USER_PAUSE_MESSAGE)

  const snapshot = await getServidorOmpsEmbeddedInstallProgress()
  return {
    ok: true,
    action: 'pause',
    message: USER_PAUSE_MESSAGE,
    systemId,
    progress: snapshot.progress,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForInstallJobIdle(systemId: string, timeoutMs = 90_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isInstallationJobRunning(systemId) && !isInstallationInProgress(systemId)) {
      return true
    }
    await sleep(500)
  }
  return !isInstallationJobRunning(systemId) && !isInstallationInProgress(systemId)
}

/** Reinicia o motor embutido do zero (substitui a instalação atual). */
export async function restartServidorOmpsEmbeddedInstall(): Promise<ServidorOmpsEmbeddedInstallControlResponse> {
  const accessMode = await resolveAccessMode()
  if (!accessMode) {
    return { ok: false, message: 'Contrato Servidor OMPS indisponível.' }
  }

  const payload = await getBundledOmpsServerStatus()
  if (!payload.ok || !payload.available) {
    return { ok: false, message: payload.ok ? payload.reason : 'Payload embarcado indisponível.' }
  }

  let systemId = await resolveEmbeddedOmpsSystemId()
  if (systemId) {
    requestInstallationUserPause(systemId)
    interruptInstallationProgress(systemId, 'Reinício solicitado pelo usuário.')
    const idle = await waitForInstallJobIdle(systemId)
    clearInstallationUserPause(systemId)
    if (!idle) {
      return {
        ok: false,
        message:
          'A instalação ainda está encerrando uma fase. Aguarde alguns segundos e tente Reiniciar de novo.',
      }
    }
  }

  const result = systemId
    ? await startBundledOmpsServerInstall({
        accessMode,
        duplicateDecision: { action: 'replace', systemId, confirmReplace: true },
      })
    : await startBundledOmpsServerInstall({ accessMode })

  if (isInstallationDuplicateConflict(result)) {
    if (result.options.canResume) {
      const resumed = await startBundledOmpsServerInstall({
        accessMode,
        duplicateDecision: { action: 'resume', systemId: result.existing.systemId },
      })
      if (!resumed.ok) {
        return {
          ok: false,
          message: 'message' in resumed ? resumed.message : 'Não foi possível reiniciar a instalação.',
        }
      }
      systemId = 'systemId' in resumed ? resumed.systemId : result.existing.systemId
    } else {
      return { ok: false, message: result.message }
    }
  } else if (!result.ok) {
    return {
      ok: false,
      message: 'message' in result ? result.message : 'Falha ao reiniciar a instalação embutida.',
    }
  } else if ('accepted' in result && result.accepted) {
    systemId = result.systemId
  }

  const snapshot = await getServidorOmpsEmbeddedInstallProgress()
  return {
    ok: true,
    action: 'restart',
    message: 'Reinício do motor embutido iniciado.',
    systemId: systemId ?? snapshot.systemId,
    progress: snapshot.progress,
  }
}
