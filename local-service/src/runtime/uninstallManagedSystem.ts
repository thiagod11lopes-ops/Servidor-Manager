import fs from 'node:fs'
import { getSystemRoot } from '../installation/paths.ts'
import { readInstallationManifest } from './installationManifest.ts'
import { isManifestLanSystem, stopManifestLanStack } from './manifestLanRuntime.ts'
import { stopManagedSystem } from './systemProcessManager.ts'
import { buildServiceStatus, uninstallSystemService } from './service/serviceManager.ts'

export type UninstallSystemResponse = {
  ok: boolean
  message: string
  removedFromDisk?: boolean
}

export async function uninstallManagedSystem(systemId: string): Promise<UninstallSystemResponse> {
  const root = getSystemRoot(systemId)
  const hadInstall = fs.existsSync(root)

  const stopResult = await stopManagedSystem(systemId)
  if (!stopResult.ok && stopResult.status?.state === 'executando') {
    return {
      ok: false,
      message: stopResult.message ?? 'Não foi possível parar o sistema antes de desinstalar.',
    }
  }

  const manifest = await readInstallationManifest(systemId)
  if (manifest && (await isManifestLanSystem(systemId, manifest))) {
    const lanStop = await stopManifestLanStack(systemId, manifest)
    if (!lanStop.ok) {
      return {
        ok: false,
        message: lanStop.message ?? 'Falha ao encerrar stack LAN/Supabase antes de desinstalar.',
      }
    }
  }

  const serviceStatus = await buildServiceStatus(systemId)
  if (serviceStatus.installed) {
    const serviceUninstall = await uninstallSystemService(systemId)
    if (!serviceUninstall.ok) {
      return {
        ok: false,
        message: serviceUninstall.message ?? 'Falha ao remover serviço Windows deste sistema.',
      }
    }
  }

  if (!hadInstall) {
    return {
      ok: true,
      message: 'Sistema removido do Manager (pasta de instalação não encontrada no disco).',
      removedFromDisk: false,
    }
  }

  try {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      message: `Não foi possível apagar ${root}. Feche processos que usem a pasta e tente de novo. (${detail})`,
    }
  }

  return {
    ok: true,
    message: `Sistema desinstalado. Pasta removida: ${root}`,
    removedFromDisk: true,
  }
}
