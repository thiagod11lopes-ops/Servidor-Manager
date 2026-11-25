# Encerra somente o hub OMPS instalado (OMPS.exe / Electron sob InstallRoot).
# Não encerra o instalador NSIS (ExcludeProcessId / caminho do instalador).
param(
  [string] $InstallRoot = '',
  [int] $ExcludeProcessId = 0,
  [string] $InstallerExePath = '',
  [string] $TargetExePath = '',
  [string] $LogPath = ''
)
$ErrorActionPreference = 'Stop'

function Write-OmpsStopLog {
  param([string] $Message)
  if (-not $LogPath) { return }
  try {
    Add-Content -Path $LogPath -Value ("[{0}] {1}" -f (Get-Date).ToString('o'), $Message) -Encoding UTF8
  } catch { }
}

function Get-DefaultOmpsHubInstallRoot {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\OMPS'),
    (Join-Path $env:LOCALAPPDATA 'Programs\omps')
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath (Join-Path $c 'OMPS.exe')) { return $c }
  }
  $uninstallRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
  Get-ItemProperty $uninstallRoot -ErrorAction SilentlyContinue |
    Where-Object {
      $_.DisplayName -like 'OMPS*' -and $_.InstallLocation -and (Test-Path -LiteralPath (Join-Path $_.InstallLocation 'OMPS.exe'))
    } |
    Select-Object -ExpandProperty InstallLocation -First 1
}

function Test-ProcessUnderInstallRoot {
  param(
    [object] $Proc,
    [string] $NormalizedRoot
  )
  $cmd = if ($null -ne $Proc.CommandLine) { $Proc.CommandLine } else { '' }
  $exePath = if ($null -ne $Proc.ExecutablePath) { $Proc.ExecutablePath } else { '' }
  if ($cmd -like "*$NormalizedRoot*") { return $true }
  if ($exePath -and ($exePath -like "$NormalizedRoot\*")) { return $true }
  return $false
}

function Test-IsInstallerProcess {
  param(
    [object] $Proc,
    [string] $InstallerExePath
  )
  if (-not $InstallerExePath) { return $false }
  $inst = $InstallerExePath.Trim().TrimEnd('\')
  $exePath = if ($null -ne $Proc.ExecutablePath) { $Proc.ExecutablePath } else { '' }
  $cmd = if ($null -ne $Proc.CommandLine) { $Proc.CommandLine } else { '' }
  if ($exePath -and ($exePath -ieq $inst -or $exePath -like "$inst*")) { return $true }
  if ($cmd -like "*$inst*") { return $true }
  return $false
}

function Test-ShouldSkipProcess {
  param([object] $Proc)
  if ($ExcludeProcessId -gt 0 -and $Proc.ProcessId -eq $ExcludeProcessId) { return $true }
  if (Test-IsInstallerProcess -Proc $Proc -InstallerExePath $InstallerExePath) { return $true }
  return $false
}

function Stop-ProcessTreeFromRoots {
  param([int[]] $RootPids)
  if ($RootPids.Count -eq 0) { return @() }
  $seen = [System.Collections.Generic.HashSet[int]]::new()
  foreach ($p in $RootPids) { [void]$seen.Add($p) }
  $stopped = @()
  for ($pass = 0; $pass -lt 6; $pass++) {
    $children = @(
      Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $seen.Contains($_.ParentProcessId) -and -not $seen.Contains($_.ProcessId) }
    )
    if ($children.Count -eq 0) { break }
    foreach ($c in $children) {
      if (Test-ShouldSkipProcess -Proc $c) {
        [void]$seen.Add($c.ProcessId)
        continue
      }
      Stop-Process -Id $c.ProcessId -Force -ErrorAction SilentlyContinue
      Write-OmpsStopLog "stopped child pid=$($c.ProcessId) name=$($c.Name)"
      [void]$seen.Add($c.ProcessId)
      $stopped += $c.ProcessId
    }
  }
  return $stopped
}

if (-not $LogPath -and $env:OMPS_HUB_INSTALLER_DEBUG -eq '1') {
  $LogPath = Join-Path $env:TEMP 'omps-hub-stop.log'
}

if (-not $InstallRoot -or -not $InstallRoot.Trim()) {
  $InstallRoot = Get-DefaultOmpsHubInstallRoot
}
if (-not $InstallRoot) {
  Write-OmpsStopLog 'InstallRoot desconhecido — nada a encerrar.'
  Write-Host 'Hub OMPS: nenhum InstallRoot conhecido — nada a encerrar.'
  exit 0
}

$normalized = $InstallRoot.Trim().TrimEnd('\')
Write-OmpsStopLog "Stop hub InstallRoot=$normalized ExcludePid=$ExcludeProcessId Installer=$InstallerExePath Target=$TargetExePath"
$stopped = @()

if ($TargetExePath -and (Test-Path -LiteralPath $TargetExePath)) {
  $targetNorm = (Get-Item -LiteralPath $TargetExePath).FullName
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -ieq $targetNorm) } |
    ForEach-Object {
      if (Test-ShouldSkipProcess -Proc $_) { return }
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      Write-OmpsStopLog "stopped target exe pid=$($_.ProcessId)"
      $stopped += $_.ProcessId
    }
}

foreach ($name in @('OMPS.exe', 'electron.exe')) {
  Get-CimInstance Win32_Process -Filter "Name='$name'" -ErrorAction SilentlyContinue | ForEach-Object {
    if (Test-ShouldSkipProcess -Proc $_) {
      Write-OmpsStopLog "skip pid=$($_.ProcessId) (instalador/excluído)"
      return
    }
    if (-not (Test-ProcessUnderInstallRoot -Proc $_ -NormalizedRoot $normalized)) {
      Write-OmpsStopLog "skip pid=$($_.ProcessId) name=$name (fora de InstallRoot)"
      return
    }
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    Write-OmpsStopLog "stopped pid=$($_.ProcessId) name=$name"
    $stopped += $_.ProcessId
  }
}

if ($stopped.Count -gt 0) {
  $treeStopped = Stop-ProcessTreeFromRoots -RootPids $stopped
  $stopped = @($stopped + $treeStopped)
  Start-Sleep -Milliseconds 400
}

Write-Host "Hub OMPS encerrado sob $normalized (PIDs: $($stopped -join ', '))."
