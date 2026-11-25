# Inicia Caddy para servir frontend/dist na LAN (Windows). Supabase deve estar em execução.
$ErrorActionPreference = 'Stop'
$LanDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Resolve-Path (Join-Path $LanDir '..\..')
$EnvFile = Join-Path $LanDir 'servidor.env'
$PidFile = Join-Path $LanDir 'caddy.pid'
$StdoutLog = Join-Path $LanDir 'caddy.stdout.log'
$StderrLog = Join-Path $LanDir 'caddy.stderr.log'

. (Join-Path $LanDir 'lib\start-caddy-windows.ps1')

if (-not (Test-Path $EnvFile)) {
  Copy-Item (Join-Path $LanDir 'servidor.env.example') $EnvFile
}

if (-not (Test-Path (Join-Path $Root 'frontend\dist\index.html'))) {
  throw 'Rode build-producao-lan.ps1 antes.'
}

function Get-ConfiguredHttpPort {
  $port = 8080
  if (-not (Test-Path $EnvFile)) { return $port }
  foreach ($line in (Get-Content -Path $EnvFile -ErrorAction SilentlyContinue)) {
    if ($line -match '^\s*ACOMOPMS_HTTP_PORT\s*=\s*(\d+)\s*$') { $port = [int]$Matches[1] }
  }
  return $port
}

function Get-ListeningProcess {
  param([int]$Port)
  $conn = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) | Select-Object -First 1
  if (-not $conn) { return $null }
  return Get-CimInstance Win32_Process -Filter ("ProcessId = " + $conn.OwningProcess) -ErrorAction SilentlyContinue
}

$config = Join-Path $LanDir 'Caddyfile.generated'
$httpPort = Get-ConfiguredHttpPort
$existingCaddy = Get-CaddyProcessForConfig -ConfigPath $config
if ($existingCaddy) {
  if ((Test-LocalHttpUp -Port $httpPort) -and (Test-LocalHttpPath -Port $httpPort -Path '/login')) {
    $existingCaddy.Id | Set-Content -Path $PidFile -Encoding ascii
    node (Join-Path $LanDir 'lib\ensure-edge-runtime.mjs') $Root
    if ($LASTEXITCODE -ne 0) { throw 'Edge runtime do Supabase nao ficou em execucao.' }
    node (Join-Path $LanDir 'lib\ensure-kong-loopback.mjs') $Root
    if ($LASTEXITCODE -ne 0) { throw 'Kong nao respondeu em 127.0.0.1:54321.' }
    Push-Location $LanDir
    node --input-type=module -e "import { loadServidorEnv } from './lib/load-servidor-env.mjs'; const c = loadServidorEnv(); console.log('[servidor-lan] Caddy desta instalacao ja em execucao. UI:', c.publicOrigin)"
    Pop-Location
    Write-Host "[servidor-lan] Caddy reutilizado. PID $($existingCaddy.Id)"
    exit 0
  }
  Stop-Process -Id $existingCaddy.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
}

function Invoke-SupabaseCli {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CliArgs)
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $PSNativeCommandUseErrorActionPreference = $false
  try {
    & supabase @CliArgs *>&1 | Out-Null
    if ($null -eq $LASTEXITCODE) { throw 'supabase CLI nao retornou codigo de saida' }
    return [int]$LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
}

$bootstrapDone = ($env:ACOMOPMS_SUPABASE_BOOTSTRAP_DONE -eq '1')

if ($bootstrapDone) {
  node (Join-Path $LanDir 'lib\ensure-edge-runtime.mjs') $Root
  if ($LASTEXITCODE -ne 0) { throw 'Edge runtime do Supabase nao ficou em execucao.' }
  node (Join-Path $LanDir 'lib\ensure-kong-loopback.mjs') $Root
  if ($LASTEXITCODE -ne 0) { throw 'Kong nao respondeu em 127.0.0.1:54321.' }
} else {
  . (Join-Path $LanDir 'lib\supabase-loopback-network.ps1')
  $loopbackNet = Get-AcompSupabaseLoopbackNetwork -LanDir $LanDir

  Push-Location $Root
  try {
    $statusCode = Invoke-SupabaseCli status
    if ($statusCode -ne 0) {
      $startCode = Invoke-SupabaseCli start --network-id $loopbackNet
      if ($startCode -ne 0) {
        throw "supabase start falhou (codigo $startCode)"
      }
    }
    node (Join-Path $LanDir 'lib\ensure-edge-runtime.mjs') $Root
    if ($LASTEXITCODE -ne 0) { throw 'Edge runtime do Supabase nao ficou em execucao.' }
    node (Join-Path $LanDir 'lib\ensure-kong-loopback.mjs') $Root
    if ($LASTEXITCODE -ne 0) { throw 'Kong nao respondeu em 127.0.0.1:54321.' }
  } finally {
    Pop-Location
  }
}

node (Join-Path $LanDir 'generate-caddyfile.mjs')
node (Join-Path $LanDir 'gerar-server-connection.mjs')
$caddy = Get-Command caddy -ErrorAction SilentlyContinue
if (-not $caddy) { throw 'Instale Caddy e coloque caddy.exe no PATH.' }

$config = Join-Path $LanDir 'Caddyfile.generated'
if (-not (Test-Path -LiteralPath $config)) {
  throw "Caddyfile.generated ausente apos generate-caddyfile.mjs ($config)"
}

$httpPort = Get-ConfiguredHttpPort
$listener = Get-ListeningProcess -Port $httpPort
if ($listener -and -not (Test-CommandLineReferencesConfig -CommandLine $listener.CommandLine -ConfigPath $config)) {
  throw "A porta $httpPort ja esta em uso pelo processo $($listener.ProcessId) ($($listener.Name)). Este script nao encerra processos de outra instalacao."
}
$adminListener = Get-ListeningProcess -Port 2019
if ($adminListener -and -not (Test-CommandLineReferencesConfig -CommandLine $adminListener.CommandLine -ConfigPath $config)) {
  throw "A porta administrativa 2019 ja esta em uso pelo processo $($adminListener.ProcessId) ($($adminListener.Name)). Este script nao encerra processos de outra instalacao."
}

Invoke-CaddyValidate -CaddyExe $caddy.Source -ConfigPath $config -WorkingDirectory $LanDir

$p = Start-CaddyLanProcess `
  -CaddyExe $caddy.Source `
  -ConfigPath $config `
  -WorkingDirectory $LanDir `
  -StdoutLog $StdoutLog `
  -StderrLog $StderrLog

Wait-CaddyLanReady -Process $p -HttpPort $httpPort -StderrLog $StderrLog -StdoutLog $StdoutLog -MaxWaitSec 60

$p.Id | Set-Content -Path $PidFile -Encoding ascii

Push-Location $LanDir
node --input-type=module -e "import { loadServidorEnv } from './lib/load-servidor-env.mjs'; const c = loadServidorEnv(); console.log('[servidor-lan] UI LAN:', c.publicOrigin)"
if ($LASTEXITCODE -ne 0) { throw 'Falha ao ler a origem publica do servidor.env' }
Pop-Location
Write-Host "[servidor-lan] Caddy em execucao. PID $($p.Id)"
Write-Host "[servidor-lan] Log stdout: $StdoutLog"
Write-Host "[servidor-lan] Log stderr: $StderrLog"
