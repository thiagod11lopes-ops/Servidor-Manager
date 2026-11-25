# Encerra somente processos do Manager instalado (PIDs da sessão ou command line sob InstallRoot).
param(
  [string] $InstallRoot = ''
)
$ErrorActionPreference = 'Stop'

if (-not $InstallRoot) {
  $InstallRoot = Join-Path $env:LOCALAPPDATA 'Programs\ServidorManager'
}

$sessionScript = Join-Path $InstallRoot 'resources\manager-launcher\ManagerLauncherSession.ps1'
if (-not (Test-Path $sessionScript)) {
  $sessionScript = Join-Path $InstallRoot 'resources\server-bootstrap\ManagerLauncherSession.ps1'
}
if (-not (Test-Path $sessionScript)) {
  $sessionScript = Join-Path $PSScriptRoot 'ManagerLauncherSession.ps1'
}
. $sessionScript

$sessionPath = Get-ManagerLauncherSessionPath
$stopped = @()

if (Test-Path $sessionPath) {
  try {
    $session = Get-Content -Path $sessionPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($pidName in @('servicePid', 'uiPid')) {
      $pidValue = [int]$session.$pidName
      if ($pidValue -le 0) { continue }
      $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue" -ErrorAction SilentlyContinue
      if ($null -eq $proc) { continue }
      $cmd = if ($null -ne $proc.CommandLine) { $proc.CommandLine } else { '' }
      if ($cmd -like "*$InstallRoot*") {
        Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
        $stopped += $pidValue
      }
    }
  } catch {
    Write-Warning "Sessão do launcher ilegível: $($_.Exception.Message)"
  }
}

Stop-ProcessesForInstallRoot -InstallRoot $InstallRoot
Stop-ServidorManagerExecutableForInstallRoot -InstallRoot $InstallRoot
Stop-ManagerElectronWorkersForInstallRoot -InstallRoot $InstallRoot

Write-Host "Manager instalado encerrado (PIDs: $($stopped -join ', ')). Portas 47831/5199 liberadas se pertenciam a $InstallRoot."
