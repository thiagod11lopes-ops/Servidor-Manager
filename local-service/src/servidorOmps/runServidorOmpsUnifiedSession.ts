import fs from 'node:fs/promises'
import { getBundledOmpsServerStatus } from '../bundledOmps/installBundledOmpsServer.ts'
import { readBundledOmpsFirstRunRecord } from '../bundledOmps/bundledOmpsFirstRunStore.ts'
import { getManagerInstallRoot } from '../bundledOmps/managerInstallRoot.ts'
import { getManifestPath } from '../installation/paths.ts'
import { isInstallationInProgress } from '../installation/installationProgressStore.ts'
import {
  isServidorOmpsProduct,
  readActiveServidorOmpsProductConfig,
  resolveOmpsUsuarioDefaultStartUrl,
} from '../products/servidorOmpsProductConfig.ts'
import { getServidorOmpsContractAccessStatus } from '../products/servidorOmpsContractAccess.ts'
import { ensureServidorOmpsEmbeddedRuntime } from './ensureServidorOmpsEmbeddedRuntime.ts'
import { launchOmpsUsuarioClient } from './launchOmpsUsuarioClient.ts'

let unifiedSessionStarted = false

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function manifestInstallComplete(systemId: string): Promise<boolean> {
  try {
    const raw = JSON.parse(await fs.readFile(getManifestPath(systemId), 'utf8')) as { ok?: boolean }
    return raw.ok === true
  } catch {
    return false
  }
}

async function resolveBundledOmpsSystemId(timeoutMs: number): Promise<string | null> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const status = await getBundledOmpsServerStatus()
    if (!status.ok || !status.available) return null

    const record = await readBundledOmpsFirstRunRecord()
    if (!record?.systemId) {
      await sleep(2_000)
      continue
    }

    if (record.completedAt || (await manifestInstallComplete(record.systemId))) {
      return record.systemId
    }

    if (!(await isInstallationInProgress(record.systemId))) {
      if (await manifestInstallComplete(record.systemId)) return record.systemId
    }

    await sleep(2_000)
  }
  return null
}

async function resolveLoginUrlForSession(): Promise<string | null> {
  const contract = await getServidorOmpsContractAccessStatus()
  if (contract.ok && contract.available && contract.loginUrl) {
    return contract.loginUrl
  }

  const installRoot = getManagerInstallRoot()
  if (!installRoot) return null
  const product = await readActiveServidorOmpsProductConfig()
  if (!isServidorOmpsProduct(product)) return null
  return resolveOmpsUsuarioDefaultStartUrl(product)
}

/**
 * Servidor OMPS: após abrir o produto, provisiona (se necessário), sobe o AcompOPMS e abre o OMPS Usuário.
 * Não altera UI — só orquestração em background.
 */
export async function runServidorOmpsUnifiedSession(): Promise<void> {
  if (unifiedSessionStarted) return
  unifiedSessionStarted = true

  const installRoot = getManagerInstallRoot()
  if (!installRoot) return

  const product = await readActiveServidorOmpsProductConfig()
  if (!isServidorOmpsProduct(product)) return

  const payloadStatus = await getBundledOmpsServerStatus()
  if (!payloadStatus.ok || !payloadStatus.available) {
    console.warn('[servidor-omps] Payload embarcado indisponível — sessão unificada omitida.')
    return
  }

  void ensureServidorOmpsEmbeddedRuntime({ forceResume: true })

  console.log('[servidor-omps] Sessão unificada: aguardando motor embutido (Usuário OMPS)…')
  const systemId = await resolveBundledOmpsSystemId(900_000)
  if (!systemId) {
    console.warn('[servidor-omps] Sessão unificada: materialização do motor embutido não concluiu a tempo.')
    return
  }

  await ensureServidorOmpsEmbeddedRuntime()

  const loginUrl = await resolveLoginUrlForSession()
  if (!loginUrl) {
    console.warn('[servidor-omps] Sessão unificada: URL de acesso indisponível.')
    return
  }

  const launch = launchOmpsUsuarioClient(loginUrl)
  if (launch.ok) {
    console.log('[servidor-omps] OMPS Usuário iniciado:', launch.executable, '→', launch.startUrl)
  } else {
    console.warn('[servidor-omps]', launch.message)
  }
}
