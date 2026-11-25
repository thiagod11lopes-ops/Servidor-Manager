$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $root "scripts\Start-ServidorManager-Browser.ps1"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Servidor Manager (Navegador).lnk"

$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($shortcutPath)
$sc.TargetPath = "powershell.exe"
$sc.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File `"$launcher`""
$sc.WorkingDirectory = $root
$sc.Description = "Servidor Manager via Node + navegador (sem .exe bloqueado pelo SAC)"
$sc.Save()

Write-Host "Atalho criado: $shortcutPath"
