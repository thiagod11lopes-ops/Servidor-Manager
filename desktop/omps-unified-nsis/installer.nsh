; Hub OMPS — app instalado: OMPS.exe; distribuição NSIS: Instalar OMPS.exe (artifactName).
!include "getProcessInfo.nsh"
Var pid

!macro OmpsHubStageStopInPluginsDir
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\omps-hub-stop"
  File "${PROJECT_DIR}\scripts\Stop-OmpsHub-Installed.ps1"
!macroend

; Resolve $R7 = InstallRoot (prefere $INSTDIR durante install com /D=).
!macro OmpsHubResolveInstallRoot
  !define OmpsHubUid "${__COUNTER__}"
  StrCmp "$INSTDIR" "" ompsHubStopUseReg_${OmpsHubUid}
  StrCpy $R7 "$INSTDIR"
  Goto ompsHubStopDone_${OmpsHubUid}
  ompsHubStopUseReg_${OmpsHubUid}:
  ReadRegStr $R6 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  StrCmp $R6 "" ompsHubStopUseDefault_${OmpsHubUid}
  StrCpy $R7 $R6
  Goto ompsHubStopDone_${OmpsHubUid}
  ompsHubStopUseDefault_${OmpsHubUid}:
  ReadEnvStr $R8 "LOCALAPPDATA"
  StrCpy $R7 "$R8\Programs\OMPS"
  ompsHubStopDone_${OmpsHubUid}:
  !undef OmpsHubUid
!macroend

; Encerra hub instalado — NÃO chama InitPluginsDir (preserva $PLUGINSDIR\7z-out durante CopyFiles).
!macro StopOmpsHubForInstallRoot
  !define OmpsHubExecUid "${__COUNTER__}"
  !insertmacro OmpsHubResolveInstallRoot
  IfFileExists "$PLUGINSDIR\omps-hub-stop\Stop-OmpsHub-Installed.ps1" ompsHubStopRun_${OmpsHubExecUid} ompsHubStopSkip_${OmpsHubExecUid}
  ompsHubStopRun_${OmpsHubExecUid}:
  System::Call 'kernel32::GetCurrentProcessId() i.r0'
  DetailPrint "Encerrando OMPS instalado ($R7)..."
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\omps-hub-stop\Stop-OmpsHub-Installed.ps1" -InstallRoot "$R7" -ExcludeProcessId "$0" -InstallerExePath "$EXEPATH" -TargetExePath "$R7\${APP_EXECUTABLE_FILENAME}"'
  Sleep 1000
  ompsHubStopSkip_${OmpsHubExecUid}:
  !undef OmpsHubExecUid
!macroend

!macro customInit
  !ifndef BUILD_UNINSTALLER
    !insertmacro OmpsHubStageStopInPluginsDir
    !insertmacro StopOmpsHubForInstallRoot
  !endif
!macroend

!macro customCheckAppRunning
  !ifdef BUILD_UNINSTALLER
    !insertmacro _CHECK_APP_RUNNING
  !else
    ${GetProcessInfo} 0 $pid $R1 $R2 $R3 $R4
    !insertmacro StopOmpsHubForInstallRoot
  !endif
!macroend

!macro customBeforeCopyInstalledFiles
  !ifndef BUILD_UNINSTALLER
    !insertmacro StopOmpsHubForInstallRoot
  !endif
!macroend
