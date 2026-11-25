# Auditoria SOMENTE LEITURA — OMPS Hub + Servidor OMPS (sem alterar sistema).
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/audit-omps-installations-readonly.ps1
$ErrorActionPreference = 'SilentlyContinue'
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (Test-Path (Join-Path $PSScriptRoot '..\package.json')) {
  $repo = Split-Path $PSScriptRoot -Parent
}

Write-Host '=== Repo ===' $repo

Write-Host "`n=== Artefatos release (repo) ==="
@(
  'release\omps-unified\Instalar OMPS.exe',
  'release\servidor-omps\Servidor OMPS.exe'
) | ForEach-Object {
  $p = Join-Path $repo $_
  if (Test-Path -LiteralPath $p) {
    $h = Get-FileHash -LiteralPath $p -Algorithm SHA256
    $i = Get-Item -LiteralPath $p
    Write-Host "$_ | bytes=$($i.Length) | sha256=$($h.Hash)"
  } else {
    Write-Host "$_ | AUSENTE"
  }
}

function Get-UninstallEntries {
  param([string[]]$KeyGlobs)
  $out = @()
  foreach ($glob in $KeyGlobs) {
    $parent = Split-Path $glob -Parent
    $leaf = Split-Path $glob -Leaf
    Get-ChildItem -Path $parent -ErrorAction SilentlyContinue |
      Where-Object { $_.PSChildName -like $leaf -or $_.Name -like $leaf } |
      ForEach-Object {
        $p = Get-ItemProperty -LiteralPath $_.PSPath
        if ($null -eq $p.DisplayName) { return }
        $out += [PSCustomObject]@{
          RegistryPath = $_.PSPath
          DisplayName  = $p.DisplayName
          InstallLocation = $p.InstallLocation
          UninstallString = $p.UninstallString
          QuietUninstallString = $p.QuietUninstallString
          DisplayVersion = $p.DisplayVersion
          Publisher = $p.Publisher
          EstimatedSize = $p.EstimatedSize
        }
      }
  }
  $out
}

Write-Host "`n=== Registro Uninstall (filtro OMPS / Servidor) ==="
$patterns = 'OMPS|Servidor OMPS|Servidor Manager|servidor-manager|64371c84|1a40ba34'
$uninstall = Get-UninstallEntries @(
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
) | Where-Object { $_.DisplayName -match $patterns -or $_.RegistryPath -match $patterns }

if (-not $uninstall) { Write-Host '(nenhuma entrada encontrada com filtro)' }
$uninstall | Sort-Object DisplayName | ForEach-Object {
  Write-Host "---"
  $_ | Format-List RegistryPath, DisplayName, DisplayVersion, InstallLocation, UninstallString, QuietUninstallString
}

Write-Host "`n=== Verificação dos executáveis referenciados em UninstallString ==="
function Get-ExeFromUninstallString {
  param([string]$s)
  if (-not $s) { return $null }
  if ($s -match '^"(?<exe>[^"]+)"') { return $Matches.exe }
  if ($s -match '^(?<exe>\S+\.exe)') { return $Matches.exe }
  return $null
}

$uninstall | ForEach-Object {
  $exe = Get-ExeFromUninstallString $_.UninstallString
  Write-Host "DisplayName: $($_.DisplayName)"
  Write-Host "  UninstallExe: $exe"
  if ($exe) {
    $exists = Test-Path -LiteralPath $exe
    Write-Host "  Exists: $exists"
    if ($exists) {
      $fi = Get-Item -LiteralPath $exe
      $hash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash
      Write-Host "  Bytes: $($fi.Length) | sha256: $hash | PE: $($fi.Extension)"
      # NSIS installers start with MZ
      $bytes = [byte[]](Get-Content -LiteralPath $exe -Encoding Byte -TotalCount 2)
      Write-Host "  MZ header: $([char]$bytes[0])$([char]$bytes[1])"
    }
  }
  $root = $_.InstallLocation
  if ($root -and (Test-Path -LiteralPath $root)) {
    $appExe = Join-Path $root 'OMPS.exe'
    $mgrExe = Join-Path $root 'ServidorManager.exe'
    foreach ($candidate in @($appExe, $mgrExe)) {
      if (Test-Path -LiteralPath $candidate) {
        $h = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash
        Write-Host "  App in InstallLocation: $candidate | bytes=$((Get-Item $candidate).Length) | sha256=$h"
      }
    }
    $uninst = Get-ChildItem -LiteralPath $root -Filter 'Uninstall*.exe' -ErrorAction SilentlyContinue
    foreach ($u in $uninst) {
      $h = (Get-FileHash -LiteralPath $u.FullName -Algorithm SHA256).Hash
      Write-Host "  Uninstall in tree: $($u.FullName) | bytes=$($u.Length) | sha256=$h"
    }
  } elseif ($root) {
    Write-Host "  InstallLocation MISSING: $root"
  }
}

Write-Host "`n=== Pastas candidatas (Programs) ==="
$local = $env:LOCALAPPDATA
@(
  (Join-Path $local 'Programs\OMPS'),
  (Join-Path $local 'Programs\omps'),
  (Join-Path $local 'Programs\ServidorManager'),
  (Join-Path $local 'Programs\servidor-manager')
) | ForEach-Object {
  if (Test-Path -LiteralPath $_) {
    Write-Host "EXISTS: $_"
    Get-ChildItem -LiteralPath $_ -Filter '*.exe' | ForEach-Object { Write-Host "  exe: $($_.Name) $($_.Length) bytes" }
  }
}

Write-Host "`n=== C:\ServidorManager (dados - so presenca) ==="
if (Test-Path -LiteralPath 'C:\ServidorManager') {
  $sm = Get-Item -LiteralPath 'C:\ServidorManager'
  Write-Host "EXISTS: C:\ServidorManager | lastWrite=$($sm.LastWriteTime)"
  @('systems', 'logs', 'config') | ForEach-Object {
    $p = Join-Path 'C:\ServidorManager' $_
    if (Test-Path $p) { Write-Host "  has: $_" }
  }
} else {
  Write-Host 'C:\ServidorManager não existe'
}

Write-Host "`n=== APP_GUID registry (InstallLocation) ==="
@(
  'HKCU:\Software\64371c84-3239-5852-b556-622891c70961',
  'HKCU:\Software\1a40ba34-1121-5f20-b082-468daeed5702',
  'HKLM:\Software\64371c84-3239-5852-b556-622891c70961',
  'HKLM:\Software\1a40ba34-1121-5f20-b082-468daeed5702'
) | ForEach-Object {
  if (Test-Path $_) {
    $p = Get-ItemProperty $_
    Write-Host "$_ InstallLocation=$($p.InstallLocation)"
  }
}

Write-Host "`n=== Comparacao win-unpacked / stubs / OMPS-Teste ==="
@(
  'C:\OMPS-Teste\ServidorManager',
  (Join-Path $repo 'release\omps-unified\win-unpacked'),
  (Join-Path $repo 'release\servidor-omps\win-unpacked'),
  (Join-Path $repo 'release\omps-unified\__uninstaller-nsis-servidor-manager.exe'),
  (Join-Path $repo 'release\servidor-omps\__uninstaller-nsis-servidor-manager.exe')
) | ForEach-Object {
  Write-Host "--- $_ ---"
  if (-not (Test-Path -LiteralPath $_)) { Write-Host '  (nao existe)'; return }
  if ($_ -like '*.exe') {
    $h = (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash
    Write-Host "  stub bytes=$((Get-Item $_).Length) sha256=$h"
    return
  }
  Get-ChildItem -LiteralPath $_ -Filter 'Uninstall*.exe' -ErrorAction SilentlyContinue | ForEach-Object {
    $h = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    Write-Host "  $($_.Name) bytes=$($_.Length) sha256=$h"
  }
}

Write-Host "`n=== Duplicata Programs\omps vs Programs\OMPS ==="
$omps1 = Join-Path $env:LOCALAPPDATA 'Programs\OMPS\OMPS.exe'
$omps2 = Join-Path $env:LOCALAPPDATA 'Programs\omps\OMPS.exe'
if ((Test-Path $omps1) -and (Test-Path $omps2)) {
  $h1 = (Get-FileHash $omps1 -Algorithm SHA256).Hash
  $h2 = (Get-FileHash $omps2 -Algorithm SHA256).Hash
  Write-Host "OMPS.exe hash match: $($h1 -eq $h2)"
  Write-Host "  OMPS: $h1"
  Write-Host "  omps: $h2"
}

Write-Host "`n=== Fim auditoria (somente leitura) ==="
