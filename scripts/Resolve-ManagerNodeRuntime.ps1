# Resolve runtime Node: embarcado -> sistema (>= min major) -> Electron somente se explicito (SM_FORCE_ELECTRON_RUNTIME).
$script:ManagerMinSystemNodeMajor = 20

function Get-ManagerBundledNodePath {
  param([Parameter(Mandatory = $true)][string] $Root)

  $candidates = @(
    (Join-Path $Root 'resources\nodejs\node.exe'),
    (Join-Path $Root 'resources\manager-node\node.exe')
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }
  return $null
}

function Test-NodeExecutableFunctional {
  param(
    [Parameter(Mandatory = $true)][string] $NodePath,
    [int] $MinMajor = 0
  )

  if (-not (Test-Path -LiteralPath $NodePath)) { return $false }

  try {
    # Nao usar $LASTEXITCODE apos pipeline (Select-Object): em execucoes repetidas no mesmo
    # processo PowerShell o codigo pode ficar -1 mesmo com node --version valido.
    $raw = & $NodePath --version 2>&1
    if ($null -eq $raw) { return $false }
    if ($raw -is [System.Management.Automation.ErrorRecord]) { return $false }

    $verLine = if ($raw -is [System.Array]) { $raw[0] } else { $raw }
    $verLine = $verLine.ToString().Trim()
    if ($verLine -notmatch '^v?(\d+)') { return $false }

    $major = [int]$Matches[1]
    if ($MinMajor -gt 0 -and $major -lt $MinMajor) { return $false }
    return $true
  } catch {
    return $false
  }
}

function Test-SystemNodeFunctional {
  param([int] $MinMajor = 0)

  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCmd) { return $null }

  $nodePath = $nodeCmd.Source
  if (-not (Test-NodeExecutableFunctional -NodePath $nodePath -MinMajor $MinMajor)) {
    return $null
  }
  return $nodePath
}

function Get-ManagerElectronRuntime {
  param([Parameter(Mandatory = $true)][string] $Root)

  $electron = Join-Path $Root 'ServidorManager.exe'
  if (-not (Test-Path -LiteralPath $electron)) {
    return $null
  }

  return [PSCustomObject]@{
    Executable = $electron
    Mode       = 'electron'
    Label      = 'Electron (ServidorManager.exe + ELECTRON_RUN_AS_NODE; pode exigir assinatura no Windows SAC)'
  }
}

function Get-ManagerNodeRuntime {
  param([string] $Root)

  if (-not $Root) {
    $Root = Join-Path $env:LOCALAPPDATA 'Programs\ServidorManager'
  }

  if ($env:SM_FORCE_ELECTRON_RUNTIME -eq '1') {
    $forced = Get-ManagerElectronRuntime -Root $Root
    if ($forced) { return $forced }
    throw "SM_FORCE_ELECTRON_RUNTIME=1, mas ServidorManager.exe nao foi encontrado em: $Root"
  }

  $bundledPath = Get-ManagerBundledNodePath -Root $Root
  if ($bundledPath -and (Test-NodeExecutableFunctional -NodePath $bundledPath -MinMajor 0)) {
    return [PSCustomObject]@{
      Executable = $bundledPath
      Mode       = 'bundled-node'
      Label      = "Node.js embarcado ($bundledPath)"
    }
  }

  $systemPath = Test-SystemNodeFunctional -MinMajor $script:ManagerMinSystemNodeMajor
  if ($systemPath) {
    return [PSCustomObject]@{
      Executable = $systemPath
      Mode       = 'system-node'
      Label      = "Node.js do sistema ($systemPath)"
    }
  }

  if ($env:SM_ALLOW_ELECTRON_RUNTIME -eq '1') {
    $electron = Get-ManagerElectronRuntime -Root $Root
    if ($electron) { return $electron }
  }

  throw @"
Runtime Node indisponivel para o Servidor Manager.
- Reinstale o Manager (pacote incompleto ou node embarcado ausente), ou
- Instale Node.js LTS $script:ManagerMinSystemNodeMajor+ (winget install OpenJS.NodeJS.LTS), ou
- Em ambientes de teste sem Smart App Control: defina SM_ALLOW_ELECTRON_RUNTIME=1 (nao recomendado em producao).
InstallRoot: $Root
"@
}

function Set-ManagerNodeProcessEnv {
  param(
    [Parameter(Mandatory = $true)]
    $Runtime,
    [string] $HostScript,
    [string] $ResourcesPath,
    [string] $BootstrapDir,
    [string] $InstallRoot = ''
  )

  $env:NODE_ENV = 'production'
  if ($Runtime.Mode -eq 'electron') {
    $env:ELECTRON_RUN_AS_NODE = '1'
  } else {
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  }
  $env:SM_SERVICE_HOST_SCRIPT = $HostScript
  $env:SM_NODE_PATH = $Runtime.Executable
  $env:SM_RESOURCES_PATH = $ResourcesPath
  $env:SM_BOOTSTRAP_DIR = $BootstrapDir
  if ($InstallRoot) {
    $env:SERVIDOR_MANAGER_INSTALL_ROOT = $InstallRoot
  }
}

function Start-ManagerNodeBackground {
  param(
    [Parameter(Mandatory = $true)]
    $Runtime,
    [Parameter(Mandatory = $true)]
    [string[]] $ArgumentList
  )

  if ($Runtime.Mode -eq 'electron') {
    $env:ELECTRON_RUN_AS_NODE = '1'
  }
  return Start-Process -FilePath $Runtime.Executable -ArgumentList $ArgumentList -WindowStyle Hidden -PassThru
}
