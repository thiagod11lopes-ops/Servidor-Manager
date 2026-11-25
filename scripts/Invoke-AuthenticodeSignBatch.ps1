# Assina lote de arquivos com Authenticode (SHA-256 + timestamp RFC 3161).
# Certificado via ambiente — nunca commitar PFX/senha.
param(
  [Parameter(Mandatory = $true)]
  [string[]] $Files,
  [switch] $IfConfigured,
  [switch] $RequireValidSignature
)

$ErrorActionPreference = 'Stop'

function Get-CodeSignConfiguration {
  $pfxPath = $env:CSC_LINK
  if (-not $pfxPath) { $pfxPath = $env:WIN_CSC_LINK }
  if (-not $pfxPath) { $pfxPath = $env:SERVIDOR_MANAGER_SIGN_PFX }

  $password = $env:CSC_KEY_PASSWORD
  if (-not $password) { $password = $env:WIN_CSC_KEY_PASSWORD }
  if (-not $password) { $password = $env:SERVIDOR_MANAGER_SIGN_PASSWORD }

  $signtool = $env:SIGNTOOL_PATH
  if (-not $signtool) {
    $sdkBin = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
    if (Test-Path -LiteralPath $sdkBin) {
      $latest = Get-ChildItem -LiteralPath $sdkBin -Directory | Sort-Object Name -Descending | Select-Object -First 1
      $candidate = Join-Path $latest.FullName 'x64\signtool.exe'
      if (Test-Path -LiteralPath $candidate) { $signtool = $candidate }
    }
  }

  $timestamp = $env:SERVIDOR_MANAGER_TIMESTAMP_URL
  if (-not $timestamp) { $timestamp = 'http://timestamp.digicert.com' }

  return @{
    PfxPath = $pfxPath
    Password = $password
    Signtool = $signtool
    Timestamp = $timestamp
  }
}

$cfg = Get-CodeSignConfiguration
if (-not $cfg.PfxPath) {
  if ($IfConfigured) {
    Write-Host 'Assinatura ignorada: CSC_LINK / WIN_CSC_LINK / SERVIDOR_MANAGER_SIGN_PFX não definido.'
    exit 0
  }
  throw 'Certificado não configurado. Defina CSC_LINK (PFX) e CSC_KEY_PASSWORD. Veja docs/WINDOWS-CODE-SIGNING.md'
}

if (-not (Test-Path -LiteralPath $cfg.PfxPath)) {
  throw "Certificado não encontrado: $($cfg.PfxPath)"
}
if (-not $cfg.Signtool -or -not (Test-Path -LiteralPath $cfg.Signtool)) {
  throw 'signtool.exe não encontrado. Instale Windows SDK ou defina SIGNTOOL_PATH.'
}

$unique = @($Files | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique)
if ($unique.Count -eq 0) {
  if ($IfConfigured) { exit 0 }
  throw 'Nenhum arquivo existente para assinar.'
}

Write-Host "Authenticode: assinando $($unique.Count) arquivo(s)..."

foreach ($file in $unique) {
  if ($cfg.Password) {
    & $cfg.Signtool sign /fd sha256 /f $cfg.PfxPath /p $cfg.Password /tr $cfg.Timestamp /td sha256 /v $file
  } else {
    & $cfg.Signtool sign /fd sha256 /f $cfg.PfxPath /tr $cfg.Timestamp /td sha256 /v $file
  }
  if ($LASTEXITCODE -ne 0) {
    throw "signtool falhou ($LASTEXITCODE) em $file"
  }
  if ($RequireValidSignature) {
    $sig = Get-AuthenticodeSignature -FilePath $file
    if ($sig.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
      throw "Assinatura inválida após signtool ($($sig.Status)): $file"
    }
  }
}

Write-Host 'Authenticode: lote concluído.'
