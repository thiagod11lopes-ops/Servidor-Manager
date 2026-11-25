# Atalhos desktop — Servidor Manager (genérico) ou Servidor OMPS (payload omps-payload).
param(
  [string] $InstallRoot = '',
  [bool] $CreateDesktopShortcut = $true
)
# PostInstall repassa [bool]; NSIS usa 0/1 via PostInstall apenas.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Resolve-OmpsUserDesktopDirectory.ps1')
if (-not $InstallRoot) {
  $InstallRoot = Join-Path $env:LOCALAPPDATA 'Programs\ServidorManager'
}
$launcher = Join-Path $InstallRoot 'resources\manager-launcher\Start-ServidorManager-NoElectron.ps1'
if (-not (Test-Path $launcher)) {
  $launcher = Join-Path $InstallRoot 'resources\server-bootstrap\Start-ServidorManager-NoElectron.ps1'
}
$fallbackLauncher = Join-Path $PSScriptRoot 'Start-ServidorManager-NoElectron.ps1'

if (-not (Test-Path $launcher)) {
  if (Test-Path $fallbackLauncher) {
    $launcher = $fallbackLauncher
  } else {
    throw "Launcher não encontrado. Execute: npm run package:dir && npm run update:installed"
  }
}

function Test-ServidorOmpsInstallRoot {
  param([Parameter(Mandatory = $true)][string] $Root)
  $marker = Join-Path $Root 'resources\servidor-omps-product.json'
  if (Test-Path $marker) { return $true }
  $payload = Join-Path $Root 'resources\omps-payload'
  if (Test-Path $payload) { return $true }
  $bundleMeta = Join-Path $Root 'resources\omps-bundle\bundle-meta.json'
  return Test-Path $bundleMeta
}

function Test-ShortcutReferencesInstallRoot {
  param([string] $ShortcutPath, [string] $Root)
  if (-not (Test-Path -LiteralPath $ShortcutPath)) { return $false }
  try {
    $wsh = New-Object -ComObject WScript.Shell
    $sc = $wsh.CreateShortcut($ShortcutPath)
    $target = if ($sc.TargetPath) { $sc.TargetPath } else { '' }
    $args = if ($sc.Arguments) { $sc.Arguments } else { '' }
    $work = if ($sc.WorkingDirectory) { $sc.WorkingDirectory } else { '' }
    $r = $Root.TrimEnd('\')
    if ($target -like "$r*") { return $true }
    if ($work -like "$r*") { return $true }
    if ($args -like "*$r*") { return $true }
    $managerExe = Join-Path $r 'ServidorManager.exe'
    if ($target -ieq $managerExe) { return $true }
    return $false
  } catch {
    return $false
  }
}

function Remove-LegacyDesktopShortcutsForInstallRoot {
  param(
    [Parameter(Mandatory = $true)][string] $Root,
    [string[]] $Names
  )
  try {
    $desktop = Get-OmpsUserDesktopDirectory
  } catch {
    return
  }
  if (-not (Test-Path $desktop)) { return }
  foreach ($name in $Names) {
    $path = Join-Path $desktop $name
    if (Test-ShortcutReferencesInstallRoot -ShortcutPath $path -Root $Root) {
      Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
      Write-Host "Atalho legado removido (mesma instalação): $path"
    }
  }
}

$isOmpsInstall = Test-ServidorOmpsInstallRoot -Root $InstallRoot

if (-not $CreateDesktopShortcut) {
  Write-Host 'Atalho na Área de trabalho omitido (escolha do instalador). Menu Iniciar permanece via NSIS.'
  exit 0
}

$wsh = New-Object -ComObject WScript.Shell
$targets = @(Get-OmpsUserDesktopDirectory)

# OMPS: atalho principal na área de trabalho = Servidor OMPS.lnk (launcher navegador).
# Genérico: Servidor Manager.lnk
$browserShortcutName = if ($isOmpsInstall) { 'Servidor OMPS.lnk' } else { 'Servidor Manager.lnk' }

if ($isOmpsInstall) {
  Remove-LegacyDesktopShortcutsForInstallRoot -Root $InstallRoot -Names @(
    'Servidor Manager.lnk',
    'Servidor Manager (Electron).lnk',
    'Servidor Manager (Navegador).lnk',
    'Servidor OMPS (navegador).lnk'
  )
}

foreach ($desktop in $targets) {
  if (-not (Test-Path $desktop)) { continue }
  $shortcutPath = Join-Path $desktop $browserShortcutName
  $sc = $wsh.CreateShortcut($shortcutPath)
  $cmdLauncher = Join-Path $InstallRoot 'resources\manager-launcher\Launch-ServidorManager.cmd'
  if (Test-Path $cmdLauncher) {
    $sc.TargetPath = $cmdLauncher
    $sc.Arguments = ''
    $sc.WorkingDirectory = Split-Path $cmdLauncher -Parent
    $sc.WindowStyle = 7
  } else {
    $sc.TargetPath = 'powershell.exe'
    $sc.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`" -InstallRoot `"$InstallRoot`""
    $sc.WorkingDirectory = Split-Path $launcher -Parent
    $sc.WindowStyle = 7
  }
  if ($isOmpsInstall) {
    $sc.Description = 'Servidor OMPS — UI no navegador (:5199) + serviço local (:47831)'
  } else {
    $sc.Description = 'Servidor Manager (Node embarcado + UI :5199 / API :47831) — segundo plano'
  }
  try {
    $sc.Save()
    Write-Host "Atalho atualizado: $shortcutPath"
  } catch {
    Write-Warning "Não foi possível gravar $shortcutPath (tente como Administrador): $($_.Exception.Message)"
  }
}

$exe = Join-Path $InstallRoot 'ServidorManager.exe'
if (Test-Path $exe) {
  $desktop = Get-OmpsUserDesktopDirectory
  $electronShortcutName = if ($isOmpsInstall) { 'Servidor OMPS (Electron).lnk' } else { 'Servidor Manager (Electron).lnk' }
  $shortcutPath = Join-Path $desktop $electronShortcutName
  $sc = $wsh.CreateShortcut($shortcutPath)
  $sc.TargetPath = $exe
  $sc.WorkingDirectory = Split-Path $exe -Parent
  if ($isOmpsInstall) {
    $sc.Description = 'Servidor OMPS em janela Electron — pode ser bloqueado pelo Windows se não assinado'
  } else {
    $sc.Description = 'Servidor Manager em janela Electron — pode ser bloqueado pelo Windows se não assinado'
  }
  try {
    $sc.Save()
    Write-Host "Atalho Electron (opcional): $shortcutPath"
  } catch {
    Write-Warning $_.Exception.Message
  }
}
