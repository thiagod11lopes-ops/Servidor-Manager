' Inicia o Servidor Manager sem janela do PowerShell (WindowStyle 0).
Option Explicit
Dim shell, installRoot, ps1, cmd
Set shell = CreateObject("Wscript.Shell")
installRoot = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\ServidorManager")
ps1 = installRoot & "\resources\manager-launcher\Start-ServidorManager-NoElectron.ps1"
If Not CreateObject("Scripting.FileSystemObject").FileExists(ps1) Then
  installRoot = "C:\Program Files\ServidorManager"
  ps1 = installRoot & "\resources\manager-launcher\Start-ServidorManager-NoElectron.ps1"
End If
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """ -InstallRoot """ & installRoot & """"
shell.Run cmd, 0, False
