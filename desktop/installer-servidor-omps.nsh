; Servidor OMPS — encerra hub OMPS + Manager antes do taskkill NSIS (_CHECK_APP_RUNNING).
; CHECK_APP_RUNNING roda antes da extração 7z: scripts em $INSTDIR podem não existir (primeira instalação).
!include "getProcessInfo.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
Var pid
!ifndef BUILD_UNINSTALLER
Var OmpsDesktopShortcutCheckbox
Var OmpsCreateDesktopShortcut
!endif

; Scripts embutidos no instalador (extraídos para $PLUGINSDIR na hora do stop).
!macro OmpsStageStopScriptsInPluginsDir
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\omps-stop"
  File "${PROJECT_DIR}\scripts\Stop-ServidorManager-Installed.ps1"
  File "${PROJECT_DIR}\scripts\ManagerLauncherSession.ps1"
!macroend

!macro OmpsStopHubScopedIfInstalled
  SetOutPath "$PLUGINSDIR\omps-stop"
  File "${PROJECT_DIR}\scripts\Stop-OmpsHub-Installed.ps1"
  DetailPrint "Encerrando hub OMPS instalado (se houver)..."
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\omps-stop\Stop-OmpsHub-Installed.ps1"'
  Sleep 400
!macroend

!macro StopServidorOmpsForInstallRoot
  !insertmacro OmpsStageStopScriptsInPluginsDir
  !insertmacro OmpsStopHubScopedIfInstalled

  ReadRegStr $R6 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation

  ; Instalação anterior (registro)
  StrCmp $R6 "" ompsStopSkipRegTree
  IfFileExists "$R6\resources\server-bootstrap\Stop-ServidorManager-Installed.ps1" 0 ompsStopRegLauncher
    DetailPrint "Encerrando Servidor OMPS em execução ($R6)..."
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$R6\resources\server-bootstrap\Stop-ServidorManager-Installed.ps1" -InstallRoot "$R6"'
    Goto ompsStopRegAfter
  ompsStopRegLauncher:
  IfFileExists "$R6\resources\manager-launcher\Stop-ServidorManager-Installed.ps1" 0 ompsStopRegBundled
    DetailPrint "Encerrando Servidor OMPS em execução ($R6)..."
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$R6\resources\manager-launcher\Stop-ServidorManager-Installed.ps1" -InstallRoot "$R6"'
    Goto ompsStopRegAfter
  ompsStopRegBundled:
  StrCmp $R6 "" ompsStopSkipRegTree
    DetailPrint "Encerrando Servidor OMPS em execução ($R6)..."
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\omps-stop\Stop-ServidorManager-Installed.ps1" -InstallRoot "$R6"'
  ompsStopRegAfter:
  Sleep 600
  ompsStopSkipRegTree:

  ; Destino escolhido nesta execução
  IfFileExists "$INSTDIR\resources\server-bootstrap\Stop-ServidorManager-Installed.ps1" 0 ompsStopInstLauncher
    DetailPrint "Encerrando Servidor OMPS em execução ($INSTDIR)..."
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\server-bootstrap\Stop-ServidorManager-Installed.ps1" -InstallRoot "$INSTDIR"'
    Goto ompsStopInstAfter
  ompsStopInstLauncher:
  IfFileExists "$INSTDIR\resources\manager-launcher\Stop-ServidorManager-Installed.ps1" 0 ompsStopInstBundled
    DetailPrint "Encerrando Servidor OMPS em execução ($INSTDIR)..."
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\manager-launcher\Stop-ServidorManager-Installed.ps1" -InstallRoot "$INSTDIR"'
    Goto ompsStopInstAfter
  ompsStopInstBundled:
  StrCmp "$INSTDIR" "" ompsStopSkipInstTree
    DetailPrint "Encerrando Servidor OMPS em execução ($INSTDIR)..."
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\omps-stop\Stop-ServidorManager-Installed.ps1" -InstallRoot "$INSTDIR"'
  ompsStopInstAfter:
  Sleep 600
  ompsStopSkipInstTree:

  ReadEnvStr $R8 "LOCALAPPDATA"
  StrCpy $R9 "$R8\Programs\ServidorManager"
  StrCmp $R9 "$INSTDIR" ompsStopDone
  StrCmp $R9 "$R6" ompsStopDone
  IfFileExists "$R9\resources\server-bootstrap\Stop-ServidorManager-Installed.ps1" 0 ompsStopDefaultLauncher
    DetailPrint "Encerrando Servidor OMPS em execução ($R9)..."
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$R9\resources\server-bootstrap\Stop-ServidorManager-Installed.ps1" -InstallRoot "$R9"'
    Goto ompsStopDefaultAfter
  ompsStopDefaultLauncher:
  IfFileExists "$R9\resources\manager-launcher\Stop-ServidorManager-Installed.ps1" 0 ompsStopDefaultBundled
    DetailPrint "Encerrando Servidor OMPS em execução ($R9)..."
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$R9\resources\manager-launcher\Stop-ServidorManager-Installed.ps1" -InstallRoot "$R9"'
    Goto ompsStopDefaultAfter
  ompsStopDefaultBundled:
    DetailPrint "Encerrando Servidor OMPS em execução ($R9)..."
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\omps-stop\Stop-ServidorManager-Installed.ps1" -InstallRoot "$R9"'
  ompsStopDefaultAfter:
  Sleep 600
  ompsStopDone:
!macroend

; Após initMultiUser: registry InstallLocation pode apontar pasta órfã (ex. teste /S /D= cancelado).
; Não altera registro — só redefine $INSTDIR nesta sessão. /D= na linha de comando tem prioridade.
!macro customInit
  !ifndef BUILD_UNINSTALLER
    StrCpy $OmpsCreateDesktopShortcut "1"
    ${StdUtils.GetParameter} $R9 "D" ""
    ${If} $R9 != ""
      Goto ompsInstDirInitDone
    ${EndIf}
    IfFileExists "$INSTDIR\${PRODUCT_FILENAME}.exe" ompsInstDirInitDone
    IfFileExists "$INSTDIR\Uninstall ${PRODUCT_FILENAME}.exe" ompsInstDirInitDone
    ReadEnvStr $R8 "LOCALAPPDATA"
    StrCpy $INSTDIR "$R8\Programs\${APP_FILENAME}"
    ompsInstDirInitDone:
  !endif
!macroend

!macro customCheckAppRunning
  !ifndef BUILD_UNINSTALLER
    !insertmacro StopServidorOmpsForInstallRoot
  !endif
  !insertmacro _CHECK_APP_RUNNING
!macroend

!ifndef BUILD_UNINSTALLER
!macro customPageAfterChangeDir
  Page custom OmpsDesktopShortcutPageCreate OmpsDesktopShortcutPageLeave
!macroend

Function OmpsDesktopShortcutPageCreate
  StrCpy $OmpsCreateDesktopShortcut "1"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 24u "Atalhos do Servidor OMPS"
  Pop $0
  ${NSD_CreateCheckbox} 0 28u 100% 12u "Criar atalho na Área de trabalho (Servidor OMPS.lnk)"
  Pop $OmpsDesktopShortcutCheckbox
  ${NSD_Check} $OmpsDesktopShortcutCheckbox
  nsDialogs::Show
FunctionEnd

Function OmpsDesktopShortcutPageLeave
  ${NSD_GetState} $OmpsDesktopShortcutCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $OmpsCreateDesktopShortcut "1"
  ${Else}
    StrCpy $OmpsCreateDesktopShortcut "0"
  ${EndIf}
FunctionEnd
!endif

!macro customInstall
  !ifndef BUILD_UNINSTALLER
  ; Silencioso (/S): página omitida — padrão = criar atalho (valor diferente de "0").
  StrCmp $OmpsCreateDesktopShortcut "0" ompsPostInstallNoDesktop ompsPostInstallDesktop
  ompsPostInstallDesktop:
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\server-bootstrap\PostInstall-ServidorOmpsShortcuts.ps1" -InstallRoot "$INSTDIR" -CreateDesktopShortcut 1'
    Goto ompsPostInstallDone
  ompsPostInstallNoDesktop:
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\server-bootstrap\PostInstall-ServidorOmpsShortcuts.ps1" -InstallRoot "$INSTDIR" -CreateDesktopShortcut 0'
  ompsPostInstallDone:
  !endif
!macroend

!macro customUnInstall
  ; Não remove C:\ServidorManager — sistemas, logs e perfis permanecem.
  IfFileExists "$INSTDIR\resources\server-bootstrap\Remove-ServidorOmpsShortcuts.ps1" 0 ompsUninstallShortcutsDone
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\server-bootstrap\Remove-ServidorOmpsShortcuts.ps1" -InstallRoot "$INSTDIR"'
  ompsUninstallShortcutsDone:
!macroend
