# Build de teste Servidor OMPS (win-unpacked) — dados e portas isolados de C:\ServidorManager e do Manager instalado.
# Não substitui instalação em %LOCALAPPDATA%; não executa NSIS nem refresh:installed.
param(
  [string] $InstallRoot = '',
  [string] $DataRoot = '',
  [int] $ServicePort = 47832,
  [int] $UiPort = 5200,
  [switch] $Interactive,
  [switch] $NoBrowser
)
$ErrorActionPreference = 'Stop'

$profileScript = Join-Path $PSScriptRoot 'ManagerLauncherProfile.ps1'
if (-not (Test-Path $profileScript)) {
  throw "ManagerLauncherProfile.ps1 não encontrado em $PSScriptRoot"
}
. $profileScript

if (-not $InstallRoot) {
  $InstallRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'release\servidor-omps\win-unpacked'
}
if (-not (Test-Path -LiteralPath $InstallRoot)) {
  throw "Build de teste não encontrada: $InstallRoot`nExecute npm run package:servidor-omps:dir no repositório."
}

$profile = Initialize-ServidorManagerIsolatedTestProfile `
  -InstallRoot $InstallRoot `
  -DataRoot $DataRoot `
  -ServicePort $ServicePort `
  -UiPort $UiPort

Write-Host '=== Servidor OMPS — modo de teste isolado ==='
Write-Host ('InstallRoot (binários): ' + $profile.InstallRoot)
Write-Host ('DataRoot (dados):       ' + $profile.DataRoot)
Write-Host ('API local-service:      http://127.0.0.1:' + $profile.ServicePort)
Write-Host ('UI:                     ' + $profile.UiUrl)
Write-Host ('Rota OMPS:              ' + $profile.ServidorOmps)
Write-Host ''
Write-Host 'Dados de produção em C:\ServidorManager NÃO são usados neste perfil.'
Write-Host 'Feche o Manager instalado se quiser evitar confusão; portas diferem (47832/5200).'
Write-Host ''

$launcher = Join-Path $PSScriptRoot 'Start-ServidorManager-NoElectron.ps1'
if (-not (Test-Path $launcher)) {
  throw "Start-ServidorManager-NoElectron.ps1 não encontrado."
}

& $launcher -InstallRoot $profile.InstallRoot -Interactive:$Interactive -NoBrowser:$NoBrowser
