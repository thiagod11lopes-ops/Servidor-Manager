# Perfil de dados/portas do launcher (padrão produção vs teste isolado).
# Override explícito por variáveis de ambiente; sem env = comportamento legado.

function Get-ManagerDataRootFromEnv {
  $override = $env:SERVIDOR_MANAGER_DATA_ROOT
  if ($override -and $override.Trim()) {
    return $override.Trim().TrimEnd('\')
  }
  return 'C:\ServidorManager'
}

function Get-ManagerServicePortFromEnv {
  $raw = $env:SERVIDOR_MANAGER_SERVICE_PORT
  if ($raw -and $raw.Trim()) {
    $n = [int]$raw
    if ($n -ge 1 -and $n -le 65535) { return $n }
  }
  return 47831
}

function Get-ManagerUiPortFromEnv {
  $raw = $env:SM_UI_PORT
  if ($raw -and $raw.Trim()) {
    $n = [int]$raw
    if ($n -ge 1 -and $n -le 65535) { return $n }
  }
  return 5199
}

function Get-ManagerLauncherPorts {
  return @(
    (Get-ManagerServicePortFromEnv),
    (Get-ManagerUiPortFromEnv)
  )
}

function Get-ManagerLauncherSessionPathFromEnv {
  $override = $env:SERVIDOR_MANAGER_LAUNCHER_SESSION_PATH
  if ($override -and $override.Trim()) {
    return $override.Trim()
  }
  $dataRoot = Get-ManagerDataRootFromEnv
  return Join-Path $dataRoot 'logs\manager-launcher-session.json'
}

function Get-ManagerLauncherLogDirFromEnv {
  return Join-Path (Get-ManagerDataRootFromEnv) 'logs'
}

<#
  Ativa perfil de teste isolado (não altera C:\ServidorManager).
  Exige -DataRoot explícito ou usa subpasta em release/ do repositório.
#>
function Initialize-ServidorManagerIsolatedTestProfile {
  param(
    [Parameter(Mandatory = $true)]
    [string] $InstallRoot,
    [string] $DataRoot = '',
    [int] $ServicePort = 47832,
    [int] $UiPort = 5200
  )

  $resolvedInstall = (Resolve-Path -LiteralPath $InstallRoot).Path.TrimEnd('\')
  if (-not $DataRoot) {
    $repoRoot = Split-Path $PSScriptRoot -Parent
    if (Test-Path (Join-Path $repoRoot 'package.json')) {
      $DataRoot = Join-Path $repoRoot 'release\servidor-omps-isolated-data'
    } else {
      $DataRoot = Join-Path $env:TEMP 'ServidorManager-isolated-test'
    }
  }
  $resolvedData = [System.IO.Path]::GetFullPath($DataRoot)

  if ($resolvedData -ieq 'C:\ServidorManager') {
    throw 'Perfil isolado recusado: DataRoot não pode ser C:\ServidorManager.'
  }

  $env:SERVIDOR_MANAGER_ISOLATED_TEST = '1'
  $env:SERVIDOR_MANAGER_DATA_ROOT = $resolvedData
  $env:SERVIDOR_MANAGER_CONFIG_DIR = Join-Path $resolvedData 'config'
  $env:SERVIDOR_MANAGER_SYSTEMS_ROOT = Join-Path $resolvedData 'systems'
  $env:SERVIDOR_MANAGER_SERVICE_PORT = [string]$ServicePort
  $env:SM_UI_PORT = [string]$UiPort
  $env:SM_LOCAL_SERVICE_URL = "http://127.0.0.1:$ServicePort"
  $env:SERVIDOR_MANAGER_LAUNCHER_SESSION_PATH = Join-Path $resolvedData 'logs\manager-launcher-session.json'
  $env:SERVIDOR_MANAGER_INSTALL_ROOT = $resolvedInstall

  return [pscustomobject]@{
    InstallRoot  = $resolvedInstall
    DataRoot     = $resolvedData
    ServicePort  = $ServicePort
    UiPort       = $UiPort
    UiUrl        = "http://127.0.0.1:$UiPort/"
    ServidorOmps = "http://127.0.0.1:$UiPort/dashboard"
  }
}
