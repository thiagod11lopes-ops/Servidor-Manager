@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "RESOLVE_PS=%SCRIPT_DIR%Resolve-ManagerInstallRoot.ps1"
if not exist "%RESOLVE_PS%" set "RESOLVE_PS=%SCRIPT_DIR%..\server-bootstrap\Resolve-ManagerInstallRoot.ps1"

set "ROOT="
if exist "%RESOLVE_PS%" (
  for /f "usebackq delims=" %%R in (`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%RESOLVE_PS%"`) do set "ROOT=%%R"
)

if not defined ROOT set "ROOT=%LOCALAPPDATA%\Programs\ServidorManager"
if not exist "%ROOT%\resources\manager-launcher\Start-ServidorManager-NoElectron.ps1" (
  if exist "C:\Program Files\ServidorManager\resources\manager-launcher\Start-ServidorManager-NoElectron.ps1" (
    set "ROOT=C:\Program Files\ServidorManager"
  )
)

start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%ROOT%\resources\manager-launcher\Start-ServidorManager-NoElectron.ps1" -InstallRoot "%ROOT%"
exit /b 0
