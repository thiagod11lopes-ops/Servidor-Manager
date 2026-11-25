# Área de trabalho do usuário que iniciou a instalação (não a do admin elevado, quando possível).
function Get-OmpsUserDesktopDirectory {
  $candidates = @()
  if ($env:USERPROFILE) {
    $candidates += (Join-Path $env:USERPROFILE 'Desktop')
    $candidates += (Join-Path $env:USERPROFILE 'Área de Trabalho')
  }
  if ($env:OneDrive) {
    $candidates += (Join-Path $env:OneDrive 'Desktop')
    $candidates += (Join-Path $env:OneDrive 'Área de Trabalho')
  }
  try {
    $candidates += [Environment]::GetFolderPath('Desktop')
  } catch {
    # ignore
  }

  foreach ($dir in ($candidates | Select-Object -Unique)) {
    if ([string]::IsNullOrWhiteSpace($dir)) { continue }
    if (Test-Path -LiteralPath $dir) {
      return $dir
    }
  }

  if ($env:USERPROFILE) {
    $fallback = Join-Path $env:USERPROFILE 'Desktop'
    try {
      New-Item -ItemType Directory -Path $fallback -Force | Out-Null
      return $fallback
    } catch {
      throw "Não foi possível resolver ou criar a pasta Desktop do usuário ($fallback): $($_.Exception.Message)"
    }
  }

  throw 'Não foi possível resolver a Área de trabalho do usuário (USERPROFILE ausente).'
}
