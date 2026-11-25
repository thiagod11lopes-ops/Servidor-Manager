import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { collectManagerLanHttpPortClaims } from './lanHttpPortGuard.ts'

const PREV_ROOT = process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
let tempRoot = ''

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-lan-port-claims-'))
  process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = tempRoot

  const active = '42765375-a486-4541-8ef0-b028cb80556f'
  const other = 'e21b8bae-beb8-44bd-8af9-1e420a0ea086'

  for (const [id, port] of [
    [active, 8080],
    [other, 8081],
  ] as const) {
    const project = path.join(tempRoot, id, 'project')
    await fs.mkdir(project, { recursive: true })
    await fs.writeFile(
      path.join(tempRoot, id, 'server-manifest-state.json'),
      JSON.stringify({ status: 'installed-lan', servidorEnv: { httpPort: port } }),
      'utf8',
    )
    await fs.mkdir(path.join(project, 'Transferir para Servidor', 'servidor-lan'), { recursive: true })
    await fs.writeFile(
      path.join(project, 'Transferir para Servidor', 'servidor-lan', 'servidor.env'),
      `ACOMOPMS_HTTP_PORT=${port}\n`,
      'utf8',
    )
  }
})

after(async () => {
  if (PREV_ROOT) process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT = PREV_ROOT
  else delete process.env.SERVIDOR_MANAGER_SYSTEMS_ROOT
  await fs.rm(tempRoot, { recursive: true, force: true })
})

describe('collectManagerLanHttpPortClaims', () => {
  it('registra portas HTTP distintas por systemId ativo', async () => {
    const claims = await collectManagerLanHttpPortClaims()
    assert.deepEqual(claims.get(8080), ['42765375-a486-4541-8ef0-b028cb80556f'])
    assert.deepEqual(claims.get(8081), ['e21b8bae-beb8-44bd-8af9-1e420a0ea086'])
  })

  it('exclui systemId solicitado da contagem', async () => {
    const claims = await collectManagerLanHttpPortClaims('42765375-a486-4541-8ef0-b028cb80556f')
    assert.equal(claims.get(8080)?.length ?? 0, 0)
    assert.equal(claims.get(8081)?.length, 1)
  })

  it('reserva porta para instalação phases-failed', async () => {
    const failedId = 'ddb19ca9-6ae4-4e63-abb1-fa8af8d9127a'
    const project = path.join(tempRoot, failedId, 'project')
    await fs.mkdir(project, { recursive: true })
    await fs.writeFile(
      path.join(tempRoot, failedId, 'server-manifest-state.json'),
      JSON.stringify({ status: 'phases-failed', servidorEnv: { httpPort: 8083 } }),
      'utf8',
    )
    await fs.mkdir(path.join(project, 'Transferir para Servidor', 'servidor-lan'), { recursive: true })
    await fs.writeFile(
      path.join(project, 'Transferir para Servidor', 'servidor-lan', 'servidor.env'),
      'ACOMOPMS_HTTP_PORT=8083\n',
      'utf8',
    )
    const claims = await collectManagerLanHttpPortClaims()
    assert.deepEqual(claims.get(8083), [failedId])
  })
})
