/**
 * Ponto de falha "Não é possível fechar o OMPS" (~50%): extractUsing7za CopyFiles,
 * não apenas _CHECK_APP_RUNNING no início da installSection.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const extractNsh = path.join(
  root,
  'node_modules',
  'app-builder-lib',
  'templates',
  'nsis',
  'include',
  'extractAppPackage.nsh',
)
const hubNsh = path.join(root, 'desktop', 'omps-unified-nsis', 'installer.nsh')
const allowNsh = path.join(
  root,
  'node_modules',
  'app-builder-lib',
  'templates',
  'nsis',
  'include',
  'allowOnlyOneInstallerInstance.nsh',
)

test('extractAppPackage chama customBeforeCopyInstalledFiles antes de CopyFiles (patch SM)', () => {
  const src = fs.readFileSync(extractNsh, 'utf8')
  assert.match(src, /SM_PATCH_CUSTOM_BEFORE_COPY/)
  assert.match(src, /customBeforeCopyInstalledFiles/)
  const idxHook = src.indexOf('customBeforeCopyInstalledFiles')
  const idxCopy = src.indexOf('CopyFiles /SILENT "$PLUGINSDIR\\7z-out\\*" $OUTDIR')
  assert.ok(idxHook > 0 && idxCopy > idxHook, 'hook deve preceder CopyFiles')
})

test('Stop hub não chama InitPluginsDir no caminho beforeCopy (preserva 7z-out)', () => {
  const hub = fs.readFileSync(hubNsh, 'utf8')
  assert.match(hub, /StopOmpsHubForInstallRoot/)
  assert.match(hub, /NÃO chama InitPluginsDir/)
  const stopMacro = hub.slice(hub.indexOf('!macro StopOmpsHubForInstallRoot'), hub.indexOf('!macro customInit'))
  assert.doesNotMatch(stopMacro, /InitPluginsDir/)
})

test('hub OMPS: install usa Stop (não _CHECK); desinstalador usa _CHECK_APP_RUNNING', () => {
  const hub = fs.readFileSync(hubNsh, 'utf8')
  assert.match(hub, /customBeforeCopyInstalledFiles/)
  assert.match(hub, /ExcludeProcessId/)
  assert.match(hub, /InstallerExePath/)
  assert.match(hub, /TargetExePath/)
  assert.match(hub, /\$\{APP_EXECUTABLE_FILENAME\}/)
  assert.match(hub, /!macro customCheckAppRunning/)
  assert.match(hub, /BUILD_UNINSTALLER[\s\S]*!insertmacro _CHECK_APP_RUNNING/)
  assert.doesNotMatch(hub, /!else[\s\S]*!insertmacro _CHECK_APP_RUNNING/)
  const allow = fs.readFileSync(allowNsh, 'utf8')
  assert.match(
    allow,
    /\$\{if\} \$3 != "\$\{APP_EXECUTABLE_FILENAME\}"/,
    'evidência: check padrão ignorado quando processo atual é OMPS.exe',
  )
})

test('hub NSIS: artefato de instalação não pode coincidir com OMPS.exe instalado', () => {
  const yml = fs.readFileSync(path.join(root, 'electron-builder.omps-unified.yml'), 'utf8')
  assert.match(yml, /artifactName:\s*Instalar OMPS\.\$\{ext\}/)
  assert.match(yml, /executableName:\s*OMPS/)
})

test('Stop-OmpsHub-Installed.ps1 escopado por InstallRoot e exclui instalador', () => {
  const ps1 = fs.readFileSync(path.join(root, 'scripts', 'Stop-OmpsHub-Installed.ps1'), 'utf8')
  assert.match(ps1, /ExcludeProcessId/)
  assert.match(ps1, /InstallerExePath/)
  assert.match(ps1, /Test-ProcessUnderInstallRoot/)
  assert.match(ps1, /CommandLine/)
  assert.match(ps1, /TargetExePath/)
  assert.match(ps1, /Stop-ProcessTreeFromRoots/)
})
