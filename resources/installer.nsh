; Custom NSIS installer script for MedReport
; Disables "Per Machine" option completely - visible but not selectable

!include "LogicLib.nsh"
!include "WinMessages.nsh"

; Force per-user installation mode
!macro customInstallMode
  ; Always use CurrentUser mode
  StrCpy $InstallMode "CurrentUser"
!macroend

; Custom page initialization - disable the "All Users" radio button
!macro customPageAfterInstallMode
  ; Get the handle of the "All Users" radio button and disable it
  ; Radio button ID 4101 is typically the "All Users" option
  GetDlgItem $0 $HWNDPARENT 4101
  ${If} $0 != 0
    EnableWindow $0 0
  ${EndIf}

  ; Ensure "Just Me" is selected (radio button ID 4100)
  GetDlgItem $0 $HWNDPARENT 4100
  ${If} $0 != 0
    SendMessage $0 ${BM_SETCHECK} ${BST_CHECKED} 0
  ${EndIf}
!macroend

; Pre-initialization
!macro preInit
  SetShellVarContext current
!macroend
