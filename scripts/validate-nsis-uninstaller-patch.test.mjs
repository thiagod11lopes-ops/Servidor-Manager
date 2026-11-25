import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const nsisTarget = path.join(
  root,
  'node_modules',
  'app-builder-lib',
  'out',
  'targets',
  'nsis',
  'NsisTarget.js',
)

test('patch NSIS: Windows WriteUninstaller sem UninstallerReader', () => {
  const source = fs.readFileSync(nsisTarget, 'utf8')
  assert.match(source, /SM_PATCH_NSIS_WIN_EXEC_WRITE_UNINSTALLER/)
  assert.match(source, /process\.platform === "win32"[\s\S]*execWine\)\(installerPath/)
  assert.doesNotMatch(
    source,
    /else if \(process\.platform === "win32"\) \{[\s\S]*?UninstallerReader\.exec\(installerPath, uninstallerPath\)/,
  )
  assert.match(source, /NSIS uninstaller stub não gerado/)
  assert.match(source, /validateNsisUninstallerArtifact/)
  assert.match(source, /SM_PATCH_NSIS_UNINSTALLER_AUDIT/)
  assert.match(source, /SM_VALIDATE_NSIS_UNINSTALLER_AFTER_SIGN/)
})

test('patch NSIS: hook customBeforeCopyInstalledFiles em extractAppPackage', () => {
  const extractNsh = path.join(
    root,
    'node_modules',
    'app-builder-lib',
    'templates',
    'nsis',
    'include',
    'extractAppPackage.nsh',
  )
  const src = fs.readFileSync(extractNsh, 'utf8')
  assert.match(src, /SM_PATCH_CUSTOM_BEFORE_COPY/)
})
