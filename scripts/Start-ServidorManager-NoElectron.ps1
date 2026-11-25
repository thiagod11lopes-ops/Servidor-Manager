# Servidor Manager — UI (:5199) + local-service (:47831). Padrão: segundo plano (sem janela PowerShell aberta).
param(
  [string] $InstallRoot = '',
  [switch] $Interactive,
  [switch] $NoBrowser
)
$ErrorActionPreference = 'Stop'
$serviceProc = $null
$uiProc = $null
$startedOk = $false
$installRootResolveScript = Join-Path $PSScriptRoot 'Resolve-ManagerInstallRoot.ps1'
if (-not (Test-Path $installRootResolveScript)) {
  $installRootResolveScript = Join-Path (Split-Path $PSScriptRoot -Parent) 'server-bootstrap\Resolve-ManagerInstallRoot.ps1'
}
if (-not $InstallRoot -and (Test-Path $installRootResolveScript)) {
  . $installRootResolveScript
  $InstallRoot = Resolve-ManagerInstallRoot
}
if (-not $InstallRoot) {
  $InstallRoot = Join-Path $env:LOCALAPPDATA 'Programs\ServidorManager'
}
$installRoot = $InstallRoot

$profileScript = Join-Path $PSScriptRoot 'ManagerLauncherProfile.ps1'
if (Test-Path $profileScript) {
  . $profileScript
}

try {
  if (Get-Command Get-ManagerLauncherLogDirFromEnv -ErrorAction SilentlyContinue) {
    $launcherLogDir = Get-ManagerLauncherLogDirFromEnv
  } elseif ($env:SERVIDOR_MANAGER_DATA_ROOT) {
    $launcherLogDir = Join-Path $env:SERVIDOR_MANAGER_DATA_ROOT 'logs'
  } else {
    $launcherLogDir = 'C:\ServidorManager\logs'
  }
  New-Item -ItemType Directory -Force -Path $launcherLogDir | Out-Null
  "$(Get-Date -Format 'o') Iniciando launcher InstallRoot=$installRoot" | Set-Content -Path (Join-Path $launcherLogDir 'launcher-last.log') -Encoding UTF8
  $serviceDir = Join-Path $installRoot 'resources\local-service'
  $serviceEntry = Join-Path $serviceDir 'local-service.cjs'
  $hostScript = Join-Path $serviceDir 'service-host.cjs'
  $uiRoot = Join-Path $installRoot 'resources\ui-dist'
  $serveScript = Join-Path $installRoot 'resources\manager-launcher\serve-manager-ui.mjs'
  $resourcesPath = Join-Path $installRoot 'resources'
  $bootstrapDir = Join-Path $resourcesPath 'server-bootstrap'

  foreach ($required in @($serviceEntry, $uiRoot, $serveScript)) {
    if (-not (Test-Path $required)) {
      Write-Host "Pacote incompleto: $required"
      Write-Host "InstallRoot: $installRoot"
      exit 1
    }
  }

  $resolveScript = Join-Path $installRoot 'resources\manager-launcher\Resolve-ManagerNodeRuntime.ps1'
  if (-not (Test-Path $resolveScript)) {
    $resolveScript = Join-Path $bootstrapDir 'Resolve-ManagerNodeRuntime.ps1'
  }
  $sessionScript = Join-Path $installRoot 'resources\manager-launcher\ManagerLauncherSession.ps1'
  if (-not (Test-Path $sessionScript)) {
    $sessionScript = Join-Path $bootstrapDir 'ManagerLauncherSession.ps1'
  }
  if (-not (Test-Path $resolveScript)) {
    throw 'Resolve-ManagerNodeRuntime.ps1 nao encontrado em manager-launcher ou server-bootstrap.'
  }
  if (-not (Test-Path $sessionScript)) {
    $sessionScript = Join-Path $PSScriptRoot 'ManagerLauncherSession.ps1'
  }
  . $resolveScript
  . $sessionScript

  $runtime = Get-ManagerNodeRuntime -Root $installRoot
  Write-Host ('Runtime: ' + $runtime.Label)

  $validateUiScript = Join-Path $installRoot 'resources\manager-launcher\validate-manager-ui-bundle.mjs'
  if (-not (Test-Path $validateUiScript)) {
    $validateUiScript = Join-Path $PSScriptRoot 'validate-manager-ui-bundle.mjs'
  }
  if (Test-Path $validateUiScript) {
    & $runtime.Executable $validateUiScript $uiRoot | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "resources/ui-dist inválida em $installRoot. Atualize ui-dist/local-service (Update-ProgramFiles-OmpsResources-Once.ps1)."
    }
  }

  Set-ManagerNodeProcessEnv -Runtime $runtime -HostScript $hostScript -ResourcesPath $resourcesPath -BootstrapDir $bootstrapDir -InstallRoot $installRoot

  Stop-ProcessesForInstallRoot -InstallRoot $installRoot
  Start-Sleep -Seconds 1

  $servicePort = if (Get-Command Get-ManagerServicePortFromEnv -ErrorAction SilentlyContinue) {
    Get-ManagerServicePortFromEnv
  } elseif ($env:SERVIDOR_MANAGER_SERVICE_PORT) {
    [int]$env:SERVIDOR_MANAGER_SERVICE_PORT
  } else { 47831 }

  $uiPort = if (Get-Command Get-ManagerUiPortFromEnv -ErrorAction SilentlyContinue) {
    Get-ManagerUiPortFromEnv
  } elseif ($env:SM_UI_PORT) {
    [int]$env:SM_UI_PORT
  } else { 5199 }

  if (-not $env:SM_LOCAL_SERVICE_URL) {
    $env:SM_LOCAL_SERVICE_URL = "http://127.0.0.1:$servicePort"
  }
  if (-not $env:SM_UI_PORT) {
    $env:SM_UI_PORT = [string]$uiPort
  }
  if (-not $env:SERVIDOR_MANAGER_SERVICE_PORT) {
    $env:SERVIDOR_MANAGER_SERVICE_PORT = [string]$servicePort
  }

  $serviceProc = Start-ManagerNodeBackground -Runtime $runtime -ArgumentList @($serviceEntry)
  Start-Sleep -Seconds 2
  Write-Host ('local-service PID ' + $serviceProc.Id + ' - porta ' + $servicePort)

  $uiProc = Start-ManagerNodeBackground -Runtime $runtime -ArgumentList @($serveScript, $uiRoot)
  Start-Sleep -Seconds 1

  Save-ManagerLauncherSession -InstallRoot $installRoot -ServicePid $serviceProc.Id -UiPid $uiProc.Id `
    -RuntimeMode $runtime.Mode -RuntimeExecutable $runtime.Executable

  $url = "http://127.0.0.1:$uiPort/"
  $servidorOmpsProduct = Join-Path $resourcesPath 'servidor-omps-product.json'
  if (Test-Path -LiteralPath $servidorOmpsProduct) {
    $url = "http://127.0.0.1:$uiPort/dashboard"
  }
  Write-Host ('UI: ' + $url)
  if (-not $NoBrowser) {
    Open-ManagerUiInBrowser -Url $url
  }

  $startedOk = $true
  $sessionPath = Get-ManagerLauncherSessionPath
  Write-Host ('Sessao: ' + $sessionPath)

  if ($Interactive) {
    Write-Host ''
    Write-Host 'Modo interativo: deixe esta janela aberta. Ctrl+C encerra UI e servico.'
    Wait-Process -Id $uiProc.Id
  } else {
    Write-Host ''
    Write-Host 'Manager em segundo plano. Para encerrar: Stop-ServidorManager-Installed.ps1'
  }
} catch {
  Write-Host ''
  Write-Host 'ERRO ao iniciar o Servidor Manager:'
  Write-Host $_.Exception.Message
  $logPath = $null
  if (Get-Command Write-ManagerLauncherDiagnostic -ErrorAction SilentlyContinue) {
    $stack = if ($null -ne $_.ScriptStackTrace) { $_.ScriptStackTrace } else { '' }
    $logPath = Write-ManagerLauncherDiagnostic -InstallRoot $installRoot -Message $_.Exception.Message -Detail $stack
  }
  if (-not $Interactive -and $logPath) {
    Show-ManagerLauncherErrorMessage -Message $_.Exception.Message -LogPath $logPath
  }
  if ($Interactive) {
    Read-Host 'Pressione Enter para fechar'
  }
  exit 1
} finally {
  if ($Interactive) {
    if ($null -ne $serviceProc -and -not $serviceProc.HasExited) {
      Stop-Process -Id $serviceProc.Id -Force -ErrorAction SilentlyContinue
    }
    if ($null -ne $uiProc -and -not $uiProc.HasExited) {
      Stop-Process -Id $uiProc.Id -Force -ErrorAction SilentlyContinue
    }
  } elseif (-not $startedOk) {
    if ($null -ne $serviceProc -and -not $serviceProc.HasExited) {
      Stop-Process -Id $serviceProc.Id -Force -ErrorAction SilentlyContinue
    }
    if ($null -ne $uiProc -and -not $uiProc.HasExited) {
      Stop-Process -Id $uiProc.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

if ($startedOk -and -not $Interactive) {
  exit 0
}
