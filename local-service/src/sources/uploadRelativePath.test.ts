import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizeUploadRelativePath } from './uploadRelativePath.ts'

test('sanitizeUploadRelativePath rejects traversal', () => {
  const result = sanitizeUploadRelativePath('../etc/passwd')
  assert.equal(result.ok, false)
})

test('sanitizeUploadRelativePath rejects absolute windows path', () => {
  const result = sanitizeUploadRelativePath('C:/Windows/System32')
  assert.equal(result.ok, false)
})

test('sanitizeUploadRelativePath accepts nested path', () => {
  const result = sanitizeUploadRelativePath('src/index.ts')
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.relativePath, 'src/index.ts')
})

test('sanitizeUploadRelativePath skips node_modules', () => {
  const result = sanitizeUploadRelativePath('node_modules/pkg/index.js')
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'UPLOAD_PATH_SKIPPED')
})

test('sanitizeUploadRelativePath skips win-unpacked installer exe', () => {
  const result = sanitizeUploadRelativePath(
    'Instalador OPMS/instalador/dist/win-unpacked/setup.exe',
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'UPLOAD_PATH_SKIPPED')
})

test('sanitizeUploadRelativePath keeps vite dist assets', () => {
  const result = sanitizeUploadRelativePath('frontend/dist/index.html')
  assert.equal(result.ok, true)
})
