# Assina artefatos OMPS (win-unpacked + instaladores NSIS) quando certificado estiver configurado.
# Ordem de release: electron-builder --dir → assinar win-unpacked → NSIS --prepackaged → assinar NSIS.
param(
  [ValidateSet('servidor-omps', 'omps-usuario', 'all')]
  [string] $Variant = 'all',
  [ValidateSet('win-unpacked', 'nsis', 'all')]
  [string] $Stage = 'all',
  [switch] $IfConfigured,
  [switch] $RequireValidSignature
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$invoke = Join-Path $PSScriptRoot 'Invoke-AuthenticodeSignBatch.ps1'

function Get-WinUnpackedSignTargets {
  param([string] $UnpackedDir)
  $targets = @()
  $exe = Get-ChildItem -LiteralPath $UnpackedDir -Filter '*.exe' -File -ErrorAction SilentlyContinue
  $dll = Get-ChildItem -LiteralPath $UnpackedDir -Filter '*.dll' -File -ErrorAction SilentlyContinue
  foreach ($f in @($exe; $dll)) { $targets += $f.FullName }
  return $targets
}

function Get-NsisSignTargets {
  param([string] $ReleaseDir, [string[]] $PrimaryNames)
  $targets = @()
  foreach ($name in $PrimaryNames) {
    $p = Join-Path $ReleaseDir $name
    if (Test-Path -LiteralPath $p) { $targets += $p }
  }
  $uninst = Get-ChildItem -LiteralPath $ReleaseDir -Filter '__uninstaller-nsis-*.exe' -File -ErrorAction SilentlyContinue
  foreach ($f in $uninst) { $targets += $f.FullName }
  return $targets
}

$jobs = @()
if ($Variant -eq 'all' -or $Variant -eq 'servidor-omps') {
  $rel = Join-Path $root 'release\servidor-omps'
  if ($Stage -eq 'all' -or $Stage -eq 'win-unpacked') {
    $jobs += Get-WinUnpackedSignTargets -UnpackedDir (Join-Path $rel 'win-unpacked')
  }
  if ($Stage -eq 'all' -or $Stage -eq 'nsis') {
    $jobs += Get-NsisSignTargets -ReleaseDir $rel -PrimaryNames @('Servidor OMPS.exe')
  }
}
if ($Variant -eq 'all' -or $Variant -eq 'omps-usuario') {
  $rel = Join-Path $root 'release\omps-usuario'
  if ($Stage -eq 'all' -or $Stage -eq 'win-unpacked') {
    $jobs += Get-WinUnpackedSignTargets -UnpackedDir (Join-Path $rel 'win-unpacked')
  }
  if ($Stage -eq 'all' -or $Stage -eq 'nsis') {
    $jobs += Get-NsisSignTargets -ReleaseDir $rel -PrimaryNames @('OMPS Usuario.exe')
  }
}

& $invoke -Files $jobs -IfConfigured:$IfConfigured -RequireValidSignature:$RequireValidSignature
