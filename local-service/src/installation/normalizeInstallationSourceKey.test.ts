import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bundledOmpsInstallationSourceKeys,
  installationSourceKeyFromSourceUrl,
} from './normalizeInstallationSourceKey.ts'

test('normaliza URLs Git equivalentes (github, .git, barra final)', () => {
  const a = installationSourceKeyFromSourceUrl('https://github.com/org/repo')
  const b = installationSourceKeyFromSourceUrl('https://github.com/org/repo.git/')
  const c = installationSourceKeyFromSourceUrl('https://www.github.com/org/repo.git')
  assert.equal(a, b)
  assert.equal(a, c)
})

test('normaliza pasta local com barras e maiúsculas no Windows', () => {
  if (process.platform !== 'win32') {
    return
  }
  const a = installationSourceKeyFromSourceUrl('local-folder:C:\\Payload\\omps')
  const b = installationSourceKeyFromSourceUrl('local-folder:c:/payload/omps/')
  assert.equal(a, b)
})

test('pacote OMPS gera chaves bundled e local', () => {
  const keys = bundledOmpsInstallationSourceKeys('C:\\Program Files\\x\\payload', 'AbCdEF')
  assert.deepEqual(keys, ['bundled:abcdef', 'local:c:\\program files\\x\\payload'])
})
