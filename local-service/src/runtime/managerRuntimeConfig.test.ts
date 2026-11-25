import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_SERVICE_PORT,
  DEFAULT_UI_PORT,
  ISOLATED_TEST_DEFAULT_SERVICE_PORT,
  ISOLATED_TEST_DEFAULT_UI_PORT,
  buildAllowedOrigins,
  parseManagerUiPort,
  parseServicePort,
} from './managerRuntimeConfig.ts'

test('portas padrão sem variáveis de ambiente', () => {
  const env = {}
  assert.equal(parseServicePort(env), DEFAULT_SERVICE_PORT)
  assert.equal(parseManagerUiPort(env), DEFAULT_UI_PORT)
})

test('portas isoladas via env', () => {
  const env = {
    SERVIDOR_MANAGER_SERVICE_PORT: String(ISOLATED_TEST_DEFAULT_SERVICE_PORT),
    SM_UI_PORT: String(ISOLATED_TEST_DEFAULT_UI_PORT),
  }
  assert.equal(parseServicePort(env), 47832)
  assert.equal(parseManagerUiPort(env), 5200)
  const origins = buildAllowedOrigins(env)
  assert.ok(origins.has('http://127.0.0.1:5200'))
  assert.ok(origins.has('http://127.0.0.1:5199'))
})
