# Assina ServidorManager.exe (e DLLs do pacote) quando certificado estiver configurado via ambiente.
# Nunca commitar PFX/senha. Variáveis: CSC_LINK ou WIN_CSC_LINK, CSC_KEY_PASSWORD ou WIN_CSC_KEY_PASSWORD.
param(
  [string] $TargetDir = '',
  [switch] $IfConfigured
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $TargetDir) {
  $TargetDir = Join-Path $root 'release\win-unpacked'
}

$exe = Join-Path $TargetDir 'ServidorManager.exe'
if (-not (Test-Path -LiteralPath $exe)) {
  if ($IfConfigured) { exit 0 }
  throw "Pacote não encontrado: $exe (rode npm run package:dir antes)."
}

$targets = @($exe)
$targets += Get-ChildItem -LiteralPath $TargetDir -Filter '*.dll' -File | ForEach-Object { $_.FullName }

& (Join-Path $PSScriptRoot 'Invoke-AuthenticodeSignBatch.ps1') -Files $targets -IfConfigured:$IfConfigured -RequireValidSignature:$false

if ($IfConfigured) {
  $st = (Get-AuthenticodeSignature -FilePath $exe).Status
  if ($st -ne [System.Management.Automation.SignatureStatus]::Valid) {
    Write-Host 'Assinatura ignorada ou ausente (IfConfigured).'
    exit 0
  }
}

& (Join-Path $PSScriptRoot 'Test-ManagerWindowsReleaseSignature.ps1') -ExePath $exe -RequireValidSignature
Write-Host 'Assinatura concluída.'
