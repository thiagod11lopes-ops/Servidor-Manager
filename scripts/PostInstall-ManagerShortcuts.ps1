# Pos-instalacao NSIS: atalho navegador (padrao). Preserva C:\ServidorManager.
param(
  [string] $InstallRoot = ''
)
$ErrorActionPreference = 'SilentlyContinue'
if (-not $InstallRoot) {
  $InstallRoot = $env:LOCALAPPDATA + '\Programs\ServidorManager'
}
if (-not (Test-Path (Join-Path $InstallRoot 'ServidorManager.exe'))) {
  exit 0
}
$bootstrapDir = Join-Path $InstallRoot 'resources\server-bootstrap'
$shortcutScript = Join-Path $bootstrapDir 'Create-DesktopShortcut-Manager.ps1'
if (Test-Path $shortcutScript) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $shortcutScript -InstallRoot $InstallRoot
}
exit 0
