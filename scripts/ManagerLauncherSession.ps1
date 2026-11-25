# Sessão do launcher (PIDs) — padrão C:\ServidorManager\logs\manager-launcher-session.json

function Get-ManagerLauncherSessionPath {
  if (Get-Command Get-ManagerLauncherSessionPathFromEnv -ErrorAction SilentlyContinue) {
    return Get-ManagerLauncherSessionPathFromEnv
  }
  $override = $env:SERVIDOR_MANAGER_LAUNCHER_SESSION_PATH
  if ($override -and $override.Trim()) { return $override.Trim() }
  $dataRoot = $env:SERVIDOR_MANAGER_DATA_ROOT
  if ($dataRoot -and $dataRoot.Trim()) {
    return Join-Path $dataRoot.Trim().TrimEnd('\') 'logs\manager-launcher-session.json'
  }
  return 'C:\ServidorManager\logs\manager-launcher-session.json'
}

function Save-ManagerLauncherSession {
  param(
    [string] $InstallRoot,
    [int] $ServicePid,
    [int] $UiPid,
    [string] $RuntimeMode,
    [string] $RuntimeExecutable
  )

  $sessionPath = Get-ManagerLauncherSessionPath
  $logDir = Split-Path $sessionPath -Parent
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null

  $payload = @{
    recordedAt         = (Get-Date).ToUniversalTime().ToString('o')
    installRoot        = $InstallRoot
    servicePid         = $ServicePid
    uiPid              = $UiPid
    runtimeMode        = $RuntimeMode
    runtimeExecutable  = $RuntimeExecutable
    serviceEntry       = Join-Path $InstallRoot 'resources\local-service\local-service.cjs'
    uiServeScript      = Join-Path $InstallRoot 'resources\manager-launcher\serve-manager-ui.mjs'
  }
  $payload | ConvertTo-Json -Depth 4 | Set-Content -Path $sessionPath -Encoding UTF8
}

function Stop-ProcessesForInstallRoot {
  param(
    [Parameter(Mandatory = $true)]
    [string] $InstallRoot,
    [int[]] $Ports = $null
  )

  if ($null -eq $Ports -or $Ports.Count -eq 0) {
    if (Get-Command Get-ManagerLauncherPorts -ErrorAction SilentlyContinue) {
      $Ports = Get-ManagerLauncherPorts
    } else {
      $svc = 47831
      $ui = 5199
      if ($env:SERVIDOR_MANAGER_SERVICE_PORT) { $svc = [int]$env:SERVIDOR_MANAGER_SERVICE_PORT }
      if ($env:SM_UI_PORT) { $ui = [int]$env:SM_UI_PORT }
      $Ports = @($svc, $ui)
    }
  }

  $normalized = $InstallRoot.TrimEnd('\')
  foreach ($port in $Ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $connections) {
      $procId = $conn.OwningProcess
      if (-not $procId) { continue }
      $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
      if ($null -eq $proc) { continue }
      $cmd = if ($null -ne $proc.CommandLine) { $proc.CommandLine } else { '' }
      if ($cmd -like "*$normalized*") {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

function Stop-ServidorManagerExecutableForInstallRoot {
  param(
    [Parameter(Mandatory = $true)]
    [string] $InstallRoot
  )

  $normalized = $InstallRoot.TrimEnd('\')
  $expectedExe = Join-Path $normalized 'ServidorManager.exe'
  Get-CimInstance Win32_Process -Filter "Name='ServidorManager.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
    $exePath = $_.ExecutablePath
    if ($exePath -and ($exePath -ieq $expectedExe -or $exePath -like "$normalized\*")) {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
}

function Stop-ManagerElectronWorkersForInstallRoot {
  param(
    [Parameter(Mandatory = $true)]
    [string] $InstallRoot
  )

  $normalized = $InstallRoot.TrimEnd('\')
  Get-CimInstance Win32_Process -Filter "Name='electron.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
    $cmd = if ($null -ne $_.CommandLine) { $_.CommandLine } else { '' }
    if ($cmd -like "*$normalized*") {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
}

function Get-ManagerInstallRootProcessMatches {
  param(
    [Parameter(Mandatory = $true)]
    [string] $InstallRoot
  )

  $normalized = $InstallRoot.TrimEnd('\')
  $matches = @()
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {
    $cmd = if ($null -ne $_.CommandLine) { $_.CommandLine } else { '' }
    $exe = if ($null -ne $_.ExecutablePath) { $_.ExecutablePath } else { '' }
    if ($cmd -like "*$normalized*" -or ($exe -like "$normalized\*")) {
      $matches += $_
    }
  }
  return $matches
}

function Assert-InstallRootQuiescentForUpdate {
  param(
    [Parameter(Mandatory = $true)]
    [string] $InstallRoot
  )

  if (-not (Test-Path -LiteralPath $InstallRoot)) {
    return
  }

  $normalized = $InstallRoot.TrimEnd('\')
  Start-Sleep -Seconds 1

  $remaining = Get-ManagerInstallRootProcessMatches -InstallRoot $InstallRoot
  if ($remaining.Count -gt 0) {
    $detail = ($remaining | ForEach-Object { "$($_.ProcessId):$($_.Name)" }) -join ', '
    throw @"
Atualizacao cancelada: processos do Servidor Manager ainda em execucao sob:
$InstallRoot
PIDs: $detail
Feche o Manager pelo atalho ou Stop-ServidorManager-Installed.ps1 e tente novamente.
"@
  }

  foreach ($port in @(47831, 5199)) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $connections) {
      $procId = $conn.OwningProcess
      if (-not $procId) { continue }
      $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
      if ($null -eq $proc) { continue }
      $cmd = if ($null -ne $proc.CommandLine) { $proc.CommandLine } else { '' }
      if ($cmd -like "*$normalized*") {
        throw "Atualizacao cancelada: porta $port ainda em uso pelo Manager (PID $procId) em $InstallRoot."
      }
      if ($cmd -match 'local-service\.cjs|serve-manager-ui\.mjs|ServidorManager') {
        throw @"
Atualizacao cancelada: porta $port em uso por outro processo do Manager (PID $procId) fora de $InstallRoot.
Encerre conflitos antes de atualizar. Processos Electron de outros aplicativos nao sao encerrados automaticamente.
"@
      }
    }
  }
}

function Write-ManagerLauncherDiagnostic {
  param(
    [string] $InstallRoot,
    [string] $Message,
    [string] $Detail = ''
  )

  if (Get-Command Get-ManagerLauncherLogDirFromEnv -ErrorAction SilentlyContinue) {
    $logDir = Get-ManagerLauncherLogDirFromEnv
  } else {
    $logDir = Split-Path (Get-ManagerLauncherSessionPath) -Parent
  }
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $logPath = Join-Path $logDir 'manager-launcher-last-error.log'
  $body = @"
recordedAt: $((Get-Date).ToUniversalTime().ToString('o'))
installRoot: $InstallRoot
message: $Message
detail: $Detail
"@
  Set-Content -Path $logPath -Value $body -Encoding UTF8
  return $logPath
}

function Open-ManagerUiInBrowser {
  param([string] $Url = 'http://127.0.0.1:5199/')

  # Breve espera para a UI subir; depois abre o navegador (nao bloquear 25s em silencio).
  Start-Sleep -Seconds 2
  $deadline = (Get-Date).AddSeconds(12)
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
        break
      }
    } catch {
      Start-Sleep -Milliseconds 400
    }
  }

  try {
    Start-Process $Url | Out-Null
    return
  } catch {
    # fallback
  }

  try {
    Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', 'start', '""', $Url) -WindowStyle Hidden | Out-Null
  } catch {
    Write-Host "Abra manualmente no navegador: $Url"
  }
}

function Show-ManagerLauncherErrorMessage {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Message,
    [Parameter(Mandatory = $true)]
    [string] $LogPath
  )

  try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
    [void][System.Windows.Forms.MessageBox]::Show(
      "$Message`n`nDetalhes gravados em:`n$LogPath",
      'Servidor Manager',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    )
  } catch {
    # Sem GUI (sessao remota): mantem apenas o log.
  }
}
