import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { setNetworkInterfacesProviderForTests } from '../config/networkAccess.ts'
import {
  ensureLanHttpPortForSystem,
  setLoopbackTcpPortOpenOverrideForTests,
} from './lanHttpPortGuard.ts'
import type { ServerManifest } from './types.ts'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const sourceProductPath = path.join(repoRoot, 'resources-packaging', 'servidor-omps-product.json')

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

test('OMPS v3 auto: usa 8080 quando livre', async () => {
  setNetworkInterfacesProviderForTests(() => mockInterfaceWithIpv4('192.168.1.50'))
  setLoopbackTcpPortOpenOverrideForTests(async () => false)
  const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-fb-install-'))
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-fb-project-'))
  await fs.mkdir(path.join(installRoot, 'resources'), { recursive: true })
  await fs.copyFile(sourceProductPath, path.join(installRoot, 'resources', 'servidor-omps-product.json'))
  await writeMinimalProject(project, ['ACOMOPMS_HTTP_PORT=8080', 'ACOMOPMS_LAN_HOST=auto'])

  const systemsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-fb-systems-'))
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
    assert.equal(result.ok, true)
    if (!result.ok) assert.fail(result.message)
    assert.equal(result.httpPort, 8080)
  } finally {
    setLoopbackTcpPortOpenOverrideForTests(null)
    setNetworkInterfacesProviderForTests(null)
    if (prevInstall === undefined) delete process.env.SERVIDOR_MANAGER_INSTALL_ROOT
    else process.env.SERVIDOR_MANAGER_INSTALL_ROOT = prevInstall
    if (prevSystems === undefined) delete process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
    else process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = prevSystems
  }
})

test('OMPS v3 auto: 8080 ocupado seleciona 8081', async () => {
  setNetworkInterfacesProviderForTests(() => mockInterfaceWithIpv4('192.168.1.50'))
  setLoopbackTcpPortOpenOverrideForTests(async (port) => port === 8080)
  const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-fb-install-'))
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-fb-project-'))
  await fs.mkdir(path.join(installRoot, 'resources'), { recursive: true })
  await fs.copyFile(sourceProductPath, path.join(installRoot, 'resources', 'servidor-omps-product.json'))
  await writeMinimalProject(project, ['ACOMOPMS_HTTP_PORT=8080', 'ACOMOPMS_LAN_HOST=auto'])

  const systemsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-fb-systems-'))
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
    assert.equal(result.ok, true)
    if (!result.ok) assert.fail(result.message)
    assert.equal(result.httpPort, 8081)
  } finally {
    setLoopbackTcpPortOpenOverrideForTests(null)
    setNetworkInterfacesProviderForTests(null)
    if (prevInstall === undefined) delete process.env.SERVIDOR_MANAGER_INSTALL_ROOT
    else process.env.SERVIDOR_MANAGER_INSTALL_ROOT = prevInstall
    if (prevSystems === undefined) delete process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
    else process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = prevSystems
  }
})
