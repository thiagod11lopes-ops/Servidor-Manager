# Instala (ou reinstala) um sistema via API do local-service.
param(
  [Parameter(Mandatory = $true)]
  [string] $SystemId,
  [Parameter(Mandatory = $true)]
  [string] $SourceUrl,
  [string] $ApiBase = 'http://127.0.0.1:47831'
)

$ErrorActionPreference = 'Stop'

function Invoke-ManagerApi($Method, $Path, $Body) {
  $json = $Body | ConvertTo-Json -Depth 30 -Compress
  Invoke-RestMethod -Method $Method -Uri "$ApiBase$Path" -ContentType 'application/json; charset=utf-8' -Body $json -TimeoutSec 900
}

Write-Host "Analisando $SourceUrl ..."
$analyze = Invoke-ManagerApi POST '/api/v1/projects/analyze' @{ sourceUrl = $SourceUrl }
if (-not $analyze.ok) { throw $analyze.message }

Write-Host "Gerando plano ..."
$planResp = Invoke-ManagerApi POST '/api/v1/projects/installation-plan' @{
  sourceUrl = $SourceUrl
  analysis  = $analyze.result
}
if (-not $planResp.ok) { throw $planResp.message }

Write-Host "Instalando (pode levar vários minutos) ..."
$install = Invoke-ManagerApi POST '/api/v1/projects/install' @{
  systemId         = $SystemId
  sourceUrl        = $SourceUrl
  installationPlan = $planResp.plan
}
if (-not $install.ok) {
  Write-Host $install.message
  if ($install.result.messages) { $install.result.messages | ForEach-Object { Write-Host $_ } }
  throw 'Instalação falhou.'
}

Write-Host "OK: $($install.result.projectDirectory)"
Write-Host "Build: $($install.result.buildStatus)"
