# Resolve qual InstallRoot usar quando há cópias em Program Files e %LOCALAPPDATA%.
# Não remove pastas — apenas escolhe a instalação oficial/preferida para launchers.

function Test-ManagerInstallRootComplete {
  param([Parameter(Mandatory = $true)][string] $Root)
  if (-not (Test-Path -LiteralPath $Root)) { return $false }
  $uiIndex = Join-Path $Root 'resources\ui-dist\index.html'
  $service = Join-Path $Root 'resources\local-service\local-service.cjs'
  $exe = Join-Path $Root 'ServidorManager.exe'
  return ((Test-Path -LiteralPath $uiIndex) -and (Test-Path -LiteralPath $service) -and (Test-Path -LiteralPath $exe))
}

function Test-ServidorOmpsProductInstall {
  param([Parameter(Mandatory = $true)][string] $Root)
  $marker = Join-Path $Root 'resources\servidor-omps-product.json'
  $payload = Join-Path $Root 'resources\omps-payload'
  return ((Test-Path -LiteralPath $marker) -or (Test-Path -LiteralPath $payload))
}

function Resolve-ManagerInstallRoot {
  param(
    [string] $PreferredRoot = '',
    [switch] $AllowIncomplete
  )

  if ($PreferredRoot -and $PreferredRoot.Trim()) {
    $preferred = $PreferredRoot.Trim().TrimEnd('\')
    if ($AllowIncomplete -or (Test-ManagerInstallRootComplete -Root $preferred)) {
      return $preferred
    }
  }

  $programFiles = 'C:\Program Files\ServidorManager'
  $localApp = Join-Path $env:LOCALAPPDATA 'Programs\ServidorManager'

  $candidates = @()
  if ((Test-ServidorOmpsProductInstall -Root $programFiles) -and (Test-ManagerInstallRootComplete -Root $programFiles)) {
    $candidates += @{ Root = $programFiles; Rank = 3; Label = 'program-files-omps' }
  }
  if ((Test-ManagerInstallRootComplete -Root $programFiles)) {
    $candidates += @{ Root = $programFiles; Rank = 2; Label = 'program-files' }
  }
  if ((Test-ManagerInstallRootComplete -Root $localApp)) {
    $candidates += @{ Root = $localApp; Rank = 1; Label = 'localappdata' }
  }

  if ($candidates.Count -gt 0) {
    $best = $candidates | Sort-Object -Property Rank -Descending | Select-Object -First 1
    return $best.Root
  }

  if ($AllowIncomplete) {
    if (Test-Path -LiteralPath $programFiles) { return $programFiles }
    if (Test-Path -LiteralPath $localApp) { return $localApp }
  }

  return $localApp
}

if ($MyInvocation.InvocationName -ne '.') {
  $resolved = Resolve-ManagerInstallRoot -PreferredRoot $args[0]
  Write-Output $resolved
}
