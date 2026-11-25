import {
  clearPort8080ReleaseAuthorization,
  diagnoseFixedLanPort8080Conflict,
  listenersMatchForRelease,
  protectedProcessBlockReason,
  readPort8080ReleaseAuthorization,
  type FixedLanPort8080ReleaseAuthorization,
} from './fixedLanPort8080Conflict.ts'
import { probeTcpPortListeners, type TcpPortListenerIdentity } from './lanTcpPortListenerProbe.ts'
import { isLoopbackTcpPortOpen } from './lanHttpPortGuard.ts'
import { killProcessTree as defaultKillProcessTree } from '../installation/killProcessTree.ts'

let killProcessTreeOverride: ((pid: number) => Promise<void>) | null = null

/** Hook de teste — restaurar com `setKillProcessTreeForTests(null)`. */
export function setKillProcessTreeForTests(kill: ((pid: number) => Promise<void>) | null): void {
  killProcessTreeOverride = kill
}

async function killAuthorizedProcessTree(pid: number): Promise<void> {
  if (killProcessTreeOverride) return killProcessTreeOverride(pid)
  return defaultKillProcessTree(pid)
}

export type AuthorizedPort8080ReleaseRequest = {
  systemId: string
  rootDirectory: string
  actionToken: string
  confirm: true
  listener: Pick<TcpPortListenerIdentity, 'pid' | 'processName' | 'executablePath'>
}

export type AuthorizedPort8080ReleaseResult =
  | { ok: true; message: string; portFree: true }
  | { ok: false; message: string; code: 'DENIED' | 'STALE' | 'BLOCKED' | 'PORT_STILL_BUSY' | 'NOT_AUTHORIZED' }

async function isPort8080Free(): Promise<boolean> {
  const probe = await probeTcpPortListeners(8080)
  if (!probe.ok) return !(await isLoopbackTcpPortOpen(8080))
  return !probe.listening
}

export async function executeAuthorizedFixedLanPort8080Release(
  input: AuthorizedPort8080ReleaseRequest,
): Promise<AuthorizedPort8080ReleaseResult> {
  if (input.confirm !== true) {
    return { ok: false, code: 'NOT_AUTHORIZED', message: 'Confirmação explícita ausente.' }
  }

  const stored = await readPort8080ReleaseAuthorization(input.systemId)
  if (!stored || stored.actionToken !== input.actionToken) {
    return {
      ok: false,
      code: 'NOT_AUTHORIZED',
      message: 'Autorização inválida ou expirada. Solicite novo diagnóstico de conflito na porta 8080.',
    }
  }

  if (!listenersMatchForRelease(stored.listener, input.listener)) {
    return {
      ok: false,
      code: 'STALE',
      message:
        'O processo na porta 8080 mudou desde a autorização. A ação foi cancelada — confirme novamente com o diagnóstico atual.',
    }
  }

  const diagnosis = await diagnoseFixedLanPort8080Conflict({
    systemId: input.systemId,
    rootDirectory: input.rootDirectory,
  })

  if (!diagnosis.probe.ok || !diagnosis.probe.listening || !diagnosis.primaryListener) {
    return {
      ok: false,
      code: 'STALE',
      message: 'A porta 8080 não está mais ocupada ou o listener não pôde ser reidentificado.',
    }
  }

  if (!listenersMatchForRelease(stored.listener, diagnosis.primaryListener)) {
    return {
      ok: false,
      code: 'STALE',
      message:
        'PID ou identidade do processo mudou após a confirmação. Encerramento cancelado — solicite nova autorização.',
    }
  }

  const block = protectedProcessBlockReason(diagnosis.primaryListener)
  if (block) {
    return { ok: false, code: 'BLOCKED', message: block }
  }

  const pid = diagnosis.primaryListener.pid
  if (!pid) {
    return { ok: false, code: 'BLOCKED', message: 'PID não confirmado — encerramento não realizado.' }
  }

  await killAuthorizedProcessTree(pid)

  const portFree = await waitForPort8080Free(5_000)
  await clearPort8080ReleaseAuthorization(input.systemId)

  if (!portFree) {
    return {
      ok: false,
      code: 'PORT_STILL_BUSY',
      message:
        'O processo foi sinalizado para encerramento, mas a porta 8080 continua ocupada. Libere-a manualmente e tente novamente.',
    }
  }

  return {
    ok: true,
    portFree: true,
    message: `Processo ${diagnosis.primaryListener.processName ?? 'desconhecido'} (PID ${pid}) encerrado após autorização. Porta 8080 liberada.`,
  }
}

async function waitForPort8080Free(maxWaitMs: number): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < maxWaitMs) {
    if (await isPort8080Free()) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return isPort8080Free()
}

export function authorizationMatchesStored(
  stored: FixedLanPort8080ReleaseAuthorization,
  request: AuthorizedPort8080ReleaseRequest,
): boolean {
  return stored.actionToken === request.actionToken && listenersMatchForRelease(stored.listener, request.listener)
}
