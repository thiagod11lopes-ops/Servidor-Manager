# Smoke: Resolve-ManagerNodeRuntime — Node embarcado preferido; senão sistema; Electron só se explicito.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$installRoot = Join-Path $root 'release\win-unpacked'
$resolve = Join-Path $installRoot 'resources\manager-launcher\Resolve-ManagerNodeRuntime.ps1'
if (-not (Test-Path $resolve)) {
  Write-Host 'SKIP: win-unpacked ausente (rode npm run package:dir antes).'
  exit 0
}
. $resolve

$runtime = Get-ManagerNodeRuntime -Root $installRoot
if ($runtime.Mode -eq 'bundled-node') {
  Write-Host "OK: runtime bundled-node ($($runtime.Executable))"
  exit 0
}

if ($runtime.Mode -eq 'system-node') {
  Write-Host "OK: runtime system-node ($($runtime.Executable))"
  exit 0
}

if ($runtime.Mode -eq 'electron') {
  Write-Host 'OK: runtime Electron (explicito ou legado).'
  exit 0
}

throw "Modo de runtime inesperado: $($runtime.Mode)"
