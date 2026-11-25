# Funções compartilhadas por start-servidor-lan.ps1 (Caddy no Windows).

function Normalize-PathForMatch {
  param([Parameter(Mandatory = $true)][string]$Path)
  try {
    $resolved = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
  } catch {
    $resolved = $Path
  }
  return $resolved.Replace('\', '/').TrimEnd('/').ToLowerInvariant()
}

function Test-CommandLineReferencesConfig {
  param(
    [string]$CommandLine,
    [string]$ConfigPath,
  )
  if (-not $CommandLine) { return $false }
  $needle = Normalize-PathForMatch -Path $ConfigPath
  $hay = $CommandLine.Replace('\', '/').ToLowerInvariant()
  return $hay.Contains($needle)
}

function Get-CaddyProcessForConfig {
  param([Parameter(Mandatory = $true)][string]$ConfigPath)
  foreach ($item in @(Get-CimInstance Win32_Process -Filter "Name = 'caddy.exe'" -ErrorAction SilentlyContinue)) {
    if (-not (Test-CommandLineReferencesConfig -CommandLine $item.CommandLine -ConfigPath $ConfigPath)) { continue }
    $proc = Get-Process -Id ([int]$item.ProcessId) -ErrorAction SilentlyContinue
    if (-not $proc) { continue }
    try { $proc.Refresh() } catch { }
    if (-not $proc.HasExited) { return $proc }
  }
  return $null
}

function Test-LocalHttpPath {
  param(
    [int]$Port,
    [string]$Path = '/',
  )
  $pathNorm = if ($Path.StartsWith('/')) { $Path } else { "/$Path" }
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:${Port}${pathNorm}" -UseBasicParsing -TimeoutSec 5
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Test-LocalHttpUp {
  param([int]$Port)
  return (Test-LocalHttpPath -Port $Port -Path '/')
}

function Invoke-CaddyValidate {
  param(
    [Parameter(Mandatory = $true)][string]$CaddyExe,
    [Parameter(Mandatory = $true)][string]$ConfigPath,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
  )
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $PSNativeCommandUseErrorActionPreference = $false
  $validateOut = @()
  try {
    Push-Location $WorkingDirectory
    $validateOut = @(& $CaddyExe validate --config $ConfigPath --adapter caddyfile 2>&1)
    $code = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
    if ($code -ne 0) {
      $detail = ($validateOut | ForEach-Object { "$_" }) -join "`n"
      throw "Caddy validate falhou (codigo $code).`n$detail"
    }
  } finally {
    Pop-Location
    $ErrorActionPreference = $previous
  }
}

function Start-CaddyLanProcess {
  param(
    [Parameter(Mandatory = $true)][string]$CaddyExe,
    [Parameter(Mandatory = $true)][string]$ConfigPath,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string]$StdoutLog,
    [Parameter(Mandatory = $true)][string]$StderrLog,
  )
  foreach ($logPath in @($StdoutLog, $StderrLog)) {
    $logDir = Split-Path -Parent $logPath
    if (-not (Test-Path $logDir)) {
      New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
  }
  # Start-Process com redirecionamento para arquivo evita pipes heredados (Manager aguardaria fim da fase).
  return Start-Process -FilePath $CaddyExe `
    -ArgumentList @('run', '--config', $ConfigPath, '--adapter', 'caddyfile') `
    -WorkingDirectory $WorkingDirectory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $StdoutLog `
    -RedirectStandardError $StderrLog `
    -PassThru
}

function Get-CaddyLogTail {
  param(
    [string]$StderrLog,
    [string]$StdoutLog,
    [int]$Lines = 24,
  )
  $parts = @()
  foreach ($pair in @(@('stderr', $StderrLog), @('stdout', $StdoutLog))) {
    $label = $pair[0]
    $file = $pair[1]
    if (-not (Test-Path $file)) { continue }
    $tail = (Get-Content -Path $file -Tail $Lines -ErrorAction SilentlyContinue) -join "`n"
    if ($tail) { $parts += "[$label]`n$tail" }
  }
  return ($parts -join "`n`n")
}

function Wait-CaddyLanReady {
  param(
    [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
    [int]$HttpPort,
    [string]$StderrLog,
    [string]$StdoutLog,
    [int]$MaxWaitSec = 60,
  )
  $deadline = (Get-Date).AddSeconds($MaxWaitSec)
  while ((Get-Date) -lt $deadline) {
    try { $Process.Refresh() } catch { }
    if ($Process.HasExited) {
      $codeText = 'indisponivel'
      try {
        if ($null -ne $Process.ExitCode) { $codeText = [string]$Process.ExitCode }
      } catch { }
      $logs = Get-CaddyLogTail -StderrLog $StderrLog -StdoutLog $StdoutLog
      throw "Caddy encerrou (codigo $codeText). Veja $StderrLog e $StdoutLog`n$logs"
    }
    if ((Test-LocalHttpUp -Port $HttpPort) -and (Test-LocalHttpPath -Port $HttpPort -Path '/login')) {
      return
    }
    Start-Sleep -Milliseconds 500
  }
  $logs = Get-CaddyLogTail -StderrLog $StderrLog -StdoutLog $StdoutLog
  try { Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue } catch { }
  throw "Caddy (PID $($Process.Id)) nao ficou acessivel em http://127.0.0.1:${HttpPort}/login dentro de ${MaxWaitSec}s.`n$logs"
}
