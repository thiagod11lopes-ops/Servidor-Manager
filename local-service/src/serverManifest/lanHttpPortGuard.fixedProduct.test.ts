import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { setNetworkInterfacesProviderForTests } from '../config/networkAccess.ts'
import {
  ensureLanHttpPortForSystem,
  setLoopbackTcpPortOpenOverrideForTests,
} from './lanHttpPortGuard.ts'
import { setTcpPortListenerProbeForTests } from './lanTcpPortListenerProbe.ts'
import { FIXED_LAN_HTTP_PORT_CONFLICT_CODE } from './fixedLanPort8080Conflict.ts'
import type { ServerManifest } from './types.ts'

const strictOmpsProduct = {
  schema: 'servidor-omps-product/3',
  productLine: 'servidor-omps',
  displayName: 'Servidor OMPS',
  lanAccess: {
    schema: 'servidor-omps-lan/2',
    lanHostMode: 'fixed',
    expectedLanHost: '192.168.1.100',
    requiredHttpPort: 8080,
    discoveryUdpPort: 47808,
    entryPath: '/login',
    allowHttpPortFallback: false,
  },
}

function mockInterfaceWithIpv4(address: string) {
  return {
    Ethernet: [
      {
        address,
        netmask: '255.255.255.0',
        family: 'IPv4' as const,
        mac: '00:00:00:00:00:00',
        internal: false,
        cidr: `${address}/24`,
      },
    ],
  }
}

const minimalManifest = {
  configuration: { singleSourceOfTruthRelativePath: 'Transferir para Servidor/servidor.env' },
} as unknown as ServerManifest

async function writeMinimalProject(root: string, envLines: string[]) {
  const envRel = 'Transferir para Servidor/servidor.env'
  await fs.mkdir(path.dirname(path.join(root, envRel)), { recursive: true })
  await fs.writeFile(path.join(root, envRel), `${envLines.join('\n')}\n`, 'utf8')
}

test('OMPS strict: scanFromPort alternativo é rejeitado', async () => {
  const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-fixed-install-'))
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-fixed-project-'))
  await fs.mkdir(path.join(installRoot, 'resources'), { recursive: true })
  await fs.writeFile(
    path.join(installRoot, 'resources', 'servidor-omps-product.json'),
    `${JSON.stringify(strictOmpsProduct, null, 2)}\n`,
  )
  await writeMinimalProject(project, ['ACOMOPMS_HTTP_PORT=8080', 'ACOMOPMS_LAN_HOST=192.168.1.100'])

  setNetworkInterfacesProviderForTests(() => mockInterfaceWithIpv4('192.168.1.100'))
  const systemsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-fixed-systems-'))
  const prevInstall = process.env.SERVIDOR_MANAGER_INSTALL_ROOT
  const prevSystems = process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
  process.env.SERVIDOR_MANAGER_INSTALL_ROOT = installRoot
  process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = systemsRoot
  try {
    const result = await ensureLanHttpPortForSystem({
      systemId: '42765375-a486-4541-8ef0-b028cb80556f',
      rootDirectory: project,
      manifest: minimalManifest,
      preferredPort: 8080,
      scanFromPort: 8081,
    })
    assert.equal(result.ok, false)
    if (result.ok) assert.fail('expected failure')
    assert.match(result.message, /8080/)
  } finally {
    setNetworkInterfacesProviderForTests(null)
    if (prevInstall === undefined) delete process.env.SERVIDOR_MANAGER_INSTALL_ROOT
    else process.env.SERVIDOR_MANAGER_INSTALL_ROOT = prevInstall
    if (prevSystems === undefined) delete process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
    else process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = prevSystems
  }
})

test('OMPS strict: porta 8080 ocupada por terceiro retorna diagnóstico sem fallback', async () => {
  setNetworkInterfacesProviderForTests(() => mockInterfaceWithIpv4('192.168.1.100'))
  setLoopbackTcpPortOpenOverrideForTests(async () => true)
  setTcpPortListenerProbeForTests(async () => ({
    ok: true,
    listening: true,
    listeners: [
      {
        port: 8080,
        localAddress: '0.0.0.0',
        pid: 7777,
        processName: 'other.exe',
        executablePath: 'C:\\Apps\\other.exe',
        commandLine: 'other.exe',
        serviceName: null,
        identityConfidence: 'confirmed',
      },
    ],
  }))
  const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-fixed-install-'))
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-fixed-project-'))
  await fs.mkdir(path.join(installRoot, 'resources'), { recursive: true })
  await fs.writeFile(
    path.join(installRoot, 'resources', 'servidor-omps-product.json'),
    `${JSON.stringify(strictOmpsProduct, null, 2)}\n`,
  )
  await writeMinimalProject(project, ['ACOMOPMS_HTTP_PORT=8080'])

  const systemsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-fixed-systems-'))
  const prevInstall = process.env.SERVIDOR_MANAGER_INSTALL_ROOT
  const prevSystems = process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
  process.env.SERVIDOR_MANAGER_INSTALL_ROOT = installRoot
  process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = systemsRoot
  try {
    const result = await ensureLanHttpPortForSystem({
      systemId: '42765375-a486-4541-8ef0-b028cb80556f',
      rootDirectory: project,
      manifest: minimalManifest,
      preferredPort: 8080,
    })
    assert.equal(result.ok, false)
    if (result.ok) assert.fail('expected failure')
    assert.equal(result.conflict?.code, FIXED_LAN_HTTP_PORT_CONFLICT_CODE)
    assert.doesNotMatch(result.message, /8081/)
  } finally {
    setTcpPortListenerProbeForTests(null)
    setLoopbackTcpPortOpenOverrideForTests(null)
    setNetworkInterfacesProviderForTests(null)
    if (prevInstall === undefined) delete process.env.SERVIDOR_MANAGER_INSTALL_ROOT
    else process.env.SERVIDOR_MANAGER_INSTALL_ROOT = prevInstall
    if (prevSystems === undefined) delete process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
    else process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = prevSystems
  }
})
