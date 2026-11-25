param(
  [string] $InstallRoot = '',
  [bool] $CreateDesktopShortcut = $true
)
$ErrorActionPreference = 'Stop'
if (-not $InstallRoot) {
  $InstallRoot = Join-Path $env:LOCALAPPDATA 'AcompOPMS'
}
if (-not $CreateDesktopShortcut) {
  Write-Host 'Atalho na Área de trabalho omitido (escolha do instalador). Menu Iniciar permanece via NSIS.'
  exit 0
}
$exe = Join-Path $InstallRoot 'AcompOPMS.exe'
if (-not (Test-Path $exe)) {
  throw "Executável do cliente ausente: $exe"
}
. (Join-Path $PSScriptRoot 'Resolve-OmpsUserDesktopDirectory.ps1')
$desktop = Get-OmpsUserDesktopDirectory
$lnk = Join-Path $desktop 'OMPS Usuário.lnk'
$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($lnk)
$sc.TargetPath = $exe
$sc.WorkingDirectory = $InstallRoot
$sc.Description = 'OMPS Usuário — AcompOPMS (servidor central)'
try {
  $sc.Save()
  Write-Host "Atalho: $lnk -> $exe"
} catch {
  Write-Error "Não foi possível gravar o atalho $lnk : $($_.Exception.Message)"
  exit 3
}
