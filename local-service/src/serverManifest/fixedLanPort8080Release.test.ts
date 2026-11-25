import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  persistPort8080ReleaseAuthorization,
  type FixedLanPort8080ReleaseAuthorization,
} from './fixedLanPort8080Conflict.ts'
import {
  executeAuthorizedFixedLanPort8080Release,
  setKillProcessTreeForTests,
} from './fixedLanPort8080Release.ts'
import { setTcpPortListenerProbeForTests } from './lanTcpPortListenerProbe.ts'
import { setLoopbackTcpPortOpenOverrideForTests } from './lanHttpPortGuard.ts'

const systemId = '42765375-a486-4541-8ef0-b028cb80556f'

afterEach(() => {
  setTcpPortListenerProbeForTests(null)
  setLoopbackTcpPortOpenOverrideForTests(null)
  setKillProcessTreeForTests(null)
  delete process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
})

async function withTempSystemsRoot(run: (root: string) => Promise<void>) {
  const systemsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-port8080-'))
  process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = systemsRoot
  const projectDir = path.join(systemsRoot, systemId, 'project')
  await fs.mkdir(projectDir, { recursive: true })
  try {
    await run(projectDir)
  } finally {
    delete process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
  }
}

const listener = {
  port: 8080,
  localAddress: '0.0.0.0',
  pid: 9001,
  processName: 'other.exe',
  executablePath: 'C:\\Apps\\other.exe',
  commandLine: 'other.exe',
  serviceName: null,
  identityConfidence: 'confirmed' as const,
}

describe('executeAuthorizedFixedLanPort8080Release', () => {
  it('sem autorização válida no disco não encerra processo', async () => {
    let killed = false
    setKillProcessTreeForTests(async () => {
      killed = true
    })
    await withTempSystemsRoot(async (projectDir) => {
      const result = await executeAuthorizedFixedLanPort8080Release({
        systemId,
        rootDirectory: projectDir,
        actionToken: 'token',
        confirm: true,
        listener: { pid: 1, processName: 'x', executablePath: 'c:\\x.exe' },
      })
      assert.equal(result.ok, false)
      assert.equal(killed, false)
    })
  })

  it('PID alterado após confirmação cancela encerramento', async () => {
    let killed = false
    setKillProcessTreeForTests(async () => {
      killed = true
    })
    await withTempSystemsRoot(async (projectDir) => {
      const auth: FixedLanPort8080ReleaseAuthorization = {
        version: 1,
        actionToken: 'abc',
        port: 8080,
        issuedAt: new Date().toISOString(),
        listenerFingerprint: '9001|other.exe|c:\\apps\\other.exe',
        listener,
        impactSummary: 'test',
      }
      await persistPort8080ReleaseAuthorization(systemId, auth)
      setTcpPortListenerProbeForTests(async () => ({
        ok: true,
        listening: true,
        listeners: [{ ...listener, pid: 9002 }],
      }))
      const result = await executeAuthorizedFixedLanPort8080Release({
        systemId,
        rootDirectory: projectDir,
        actionToken: 'abc',
        confirm: true,
        listener: { pid: 9001, processName: 'other.exe', executablePath: 'C:\\Apps\\other.exe' },
      })
      assert.equal(result.ok, false)
      if (result.ok) assert.fail('expected failure')
      assert.equal(result.code, 'STALE')
      assert.equal(killed, false)
    })
  })

  it('encerramento autorizado verifica liberação da porta', async () => {
    const killed: number[] = []
    setKillProcessTreeForTests(async (pid) => {
      killed.push(pid)
    })
    await withTempSystemsRoot(async (projectDir) => {
      const auth: FixedLanPort8080ReleaseAuthorization = {
        version: 1,
        actionToken: 'abc',
        port: 8080,
        issuedAt: new Date().toISOString(),
        listenerFingerprint: '9001|other.exe|c:\\apps\\other.exe',
        listener,
        impactSummary: 'test',
      }
      await persistPort8080ReleaseAuthorization(systemId, auth)

      let pass = 0
      setTcpPortListenerProbeForTests(async () => {
        pass += 1
        if (pass === 1) return { ok: true, listening: true, listeners: [listener] }
        return { ok: true, listening: false, listeners: [] }
      })
      setLoopbackTcpPortOpenOverrideForTests(async () => pass > 1)

      const result = await executeAuthorizedFixedLanPort8080Release({
        systemId,
        rootDirectory: projectDir,
        actionToken: 'abc',
        confirm: true,
        listener: { pid: 9001, processName: 'other.exe', executablePath: 'C:\\Apps\\other.exe' },
      })
      assert.equal(result.ok, true)
      assert.deepEqual(killed, [9001])
    })
  })
})
