# Pós-instalação NSIS — somente variante Servidor OMPS (atalhos desktop + menu já via NSIS).
param(
  [string] $InstallRoot = '',
  [string] $CreateDesktopShortcut = '1'
)
function Test-OmpsTruthyInstallFlag {
  param([Parameter(Mandatory = $true)][string] $Value)
  return -not ($Value -eq '0' -or $Value -eq 'false' -or $Value -eq 'False')
}
$ErrorActionPreference = 'Stop'
if (-not $InstallRoot) {
  $resolveScript = Join-Path $PSScriptRoot 'Resolve-ManagerInstallRoot.ps1'
  if (-not (Test-Path $resolveScript)) {
    $resolveScript = Join-Path (Split-Path $PSScriptRoot -Parent) 'manager-launcher\Resolve-ManagerInstallRoot.ps1'
  }
  if (Test-Path $resolveScript) {
    . $resolveScript
    $InstallRoot = Resolve-ManagerInstallRoot
  } else {
    $InstallRoot = Join-Path $env:LOCALAPPDATA 'Programs\ServidorManager'
  }
}
$managerExe = Join-Path $InstallRoot 'ServidorManager.exe'
if (-not (Test-Path $managerExe)) {
  Write-Error "Executável do Servidor OMPS ausente após instalação: $managerExe (atalhos não criados)."
  exit 2
}
$marker = Join-Path $InstallRoot 'resources\servidor-omps-product.json'
if (-not (Test-Path $marker)) {
  Write-Warning "Marcador Servidor OMPS ausente em $InstallRoot - atalhos OMPS nao foram aplicados."
  exit 1
}
$bootstrapDir = Join-Path $InstallRoot 'resources\server-bootstrap'
$shortcutScript = Join-Path $bootstrapDir 'Create-DesktopShortcut-Manager.ps1'
if (-not (Test-Path $shortcutScript)) {
  throw "Script de atalho ausente: $shortcutScript"
}
$createDesktop = Test-OmpsTruthyInstallFlag -Value $CreateDesktopShortcut
if ($createDesktop) {
  & $shortcutScript -InstallRoot $InstallRoot -CreateDesktopShortcut $true
} else {
  & $shortcutScript -InstallRoot $InstallRoot -CreateDesktopShortcut $false
}
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
  Write-Error "Falha ao criar atalhos desktop (Create-DesktopShortcut-Manager.ps1 exit $LASTEXITCODE)."
  exit $LASTEXITCODE
}
exit 0
