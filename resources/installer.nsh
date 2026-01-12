; Custom NSIS installer script for MedReport
; Forces per-user installation

!include "LogicLib.nsh"

; Force per-user installation mode
!macro customInstallMode
  StrCpy $InstallMode "CurrentUser"
!macroend

; Initialization
!macro preInit
  SetShellVarContext current
!macroend

!macro customInit
  SetShellVarContext current
!macroend
