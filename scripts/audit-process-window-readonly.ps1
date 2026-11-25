param([int] $ProcessId)
$p = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
if (-not $p) {
  Write-Host "PID $ProcessId nao existe."
  exit 0
}
$p | Select-Object Id, ProcessName, Path, MainWindowTitle, Responding, StartTime | Format-List
Write-Host "MainWindowHandle: $($p.MainWindowHandle)"
if ($p.MainWindowHandle -eq 0) {
  Write-Host 'Sem janela visivel (possivel dialogo em segundo plano ou processo headless).'
}
