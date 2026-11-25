<#
.SYNOPSIS
  Remocao CONTROLADA de OMPS Hub + Servidor OMPS (nao executa desinstaladores NSIS quebrados).

.DESCRIPTION
  - NAO remove C:\ServidorManager por padrao (dados do servidor).
  - Exige -SkipPrompt ou confirmacao interativa REMOVER antes de apagar pastas/registro.
  - Use -WhatIf para simular.
  - Rode primeiro: scripts/audit-omps-installations-readonly.ps1

.PARAMETER WhatIf
  Mostra o que seria removido.

.PARAMETER SkipPrompt
  Pula confirmacao interativa REMOVER (use com cuidado).

.PARAMETER IncludeDataRoot
  Se definido, oferece remover C:\ServidorManager (segunda confirmacao obrigatoria).

.NOTES
  NAO executado pelo repositorio automaticamente. Revise caminhos apos auditoria.
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [switch] $SkipPrompt,
  [switch] $IncludeDataRoot
)

$ErrorActionPreference = 'Stop'

# Caminhos identificados na auditoria (atualize se audit-omps-installations-readonly.ps1 mostrar outros).
$Expected = [ordered]@{
  HubInstallRoot      = Join-Path $env:LOCALAPPDATA 'Programs\OMPS'
  HubInstallRootAlt   = Join-Path $env:LOCALAPPDATA 'Programs\omps'
  ServerInstallRoot   = 'C:\OMPS-Teste\ServidorManager'
  DataRoot            = 'C:\ServidorManager'
}

$UninstallRegistry = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\1a40ba34-1121-5f20-b082-468daeed5702',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\64371c84-3239-5852-b556-622891c70961'
)
$AppGuidRegistry = @(
  'HKCU:\Software\1a40ba34-1121-5f20-b082-468daeed5702',
  'HKCU:\Software\64371c84-3239-5852-b556-622891c70961'
)

function Test-HubInstallRoot {
  param([string] $Root)
  if (-not $Root) { return $false }
  $omps = Join-Path $Root 'OMPS.exe'
  $un = Join-Path $Root 'Uninstall OMPS.exe'
  return ((Test-Path -LiteralPath $omps) -and (Test-Path -LiteralPath $un))
}

function Test-ServerInstallRoot {
  param([string] $Root)
  if (-not $Root) { return $false }
  $expected = 'C:\OMPS-Teste\ServidorManager'
  if ($Root.TrimEnd('\') -ine $expected) { return $false }
  $mgr = Join-Path $Root 'ServidorManager.exe'
  $un = Join-Path $Root 'Uninstall ServidorManager.exe'
  return ((Test-Path -LiteralPath $mgr) -or (Test-Path -LiteralPath $un))
}

function Remove-DirIfValidated {
  param(
    [string] $Path,
    [scriptblock] $Validator,
    [string] $Label
  )
  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Host "[skip] $Label - pasta ausente: $Path"
    return
  }
  if (-not (& $Validator $Path)) {
    Write-Warning "[skip] $Label - validacao falhou (caminho inesperado): $Path"
    return
  }
  if ($WhatIfPreference) {
    Write-Host "What if: Remover pasta ($Label): $Path"
    return
  }
  try {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
    Write-Host "[ok] Removido: $Path"
  } catch {
    Write-Warning "[falha] $Label - nao foi possivel remover ${Path}: $($_.Exception.Message)"
    Write-Warning '[falha] Feche OMPS/ServidorManager manualmente e execute o script novamente (processos nao sao encerrados por este script).'
  }
}

function Remove-RegistryKeyIfExists {
  param([string] $KeyPath)
  if (-not (Test-Path -LiteralPath $KeyPath)) {
    Write-Host "[skip] Registro ausente: $KeyPath"
    return
  }
  if ($WhatIfPreference) {
    Write-Host "What if: Remover registro: $KeyPath"
    return
  }
  try {
    Remove-Item -LiteralPath $KeyPath -Recurse -Force -ErrorAction Stop
    Write-Host "[ok] Registro removido: $KeyPath"
  } catch {
    Write-Warning "[falha] Registro ${KeyPath}: $($_.Exception.Message)"
  }
}

Write-Host '=== Remove-OmpsInstallations-Controlled (revisar caminhos) ==='
Write-Host "Hub:    $($Expected.HubInstallRoot)"
Write-Host "Hub alt:$($Expected.HubInstallRootAlt)"
Write-Host "Server: $($Expected.ServerInstallRoot)"
Write-Host "Dados:  $($Expected.DataRoot) (preservado salvo -IncludeDataRoot)"

if (-not $SkipPrompt -and -not $WhatIfPreference) {
  $answer = Read-Host 'Digite REMOVER para continuar (qualquer outra tecla cancela)'
  if ($answer -ne 'REMOVER') {
    Write-Host 'Cancelado.'
    exit 0
  }
}

# Hub: evitar apagar duas vezes se OMPS e omps forem a mesma pasta (case-insensitive).
$hubPaths = @($Expected.HubInstallRoot)
if ($Expected.HubInstallRootAlt -and (Test-Path -LiteralPath $Expected.HubInstallRootAlt)) {
  try {
    $same = [string]::Equals(
      (Get-Item -LiteralPath $Expected.HubInstallRoot).FullName,
      (Get-Item -LiteralPath $Expected.HubInstallRootAlt).FullName,
      [System.StringComparison]::OrdinalIgnoreCase
    )
    if (-not $same) { $hubPaths += $Expected.HubInstallRootAlt }
  } catch {
    $hubPaths += $Expected.HubInstallRootAlt
  }
}

foreach ($p in $hubPaths | Select-Object -Unique) {
  Remove-DirIfValidated -Path $p -Label 'OMPS Hub' -Validator ${function:Test-HubInstallRoot}
}

Remove-DirIfValidated -Path $Expected.ServerInstallRoot -Label 'Servidor OMPS' -Validator ${function:Test-ServerInstallRoot}

foreach ($k in $UninstallRegistry + $AppGuidRegistry) {
  Remove-RegistryKeyIfExists -KeyPath $k
}

if ($IncludeDataRoot) {
  if (-not (Test-Path -LiteralPath $Expected.DataRoot)) {
    Write-Host "[skip] DataRoot ausente: $($Expected.DataRoot)"
  } else {
    Write-Warning "C:\ServidorManager contem systems/logs/config - confirme backup."
    $answer2 = Read-Host 'Digite APAGAR-DADOS para remover C:\ServidorManager'
    if ($answer2 -eq 'APAGAR-DADOS' -and -not $WhatIfPreference) {
      Remove-Item -LiteralPath $Expected.DataRoot -Recurse -Force
      Write-Host '[ok] DataRoot removido.'
    } else {
      Write-Host 'DataRoot preservado.'
    }
  }
} else {
  Write-Host '[info] C:\ServidorManager preservado (use -IncludeDataRoot para opcao de remocao).'
}

Write-Host '=== Fim (remocao manual de atalhos .lnk pode ser necessaria) ==='
Write-Host 'Atalhos conhecidos na auditoria: Desktop Servidor OMPS*.lnk; Start Menu OMPS.lnk / Servidor OMPS.lnk'
