import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldSkipBrowserUploadPath } from './browserUploadPathFilter.ts'

test('ignora electron-builder win-unpacked e exe aninhado', () => {
  assert.equal(
    shouldSkipBrowserUploadPath('Instalador OPMS/instalador/dist/win-unpacked/AcompOPMS Instalador.exe'),
    true,
  )
})

test('preserva dist de frontend vite', () => {
  assert.equal(shouldSkipBrowserUploadPath('frontend/dist/index.html'), false)
  assert.equal(shouldSkipBrowserUploadPath('dist/assets/main.js'), false)
})

test('ignora node_modules em qualquer profundidade', () => {
  assert.equal(shouldSkipBrowserUploadPath('packages/app/node_modules/foo/index.js'), true)
})

test('rejeita traversal', () => {
  assert.equal(shouldSkipBrowserUploadPath('../secret.txt'), true)
})
