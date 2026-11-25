!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!ifndef BUILD_UNINSTALLER
Var OmpsUsuarioDesktopCheckbox
Var OmpsUsuarioCreateDesktopShortcut
!endif

!macro customInit
  !ifndef BUILD_UNINSTALLER
    StrCpy $OmpsUsuarioCreateDesktopShortcut "1"
    ${StdUtils.GetParameter} $R9 "D" ""
    ${If} $R9 != ""
      Goto ompsUsuarioInstDirDone
    ${EndIf}
    ReadEnvStr $R8 "LOCALAPPDATA"
    StrCpy $INSTDIR "$R8\AcompOPMS"
    ompsUsuarioInstDirDone:
  !endif
!macroend

!ifndef BUILD_UNINSTALLER
!macro customPageAfterChangeDir
  Page custom OmpsUsuarioDesktopShortcutPageCreate OmpsUsuarioDesktopShortcutPageLeave
!macroend

Function OmpsUsuarioDesktopShortcutPageCreate
  StrCpy $OmpsUsuarioCreateDesktopShortcut "1"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 24u "Atalhos do OMPS Usuário"
  Pop $0
  ${NSD_CreateCheckbox} 0 28u 100% 12u "Criar atalho na Área de trabalho (OMPS Usuário.lnk)"
  Pop $OmpsUsuarioDesktopCheckbox
  ${NSD_Check} $OmpsUsuarioDesktopCheckbox
  nsDialogs::Show
FunctionEnd

Function OmpsUsuarioDesktopShortcutPageLeave
  ${NSD_GetState} $OmpsUsuarioDesktopCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $OmpsUsuarioCreateDesktopShortcut "1"
  ${Else}
    StrCpy $OmpsUsuarioCreateDesktopShortcut "0"
  ${EndIf}
FunctionEnd
!endif

!macro customInstall
  !ifndef BUILD_UNINSTALLER
  StrCmp $OmpsUsuarioCreateDesktopShortcut "0" ompsUsuarioPostNoDesktop ompsUsuarioPostDesktop
  ompsUsuarioPostDesktop:
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\omps-usuario-bootstrap\PostInstall-OmpsUsuario.ps1" -InstallRoot "$INSTDIR" -CreateDesktopShortcut 1'
    Goto ompsUsuarioPostDone
  ompsUsuarioPostNoDesktop:
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\omps-usuario-bootstrap\PostInstall-OmpsUsuario.ps1" -InstallRoot "$INSTDIR" -CreateDesktopShortcut 0'
  ompsUsuarioPostDone:
  !endif
!macroend
