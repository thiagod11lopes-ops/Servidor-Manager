# Atualiza o Servidor Manager a partir de release\win-unpacked:
# - %LOCALAPPDATA%\Programs\ServidorManager (padrão, sem admin)
# - C:\Program Files\ServidorManager (se existir — instalação NSIS antiga)
# - Atalhos "Servidor Manager.lnk" na área de trabalho
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'release\win-unpacked'
$destLocal = Join-Path $env:LOCALAPPDATA 'Programs\ServidorManager'
$destProgramFiles = 'C:\Program Files\ServidorManager'

$sessionScript = Join-Path $PSScriptRoot 'ManagerLauncherSession.ps1'
. $sessionScript

$stopScript = Join-Path $PSScriptRoot 'Stop-ServidorManager-Installed.ps1'
$signatureScript = Join-Path $PSScriptRoot 'Test-ManagerWindowsReleaseSignature.ps1'

function Invoke-ControlledManagerShutdown {
  param(
    [Parameter(Mandatory = $true)]
    [string] $InstallRoot
  )

  if (-not (Test-Path -LiteralPath $InstallRoot)) {
    return
  }

  Write-Host "Encerrando Manager instalado em: $InstallRoot"
  & $stopScript -InstallRoot $InstallRoot
  Stop-ServidorManagerExecutableForInstallRoot -InstallRoot $InstallRoot
  Stop-ManagerElectronWorkersForInstallRoot -InstallRoot $InstallRoot
  Start-Sleep -Seconds 2
  Assert-InstallRootQuiescentForUpdate -InstallRoot $InstallRoot
}

function Test-UiDistStale {
  param([string] $DistIndex, [string] $WinUnpackedRoot)

  $packagedUiIndex = Join-Path $WinUnpackedRoot 'resources\ui-dist\index.html'
  if (-not (Test-Path -LiteralPath $packagedUiIndex) -or -not (Test-Path -LiteralPath $DistIndex)) {
    return $true
  }
  try {
    $distHtml = Get-Content -LiteralPath $DistIndex -Raw -ErrorAction Stop
    $packHtml = Get-Content -LiteralPath $packagedUiIndex -Raw -ErrorAction Stop
    return $distHtml.Trim() -ne $packHtml.Trim()
  } catch {
    return $true
  }
}

function Test-LocalServiceStale {
  param([string] $WinUnpackedRoot)

  $distService = Join-Path $root 'dist-local-service\local-service.cjs'
  $packService = Join-Path $WinUnpackedRoot 'resources\local-service\local-service.cjs'
  if (-not (Test-Path -LiteralPath $distService) -or -not (Test-Path -LiteralPath $packService)) {
    return $true
  }
  return (Get-Item -LiteralPath $distService).LastWriteTimeUtc -gt (Get-Item -LiteralPath $packService).LastWriteTimeUtc
}

function Test-ElectronShellStale {
  param([string] $WinUnpackedRoot)

  $asarPath = Join-Path $WinUnpackedRoot 'resources\app.asar'
  if (-not (Test-Path -LiteralPath $asarPath)) {
    return $true
  }

  $preloadInRepo = Join-Path $root 'desktop\preload.cjs'
  if (Test-Path -LiteralPath $preloadInRepo) {
    $asarList = & npx --yes asar list $asarPath 2>$null
    if ($asarList -notmatch '\\desktop\\preload\.cjs') {
      return $true
    }
  }

  return $false
}

function Get-ReleaseRefreshPlan {
  param([string] $DistIndex, [string] $WinUnpackedRoot)

  if (-not (Test-Path -LiteralPath $WinUnpackedRoot)) {
    return 'FullPack'
  }
  if (Test-ElectronShellStale -WinUnpackedRoot $WinUnpackedRoot) {
    return 'FullPack'
  }
  # UI (dist) divergente exige repack: Electron carrega dist/ de dentro do app.asar.
  if (Test-UiDistStale -DistIndex $DistIndex -WinUnpackedRoot $WinUnpackedRoot) {
    return 'FullPack'
  }
  if (Test-LocalServiceStale -WinUnpackedRoot $WinUnpackedRoot) {
    return 'ResourceOnly'
  }
  return 'UpToDate'
}

function Ensure-ReleaseWinUnpacked {
  $distIndex = Join-Path $root 'dist\index.html'
  $needsBuild = -not (Test-Path -LiteralPath $distIndex)
  $plan = if ($needsBuild) { 'FullPack' } else { Get-ReleaseRefreshPlan -DistIndex $distIndex -WinUnpackedRoot $src }

  if ($needsBuild) {
    Write-Host 'Build ausente (dist/index.html). Rodando npm run build ...'
    Push-Location $root
    try {
      npm run build
    } finally {
      Pop-Location
    }
    $plan = Get-ReleaseRefreshPlan -DistIndex $distIndex -WinUnpackedRoot $src
  }

  switch ($plan) {
    'FullPack' {
      Write-Host 'Remontando release\win-unpacked (npm run package:dir — shell Electron + asar) ...'
      Push-Location $root
      try {
        npm run package:dir
      } finally {
        Pop-Location
      }
    }
    'ResourceOnly' {
      Write-Host 'Atualizando dist/ e dist-local-service/ sem remontar ServidorManager.exe (somente recursos) ...'
      Push-Location $root
      try {
        npm run build
      } finally {
        Pop-Location
      }
    }
    'UpToDate' {
      Write-Host 'release\win-unpacked já reflete o build atual.'
    }
  }

  if (-not (Test-Path -LiteralPath $src)) {
    throw "Pasta não encontrada: $src (falha ao montar win-unpacked; tente npm run package:dir manualmente)"
  }

  return $plan
}

function Sync-ManagerResourcesFromBuild {
  param([string] $Destination)

  $resources = Join-Path $Destination 'resources'
  if (-not (Test-Path -LiteralPath $resources)) {
    throw "Instalação incompleta (sem resources): $Destination"
  }

  $uiDest = Join-Path $resources 'ui-dist'
  $serviceDest = Join-Path $resources 'local-service'
  $uiSrc = Join-Path $root 'dist'
  $serviceSrc = Join-Path $root 'dist-local-service'

  Write-Host "Sincronizando recursos (UI + local-service) em $Destination ..."
  New-Item -ItemType Directory -Force -Path $uiDest, $serviceDest | Out-Null
  robocopy $uiSrc $uiDest /MIR /R:2 /W:3 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy ui-dist falhou ($LASTEXITCODE)" }
  robocopy $serviceSrc $serviceDest /MIR /R:2 /W:3 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy local-service falhou ($LASTEXITCODE)" }
}

function Sync-ManagerTree {
  param([string] $Destination)
  Write-Host "Copiando pacote completo para $Destination ..."
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  robocopy $src $Destination /MIR /R:2 /W:3 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy falhou ($LASTEXITCODE) em $Destination" }
}

function Write-ReleaseSignatureReport {
  param([string] $ReleaseExe)

  if (-not (Test-Path -LiteralPath $ReleaseExe)) {
    Write-Warning "ServidorManager.exe ausente em release: $ReleaseExe"
    return
  }

  & $signatureScript -ExePath $ReleaseExe
  $sigExit = $LASTEXITCODE
  if ($sigExit -ne 0) {
    Write-Warning @"
ServidorManager.exe em release NÃO possui assinatura Authenticode válida (Status NotSigned ou inválido).
- Atalho principal ""Servidor Manager"": Node + http://127.0.0.1:5199 (não usa este .exe).
- Atalho ""Servidor Manager (Electron)"": pode ser bloqueado pelo Smart App Control até certificado OV/EV.
Documentação: docs/WINDOWS-CODE-SIGNING.md e docs/WINDOWS-SMART-APP-CONTROL.md
"@
    if ($env:SERVIDOR_MANAGER_REQUIRE_SIGNED_EXE -eq '1') {
      throw 'SERVIDOR_MANAGER_REQUIRE_SIGNED_EXE=1 exige assinatura válida antes da cópia.'
    }
  }
}

function Assert-InstalledExeMatchesRelease {
  param([string] $InstallRoot)

  $installedExe = Join-Path $InstallRoot 'ServidorManager.exe'
  $releaseExe = Join-Path $src 'ServidorManager.exe'
  if (-not (Test-Path -LiteralPath $installedExe) -or -not (Test-Path -LiteralPath $releaseExe)) {
    return
  }
  $installedHash = (Get-FileHash -LiteralPath $installedExe -Algorithm SHA256).Hash
  $releaseHash = (Get-FileHash -LiteralPath $releaseExe -Algorithm SHA256).Hash
  if ($installedHash -ne $releaseHash) {
    throw "Divergência pós-cópia: SHA256 instalado ($installedHash) != release ($releaseHash)."
  }
}

$refreshPlan = Ensure-ReleaseWinUnpacked
$releaseExe = Join-Path $src 'ServidorManager.exe'
Write-ReleaseSignatureReport -ReleaseExe $releaseExe

$installTargets = @($destLocal)
if (Test-Path -LiteralPath $destProgramFiles) {
  $installTargets += $destProgramFiles
}

foreach ($target in $installTargets) {
  try {
    Invoke-ControlledManagerShutdown -InstallRoot $target
  } catch {
    Write-Error $_.Exception.Message
    exit 1
  }
}

foreach ($target in $installTargets) {
  try {
    if ($refreshPlan -eq 'ResourceOnly' -and (Test-Path -LiteralPath $target)) {
      Sync-ManagerResourcesFromBuild -Destination $target
    } else {
      Sync-ManagerTree -Destination $target
      Assert-InstalledExeMatchesRelease -InstallRoot $target
    }
  } catch {
    if ($target -eq $destProgramFiles) {
      Write-Warning "Não foi possível atualizar Program Files (execute como Administrador): $($_.Exception.Message)"
    } else {
      throw
    }
  }
}

if ((Test-Path -LiteralPath $destProgramFiles) -and $refreshPlan -ne 'ResourceOnly') {
  Write-Host 'Instalação em Program Files também atualizada.'
}

& (Join-Path $PSScriptRoot 'Create-DesktopShortcut-Manager.ps1')

Write-Host 'Manager atualizado. Feche todas as janelas do Manager e abra de novo pelo atalho Servidor Manager.'
