# Remove atalhos desktop do Servidor OMPS que apontam para este InstallRoot (desinstalação / substituição).
param(
  [Parameter(Mandatory = $true)]
  [string] $InstallRoot
)
$ErrorActionPreference = 'SilentlyContinue'

$normalized = $InstallRoot.TrimEnd('\')
if (-not (Test-Path (Join-Path $normalized 'ServidorManager.exe'))) {
  # Instalação já parcialmente removida — ainda tentamos limpar atalhos órfãos pelo nome + alvo.
}

$ompsShortcutNames = @(
  'Servidor OMPS.lnk',
  'Servidor OMPS (Electron).lnk',
  'Servidor OMPS (navegador).lnk'
)

$legacyNamesIfSameRoot = @(
  'Servidor Manager.lnk',
  'Servidor Manager (Electron).lnk',
  'Servidor Manager (Navegador).lnk'
)

function Test-ShortcutReferencesInstallRoot {
  param([string] $ShortcutPath, [string] $Root)
  if (-not (Test-Path -LiteralPath $ShortcutPath)) { return $false }
  try {
    $wsh = New-Object -ComObject WScript.Shell
    $sc = $wsh.CreateShortcut($ShortcutPath)
    $target = if ($sc.TargetPath) { $sc.TargetPath } else { '' }
    $args = if ($sc.Arguments) { $sc.Arguments } else { '' }
    $work = if ($sc.WorkingDirectory) { $sc.WorkingDirectory } else { '' }
    $r = $Root.TrimEnd('\')
    if ($target -like "$r*") { return $true }
    if ($work -like "$r*") { return $true }
    if ($args -like "*$r*") { return $true }
    $managerExe = Join-Path $r 'ServidorManager.exe'
    if ($target -ieq $managerExe) { return $true }
    return $false
  } catch {
    return $false
  }
}

$desktop = [Environment]::GetFolderPath('Desktop')
if (-not (Test-Path $desktop)) { exit 0 }

foreach ($name in ($ompsShortcutNames + $legacyNamesIfSameRoot)) {
  $path = Join-Path $desktop $name
  if (-not (Test-ShortcutReferencesInstallRoot -ShortcutPath $path -Root $normalized)) { continue }
  Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
  Write-Host "Atalho removido (OMPS): $path"
}

exit 0
