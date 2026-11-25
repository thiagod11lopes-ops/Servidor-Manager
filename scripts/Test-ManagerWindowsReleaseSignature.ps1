# Verifica assinatura Authenticode do ServidorManager.exe (release ou instalado).
param(
  [string] $ExePath = '',
  [switch] $RequireValidSignature
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not $ExePath) {
  $ExePath = Join-Path $root 'release\win-unpacked\ServidorManager.exe'
}

if (-not (Test-Path -LiteralPath $ExePath)) {
  Write-Error "Executável não encontrado: $ExePath"
}

$item = Get-Item -LiteralPath $ExePath
$hash = (Get-FileHash -LiteralPath $ExePath -Algorithm SHA256).Hash
$version = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($ExePath)
$sig = Get-AuthenticodeSignature -FilePath $ExePath

$report = [ordered]@{
  Path = $ExePath
  SizeBytes = $item.Length
  LastWriteTime = $item.LastWriteTime.ToString('o')
  FileVersion = $version.FileVersion
  ProductVersion = $version.ProductVersion
  Sha256 = $hash
  SignatureStatus = $sig.Status.ToString()
  SignerSubject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { '' }
  SignerThumbprint = if ($sig.SignerCertificate) { $sig.SignerCertificate.Thumbprint } else { '' }
}

$report.GetEnumerator() | ForEach-Object { Write-Output ("{0}: {1}" -f $_.Key, $_.Value) }

$trusted = @(
  [System.Management.Automation.SignatureStatus]::Valid
)

if ($trusted -contains $sig.Status) {
  exit 0
}

if ($RequireValidSignature) {
  Write-Error "Assinatura inválida ou ausente (Status=$($sig.Status)). Veja docs/WINDOWS-CODE-SIGNING.md"
}

exit 1
