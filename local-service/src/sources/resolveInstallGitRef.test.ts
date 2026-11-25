import assert from 'node:assert/strict'
import test from 'node:test'
import { encodeLocalFolderSourceUrl } from './localFolderSource.ts'
import { resolveInstallGitRef } from './resolveInstallGitRef.ts'

test('resolveInstallGitRef accepts local-folder encoded path without URL validation', () => {
  const sourceUrl = encodeLocalFolderSourceUrl(
    'C:\\ServidorManager\\staging\\browser-upload\\a9eabe32-02eb-4cfc-a22f-dcffa5d7eaf2',
  )
  const result = resolveInstallGitRef(sourceUrl)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.sourceKind, 'localFolder')
    assert.equal(result.gitRef, null)
  }
})

test('resolveInstallGitRef rejects non-url non-local source', () => {
  const result = resolveInstallGitRef('not-a-valid-url')
  assert.equal(result.ok, false)
})

test('resolveInstallGitRef accepts https github repo', () => {
  const result = resolveInstallGitRef('https://github.com/example/demo.git')
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.sourceKind, 'git')
})
