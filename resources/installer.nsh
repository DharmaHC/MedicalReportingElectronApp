; Custom NSIS installer script for MedReport
; Disables "Per Machine" option, forcing "Per User" installation

!include "LogicLib.nsh"

; Disable the "All Users" radio button on the installation mode page
!macro customInstallMode
  ; Force per-user installation - disable the "All Users" option
  ; This runs when the install mode page is shown
  StrCpy $InstallMode "CurrentUser"
!macroend

; Custom initialization - disable per-machine option in the UI
!macro preInit
  ; Ensure we start with per-user mode
  SetShellVarContext current
!macroend
