import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  diagnoseFixedLanPort8080Conflict,
  evaluateListenerOmpsAffinity,
  protectedProcessBlockReason,
  listenerIdentityFingerprint,
  listenersMatchForRelease,
} from './fixedLanPort8080Conflict.ts'
import {
  setTcpPortListenerProbeForTests,
  type TcpPortListenerIdentity,
} from './lanTcpPortListenerProbe.ts'
import { setLoopbackTcpPortOpenOverrideForTests } from './lanHttpPortGuard.ts'

const systemId = '42765375-a486-4541-8ef0-b028cb80556f'

afterEach(() => {
  setTcpPortListenerProbeForTests(null)
  setLoopbackTcpPortOpenOverrideForTests(null)
  delete process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
})

async function withTempSystemsRoot(projectDir: string, run: () => Promise<void>) {
  const systemsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-conflict-'))
  process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = systemsRoot
  await fs.mkdir(path.join(systemsRoot, systemId, 'project'), { recursive: true })
  try {
    await run()
  } finally {
    delete process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
  }
}

const foreignListener: TcpPortListenerIdentity = {
  port: 8080,
  localAddress: '0.0.0.0',
  pid: 4242,
  processName: 'other.exe',
  executablePath: 'C:\\Apps\\other.exe',
  commandLine: 'other.exe --port 8080',
  serviceName: null,
  identityConfidence: 'confirmed',
}

describe('protectedProcessBlockReason', () => {
  it('bloqueia processos protegidos do sistema', () => {
    const reason = protectedProcessBlockReason({
      ...foreignListener,
      processName: 'svchost.exe',
      pid: 888,
    })
    assert.match(reason ?? '', /protegido/i)
  })

  it('bloqueia identidade inconclusiva', () => {
    const reason = protectedProcessBlockReason({
      ...foreignListener,
      pid: null,
      processName: null,
      identityConfidence: 'unknown',
    })
    assert.match(reason ?? '', /inconclusiva/i)
  })
})

describe('diagnoseFixedLanPort8080Conflict', () => {
  it('porta livre: sem autorização de encerramento', async () => {
    setTcpPortListenerProbeForTests(async () => ({ ok: true, listening: false, listeners: [] }))
    await withTempSystemsRoot('C:\\tmp\\project', async () => {
      const details = await diagnoseFixedLanPort8080Conflict({
        systemId,
        rootDirectory: 'C:\\tmp\\project',
      })
      assert.equal(details.probe.listening, false)
      assert.equal(details.releaseAuthorization, null)
    })
  })

  it('processo identificado estrangeiro: emite autorização vinculada', async () => {
    setTcpPortListenerProbeForTests(async () => ({
      ok: true,
      listening: true,
      listeners: [foreignListener],
    }))
    await withTempSystemsRoot('C:\\tmp\\project', async () => {
      const details = await diagnoseFixedLanPort8080Conflict({
        systemId,
        rootDirectory: 'C:\\tmp\\project',
      })
      assert.equal(details.affinity, 'foreign')
      assert.ok(details.releaseAuthorization)
      assert.equal(details.releaseAuthorization?.listener.pid, 4242)
      assert.match(details.releaseAuthorization?.impactSummary ?? '', /8080/)
    })
  })

  it('processo protegido: sem oferta de encerramento', async () => {
    setTcpPortListenerProbeForTests(async () => ({
      ok: true,
      listening: true,
      listeners: [{ ...foreignListener, processName: 'lsass.exe', pid: 999 }],
    }))
    await withTempSystemsRoot('C:\\tmp\\project', async () => {
      const details = await diagnoseFixedLanPort8080Conflict({
        systemId,
        rootDirectory: 'C:\\tmp\\project',
      })
      assert.equal(details.releaseAuthorization, null)
      assert.match(details.manualSteps.join(' '), /protegido|lsass/i)
    })
  })
})

describe('evaluateListenerOmpsAffinity', () => {
  it('detecta Caddy desta instalação pela linha de comando', () => {
    const affinity = evaluateListenerOmpsAffinity(
      {
        ...foreignListener,
        processName: 'caddy.exe',
        commandLine: 'caddy run --config C:\\tmp\\project\\Transferir para Servidor\\servidor-lan\\Caddyfile.generated',
      },
      { systemId: 'x', rootDirectory: 'C:\\tmp\\project' },
    )
    assert.equal(affinity, 'same_system')
  })
})

describe('listenerIdentityFingerprint', () => {
  it('exige correspondência exata de PID e identidade na revalidação', () => {
    const a = listenerIdentityFingerprint({ pid: 1, processName: 'a.exe', executablePath: 'C:\\a.exe' })
    const b = listenerIdentityFingerprint({ pid: 2, processName: 'a.exe', executablePath: 'C:\\a.exe' })
    assert.notEqual(a, b)
    assert.equal(
      listenersMatchForRelease(
        { pid: 1, processName: 'a.exe', executablePath: 'C:\\a.exe' },
        { pid: 1, processName: 'a.exe', executablePath: 'C:\\a.exe' },
      ),
      true,
    )
  })
})
