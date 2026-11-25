# Preparação automática do PC servidor (Manager + rede + AcompSolemp opcional).
param(
  [switch] $SkipFirewall,
  [switch] $SkipManagerUpdate,
  [string] $AcompSystemId = '23fb39e1-d2c4-4d01-9514-dac12842614a',
  [string] $AcompRepoUrl = 'https://github.com/thiagod11lopes-ops/AcompSolemp/tree/cursor/servidor-lan-etapa16-bcc8'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Write-Host '=== Bootstrap servidor (manifest supabase-local-v1) ==='
& (Join-Path $root 'scripts\Invoke-ServerBootstrap.ps1') -InstallMissing -LaunchDockerDesktop
Write-Host "Node: $(node -v 2>$null)"
Write-Host "Git: $(git --version 2>$null)"

Write-Host '=== Config rede ServidorManager ==='
$configDir = 'C:\ServidorManager\config'
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
$configPath = Join-Path $configDir 'network.json'
@{ allowLanAccess = $true } | ConvertTo-Json | Set-Content -Path $configPath -Encoding utf8

if (-not $SkipFirewall) {
  Write-Host '=== Firewall (Admin) ==='
  Start-Process powershell -Verb RunAs -Wait -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', (Join-Path $root 'scripts\Ensure-LanFirewallRules.ps1')
  )
}

Write-Host '=== Build Manager ==='
Push-Location $root
try {
  npm run build
} finally {
  Pop-Location
}

Write-Host '=== Reiniciar local-service ==='
Get-NetTCPConnection -LocalPort 47831 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
$serviceDir = Join-Path $root 'dist-local-service'
$env:NODE_ENV = 'production'
$env:SM_SERVICE_HOST_SCRIPT = Join-Path $serviceDir 'service-host.cjs'
$env:SM_NODE_PATH = (Get-Command node).Source
Start-Process -FilePath 'node' -ArgumentList (Join-Path $serviceDir 'local-service.cjs') -WindowStyle Hidden
Start-Sleep -Seconds 3

if (-not $SkipManagerUpdate) {
  Write-Host '=== Atualizar Manager instalado ==='
  & (Join-Path $root 'scripts\Update-InstalledManager.ps1')
}

if ($AcompSystemId -and $AcompRepoUrl) {
  Write-Host '=== Instalar AcompSolemp via API ==='
  & (Join-Path $root 'scripts\Install-ProjectViaApi.ps1') -SystemId $AcompSystemId -SourceUrl $AcompRepoUrl
}

Write-Host '=== Concluído ==='
Write-Host 'Manager dev: npm run dev -> http://localhost:5173/sistemas'
Write-Host 'Manager browser: npm run start:browser -> http://127.0.0.1:5199/sistemas'
