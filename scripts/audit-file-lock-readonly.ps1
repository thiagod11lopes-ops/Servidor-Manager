param([Parameter(Mandatory = $true)][string] $Path)
$ErrorActionPreference = 'SilentlyContinue'
Write-Host "Alvo: $Path"
if (-not (Test-Path -LiteralPath $Path)) { Write-Host 'Arquivo ausente.'; exit 0 }
Get-CimInstance Win32_Process | Where-Object {
  $_.ExecutablePath -and ($_.ExecutablePath -like '*OMPS-Teste*' -or $_.ExecutablePath -like '*ServidorManager*' -or $_.ExecutablePath -like '*Programs\OMPS*')
} | ForEach-Object {
  Write-Host "Processo: PID=$($_.ProcessId) Name=$($_.Name) Path=$($_.ExecutablePath)"
}
$cmd = $_.CommandLine
Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and ($_.CommandLine -like '*OMPS-Teste*' -or $_.CommandLine -like '*Uninstall ServidorManager*')
} | ForEach-Object {
  Write-Host "CommandLine match: PID=$($_.ProcessId) Name=$($_.Name)"
}
