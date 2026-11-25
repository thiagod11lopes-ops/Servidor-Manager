; Preserva dados do servidor ao desinstalar o Manager (C:\ServidorManager)
!macro customInstall
  ; Atalho padrao (PowerShell + navegador). Nao remove dados existentes.
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\server-bootstrap\PostInstall-ManagerShortcuts.ps1" -InstallRoot "$INSTDIR"'
!macroend

!macro customUnInstall
  ; Não remove C:\ServidorManager — sistemas, logs e perfis permanecem.
!macroend
