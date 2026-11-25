# Encaminha para o bootstrap unificado (Etapa 13).
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $here 'Invoke-ServerBootstrap.ps1') -InstallMissing -LaunchDockerDesktop @args
