# Servidor Manager sem ServidorManager.exe (útil quando o Smart App Control bloqueia o Electron).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path "$root\dist\index.html")) {
  Write-Host "Execute antes: npm run build"
  exit 1
}

$serviceDir = Join-Path $root "dist-local-service"
$hostScript = Join-Path $serviceDir "service-host.cjs"
$serviceEntry = Join-Path $serviceDir "local-service.cjs"

$env:NODE_ENV = "production"
$env:SM_SERVICE_HOST_SCRIPT = $hostScript
$env:SM_NODE_PATH = (Get-Command node).Source

$service = Start-Process -FilePath "node" -ArgumentList @($serviceEntry) -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2

Write-Host "local-service PID $($service.Id) — http://127.0.0.1:47831"
Write-Host "UI do Manager: http://127.0.0.1:5199 (porta 5173 fica livre para apps instalados)"

Push-Location $root
try {
  npx vite preview --host 0.0.0.0 --port 5199
} finally {
  Pop-Location
  if (-not $service.HasExited) {
    Stop-Process -Id $service.Id -Force -ErrorAction SilentlyContinue
  }
}
