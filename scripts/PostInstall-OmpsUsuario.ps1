# Pós-instalação NSIS — OMPS Usuário (config persistente + atalho opcional).
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
  $InstallRoot = Join-Path $env:LOCALAPPDATA 'AcompOPMS'
}
$productPath = Join-Path $InstallRoot 'resources\servidor-omps-product.json'
if (-not (Test-Path $productPath)) {
  throw "Contrato do produto ausente: $productPath"
}
$product = Get-Content -Raw -LiteralPath $productPath | ConvertFrom-Json
if ($product.schema -ne 'servidor-omps-product/3' -and $product.schema -ne 'servidor-omps-product/2') {
  throw "Schema inválido em servidor-omps-product.json"
}
$configPaths = @(
  (Join-Path $InstallRoot 'acomopms-desktop.config.json')
)
$appDataConfig = Join-Path $env:LOCALAPPDATA 'AcompOPMS\acomopms-desktop.config.json'
if ($appDataConfig -notin $configPaths) {
  $configPaths += $appDataConfig
}
$configBody = @{
  discoverConnection = $true
  lanDiscovery       = $true
  windowTitle        = if ($product.clientDesktopDefaults.windowTitle) { $product.clientDesktopDefaults.windowTitle } else { 'AcompOPMS' }
}
if ($product.lanAccess.lanHostMode -eq 'fixed' -and $product.lanAccess.expectedLanHost) {
  $lanHost = [string]$product.lanAccess.expectedLanHost
  $port = [int]$product.lanAccess.requiredHttpPort
  $entry = [string]$product.lanAccess.entryPath
  if (-not $entry.StartsWith('/')) { $entry = "/$entry" }
  $configBody.startUrl = "http://${lanHost}:${port}${entry}"
  $configBody.lanDiscovery = $false
} elseif ($product.fixedLanAccess) {
  $lanHost = [string]$product.fixedLanAccess.expectedLanHost
  $port = [int]$product.fixedLanAccess.requiredHttpPort
  $entry = [string]$product.fixedLanAccess.entryPath
  if (-not $entry.StartsWith('/')) { $entry = "/$entry" }
  $configBody.startUrl = "http://${lanHost}:${port}${entry}"
  $configBody.lanDiscovery = $false
}
$configJson = ($configBody | ConvertTo-Json -Depth 4) + [Environment]::NewLine
foreach ($configPath in $configPaths) {
  $dir = Split-Path -Parent $configPath
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  if (Test-Path $configPath) {
    $stamp = Get-Date -Format 'yyyy-MM-ddTHH-mm-ss'
    Copy-Item -LiteralPath $configPath -Destination "$configPath.pre-install-backup-$stamp.json" -Force
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($configPath, $configJson, $utf8NoBom)
  Write-Host "Config gravada: $configPath"
}
$shortcutScript = Join-Path $InstallRoot 'resources\omps-usuario-bootstrap\Create-DesktopShortcut-OmpsUsuario.ps1'
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
  exit $LASTEXITCODE
}
exit 0
