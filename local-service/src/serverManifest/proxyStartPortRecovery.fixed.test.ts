import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadActiveServidorOmpsFixedLanPolicy } from '../products/servidorOmpsFixedLanRuntime.ts'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const sourceProductPath = path.join(repoRoot, 'resources-packaging', 'servidor-omps-product.json')

test('proxy recovery: política fixa carregada quando InstallRoot tem servidor-omps-product.json', async () => {
  const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-proxy-fixed-'))
  await fs.mkdir(path.join(installRoot, 'resources'), { recursive: true })
  await fs.copyFile(sourceProductPath, path.join(installRoot, 'resources', 'servidor-omps-product.json'))

  const prev = process.env.SERVIDOR_MANAGER_INSTALL_ROOT
  process.env.SERVIDOR_MANAGER_INSTALL_ROOT = installRoot
  try {
    const policy = await loadActiveServidorOmpsFixedLanPolicy()
    assert.ok(policy)
    assert.equal(policy.fixed.requiredHttpPort, 8080)
    assert.equal(policy.fixed.expectedLanHost, '192.168.1.100')
    assert.equal(policy.urls.loginUrl, 'http://192.168.1.100:8080/login')
  } finally {
    if (prev === undefined) delete process.env.SERVIDOR_MANAGER_INSTALL_ROOT
    else process.env.SERVIDOR_MANAGER_INSTALL_ROOT = prev
  }
})

test('contrato inválido no InstallRoot não ativa política fixa', async () => {
  const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sm-proxy-bad-'))
  await fs.mkdir(path.join(installRoot, 'resources'), { recursive: true })
  await fs.writeFile(
    path.join(installRoot, 'resources', 'servidor-omps-product.json'),
    JSON.stringify({ schema: 'wrong/1' }),
    'utf8',
  )

  const prev = process.env.SERVIDOR_MANAGER_INSTALL_ROOT
  process.env.SERVIDOR_MANAGER_INSTALL_ROOT = installRoot
  try {
    const policy = await loadActiveServidorOmpsFixedLanPolicy()
    assert.equal(policy, null)
  } finally {
    if (prev === undefined) delete process.env.SERVIDOR_MANAGER_INSTALL_ROOT
    else process.env.SERVIDOR_MANAGER_INSTALL_ROOT = prev
  }
})

test('proxy recovery: sem InstallRoot a política fixa não está ativa', async () => {
  const prev = process.env.SERVIDOR_MANAGER_INSTALL_ROOT
  delete process.env.SERVIDOR_MANAGER_INSTALL_ROOT
  delete process.env.SM_RESOURCES_PATH
  try {
    const policy = await loadActiveServidorOmpsFixedLanPolicy()
    assert.equal(policy, null)
  } finally {
    if (prev !== undefined) process.env.SERVIDOR_MANAGER_INSTALL_ROOT = prev
  }
})
