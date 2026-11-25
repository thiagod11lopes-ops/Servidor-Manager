# Bootstrap do PC servidor Windows (supabase-local-v1). Codigos de saida:
# 0 = verificacao critica OK
# 1 = ferramenta critica ausente ou nao funcional
# 2 = winget ausente (com -InstallMissing)
# 3 = Docker instalado mas Engine parado (acao manual)
# 4 = falha de instalacao winget/npm em componente necessario
param(
  [string] $LogPath = '',
  [switch] $InstallMissing,
  [switch] $LaunchDockerDesktop
)

$ErrorActionPreference = 'Continue'

function Write-Log([string] $Level, [string] $Message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$Level] $Message"
  if ($LogPath) {
    Add-Content -Path $LogPath -Value $line -Encoding UTF8
  }
  Write-Host $line
}

function Test-Command([string] $Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Refresh-SessionPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Ensure-UserPathDir([string] $Dir) {
  if (-not (Test-Path $Dir)) { return $false }
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($userPath -notlike "*$([regex]::Escape($Dir))*") {
    $userPath = if ($userPath) { "$userPath;$Dir" } else { $Dir }
    [Environment]::SetEnvironmentVariable('Path', $userPath, 'User')
    Write-Log 'INFO' "PATH usuario: adicionado $Dir (reabra o Manager para aplicar)."
    return $true
  }
  return $false
}

function Get-PsqlBinDirectories {
  $dirs = @()
  $pgRoot = 'C:\Program Files\PostgreSQL'
  if (Test-Path $pgRoot) {
    Get-ChildItem -Path $pgRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      $bin = Join-Path $_.FullName 'bin'
      if (Test-Path (Join-Path $bin 'psql.exe')) { $dirs += $bin }
    }
  }
  return $dirs
}

function Test-ToolFunctional([string] $Name, [string[]] $Args) {
  if (-not (Test-Command $Name)) { return $false }
  try {
    & $Name @Args 2>&1 | Out-Null
    return ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE)
  } catch {
    return $false
  }
}

function Test-NodeMajor([int] $MinMajor) {
  if (-not (Test-Command node)) { return $false }
  try {
    $ver = (node --version 2>$null).Trim()
    if ($ver -match '^v?(\d+)') {
      return ([int]$Matches[1] -ge $MinMajor)
    }
  } catch { }
  return $false
}

function Invoke-WingetInstall([string] $Id, [string] $Label) {
  if (-not (Test-Command winget)) {
    Write-Log 'ERROR' 'winget nao encontrado (App Installer / Microsoft Store).'
    return $false
  }
  Write-Log 'INFO' "Instalando $Label ($Id) via winget..."
  winget install $Id --accept-package-agreements --accept-source-agreements -e --disable-interactivity
  if ($LASTEXITCODE -ge 0 -and $LASTEXITCODE -le 2) {
    Write-Log 'INFO' "${Label}: winget concluido (codigo $LASTEXITCODE)."
    return $true
  }
  Write-Log 'WARN' "${Label}: winget falhou (codigo $LASTEXITCODE)."
  return $false
}

function Test-CriticalEnvironment {
  $failures = @()
  $dockerManual = $false

  if (-not (Test-ToolFunctional git @('--version'))) { $failures += 'Git' }
  if (-not (Test-NodeMajor 20)) { $failures += 'Node.js 20+' }
  if (-not (Test-ToolFunctional npm @('--version'))) { $failures += 'npm' }
  if (-not (Test-ToolFunctional caddy @('version'))) { $failures += 'Caddy' }
  if (-not (Test-ToolFunctional supabase @('--version'))) { $failures += 'Supabase CLI' }
  if (-not (Test-ToolFunctional psql @('--version'))) { $failures += 'psql' }
  if (-not (Test-ToolFunctional bash @('--version'))) { $failures += 'bash' }

  if (-not (Test-Command docker)) {
    $failures += 'Docker CLI'
  } else {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      $dockerManual = $true
    }
  }

  return [PSCustomObject]@{
    Failures     = $failures
    DockerManual = $dockerManual
  }
}

if ($LogPath) {
  $logDir = Split-Path $LogPath -Parent
  if ($logDir -and -not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  }
}

Write-Log 'INFO' '=== Servidor Manager: bootstrap do servidor Windows ==='

if ($InstallMissing -and -not (Test-Command winget)) {
  Write-Log 'ERROR' 'winget e obrigatorio para instalar dependencias automaticamente.'
  exit 2
}

$installFailed = $false

if ($InstallMissing) {
  Refresh-SessionPath

  if (-not (Test-ToolFunctional git @('--version'))) {
    if (-not (Invoke-WingetInstall 'Git.Git' 'Git')) { $installFailed = $true }
  }
  if (-not (Test-NodeMajor 20)) {
    if (-not (Invoke-WingetInstall 'OpenJS.NodeJS.LTS' 'Node.js LTS')) { $installFailed = $true }
  }
  if (-not (Test-ToolFunctional caddy @('version'))) {
    if (-not (Invoke-WingetInstall 'CaddyServer.Caddy' 'Caddy')) { $installFailed = $true }
  }
  if (-not (Test-Command docker)) {
    if (-not (Invoke-WingetInstall 'Docker.DockerDesktop' 'Docker Desktop')) { $installFailed = $true }
  }

  $psqlDirs = Get-PsqlBinDirectories
  if ($psqlDirs.Count -eq 0 -and -not (Test-ToolFunctional psql @('--version'))) {
    Write-Log 'INFO' 'Tentando PostgreSQL (cliente psql) via winget...'
    if (-not (Invoke-WingetInstall 'PostgreSQL.PostgreSQL.17' 'PostgreSQL 17')) {
      Write-Log 'WARN' 'PostgreSQL winget falhou; instale psql manualmente se necessario.'
    }
  }

  foreach ($dir in (Get-PsqlBinDirectories)) {
    Ensure-UserPathDir $dir | Out-Null
  }
  Ensure-UserPathDir 'C:\Program Files\Git\bin' | Out-Null

  Refresh-SessionPath

  if (-not (Test-ToolFunctional supabase @('--version')) -and (Test-Command npm)) {
    Write-Log 'INFO' 'Instalando Supabase CLI (npm global)...'
    npm install -g supabase 2>&1 | ForEach-Object { Write-Log 'INFO' $_ }
    if ($LASTEXITCODE -ne 0) { $installFailed = $true }
  }
} else {
  Write-Log 'INFO' 'Modo verificacao (-InstallMissing nao informado).'
}

Refresh-SessionPath

foreach ($c in @('git', 'node', 'npm', 'caddy', 'supabase', 'psql', 'bash', 'docker')) {
  $cmd = Get-Command $c -ErrorAction SilentlyContinue
  Write-Log 'INFO' ("check {0}: {1}" -f $c, $(if ($cmd) { $cmd.Source } else { 'FALTANDO' }))
}

if ($LaunchDockerDesktop) {
  $dockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  if (Test-Path $dockerExe) {
    Write-Log 'INFO' 'Abrindo Docker Desktop...'
    Start-Process $dockerExe -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 8
    Refresh-SessionPath
  } else {
    Write-Log 'WARN' 'Docker Desktop.exe nao encontrado.'
  }
}

$verify = Test-CriticalEnvironment

if ($verify.DockerManual) {
  Write-Log 'WARN' 'Docker instalado mas Engine nao responde. Abra Docker Desktop e aguarde.'
}

if ($verify.Failures.Count -gt 0) {
  Write-Log 'ERROR' ('Verificacao falhou: ' + ($verify.Failures -join ', '))
  if ($installFailed) { exit 4 }
  exit 1
}

if ($verify.DockerManual) {
  Write-Log 'WARN' 'Dependencias OK exceto Docker Engine — acao manual necessaria.'
  exit 3
}

Write-Log 'INFO' 'Verificacao critica: OK. Reinicie o atalho do Manager se o PATH foi alterado.'
exit 0
