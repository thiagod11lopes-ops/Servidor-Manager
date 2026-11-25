import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('Servidor OMPS não usa atalho desktop NSIS genérico (PostInstall define Servidor OMPS.lnk)', async () => {
  const yml = await fs.readFile(path.join(root, 'electron-builder.servidor-omps.yml'), 'utf8')
  assert.match(yml, /createDesktopShortcut:\s*false/)
  assert.match(yml, /shortcutName:\s*Servidor OMPS/)
  assert.match(yml, /Remove-ServidorOmpsShortcuts\.ps1/)
  assert.match(yml, /servidor-omps-product\.json/)
  assert.match(yml, /PostInstall-ServidorOmpsShortcuts\.ps1/)
})

test('instalador OMPS usa PostInstall dedicado (não PostInstall genérico silencioso)', async () => {
  const nsh = await fs.readFile(path.join(root, 'desktop', 'installer-servidor-omps.nsh'), 'utf8')
  assert.match(nsh, /PostInstall-ServidorOmpsShortcuts\.ps1/)
  assert.doesNotMatch(nsh, /PostInstall-ManagerShortcuts\.ps1/)
})

test('instalador OMPS oferece checkbox opcional de atalho desktop', async () => {
  const nsh = await fs.readFile(path.join(root, 'desktop', 'installer-servidor-omps.nsh'), 'utf8')
  assert.match(nsh, /customPageAfterChangeDir/)
  assert.match(nsh, /Criar atalho na Área de trabalho/)
  assert.match(nsh, /CreateDesktopShortcut 0/)
  assert.match(nsh, /CreateDesktopShortcut 1/)
  const post = await fs.readFile(path.join(root, 'scripts', 'PostInstall-ServidorOmpsShortcuts.ps1'), 'utf8')
  assert.match(post, /\[string\]\s*\$CreateDesktopShortcut/)
  assert.match(post, /Test-OmpsTruthyInstallFlag/)
  const create = await fs.readFile(path.join(root, 'scripts', 'Create-DesktopShortcut-Manager.ps1'), 'utf8')
  assert.match(create, /\[bool\]\s*\$CreateDesktopShortcut/)
})

test('Create-DesktopShortcut-Manager distingue OMPS e usa Servidor OMPS.lnk', async () => {
  const ps1 = await fs.readFile(path.join(root, 'scripts', 'Create-DesktopShortcut-Manager.ps1'), 'utf8')
  assert.match(ps1, /Test-ServidorOmpsInstallRoot/)
  assert.match(ps1, /Servidor OMPS\.lnk/)
  assert.match(ps1, /Servidor OMPS \(Electron\)\.lnk/)
  assert.match(ps1, /\$browserShortcutName = if \(\$isOmpsInstall\) \{ 'Servidor OMPS\.lnk' \}/)
})

test('desinstalação OMPS remove atalhos só quando apontam ao InstallRoot', async () => {
  const ps1 = await fs.readFile(path.join(root, 'scripts', 'Remove-ServidorOmpsShortcuts.ps1'), 'utf8')
  assert.match(ps1, /Test-ShortcutReferencesInstallRoot/)
  assert.match(ps1, /Servidor OMPS\.lnk/)
  assert.match(ps1, /Servidor Manager\.lnk/)
})

test('instalador genérico mantém createDesktopShortcut padrão', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
  assert.notEqual(pkg.build?.nsis?.createDesktopShortcut, false)
})

test('PostInstall OMPS Usuário invoca Create-DesktopShortcut após config', async () => {
  const post = await fs.readFile(path.join(root, 'scripts', 'PostInstall-OmpsUsuario.ps1'), 'utf8')
  assert.match(post, /Create-DesktopShortcut-OmpsUsuario\.ps1/)
  assert.match(post, /& \$shortcutScript -InstallRoot \$InstallRoot -CreateDesktopShortcut/)
  const idxThrow = post.indexOf('Script de atalho ausente')
  const idxInvoke = post.indexOf('& $shortcutScript -InstallRoot')
  assert.ok(idxThrow >= 0 && idxInvoke > idxThrow, 'deve chamar o script de atalho após validar presença')
})

test('Resolve-OmpsUserDesktopDirectory prioriza USERPROFILE', async () => {
  const ps1 = await fs.readFile(path.join(root, 'scripts', 'Resolve-OmpsUserDesktopDirectory.ps1'), 'utf8')
  assert.match(ps1, /USERPROFILE/)
  assert.match(ps1, /Get-OmpsUserDesktopDirectory/)
})

test('electron-builder embute Resolve-OmpsUserDesktopDirectory nos instaladores OMPS', async () => {
  const servidor = await fs.readFile(path.join(root, 'electron-builder.servidor-omps.yml'), 'utf8')
  const usuario = await fs.readFile(path.join(root, 'electron-builder.omps-usuario.yml'), 'utf8')
  assert.match(servidor, /Resolve-OmpsUserDesktopDirectory\.ps1/)
  assert.match(usuario, /Resolve-OmpsUserDesktopDirectory\.ps1/)
})

test('PostInstall Servidor OMPS não ignora silenciosamente exe ausente', async () => {
  const post = await fs.readFile(path.join(root, 'scripts', 'PostInstall-ServidorOmpsShortcuts.ps1'), 'utf8')
  assert.doesNotMatch(post, /exit 0\s*\}\s*$/m)
  assert.match(post, /Executável do Servidor OMPS ausente/)
  assert.match(post, /& \$shortcutScript -InstallRoot \$InstallRoot -CreateDesktopShortcut/)
})

test('PostInstall Servidor OMPS aceita -CreateDesktopShortcut 0 via powershell -File (contrato NSIS)', async () => {
  const script = path.join(root, 'release', 'servidor-omps', 'win-unpacked', 'resources', 'server-bootstrap', 'PostInstall-ServidorOmpsShortcuts.ps1')
  const installRoot = path.join(root, 'release', 'servidor-omps', 'win-unpacked')
  try {
    await fs.access(script)
  } catch {
    return
  }
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-File', script, '-InstallRoot', installRoot, '-CreateDesktopShortcut', '0'],
    { stdio: 'pipe', timeout: 45_000 },
  )
})

test('PostInstall Servidor OMPS parseia no Windows PowerShell (sem U+2014 em strings)', async () => {
  const script = path.join(root, 'scripts', 'PostInstall-ServidorOmpsShortcuts.ps1')
  const post = await fs.readFile(script, 'utf8')
  assert.doesNotMatch(post, /[\u2014\u2013].*"/, 'em/en dash dentro de string quebra parser CP1252')
  const psPath = script.replace(/'/g, "''")
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `$e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('${psPath}', [ref]$null, [ref]$e); if ($e) { $e | ForEach-Object { $_.ToString() }; exit 1 }`,
    ],
    { stdio: 'pipe', timeout: 45_000 },
  )
})

test('win-unpacked embutido no NSIS expõe scripts de atalho atualizados', async () => {
  const { spawnSync } = await import('node:child_process')
  const r = spawnSync(process.execPath, ['scripts/verify-omps-shortcut-bootstrap-in-artifacts.mjs'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
  })
  assert.equal(r.status, 0, r.stderr || r.stdout)
})
