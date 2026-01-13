; Custom NSIS installer script for MedReport
; Asks user for installation type and skips mode selection for standard

!include "LogicLib.nsh"

Var InstallationType

!macro preInit
  StrCpy $InstallationType "standard"
!macroend

!macro customInit
  MessageBox MB_YESNO|MB_ICONQUESTION "Scegli la modalità di installazione:$\n$\nSI = Installazione Standard (Consigliata)$\n        Per utente corrente, con aggiornamenti automatici$\n$\nNO = Installazione Avanzata$\n        Permette di installare per tutti gli utenti (solo per Service)" IDNO advanced

  ; User clicked YES - Standard installation
  StrCpy $InstallationType "standard"
  StrCpy $InstallMode "CurrentUser"
  SetShellVarContext current
  Goto done

  advanced:
  ; User clicked NO - Advanced installation
  StrCpy $InstallationType "advanced"

  done:
!macroend

; This macro is called to determine install mode - try to skip page
!macro customInstallMode
  ${If} $InstallationType == "standard"
    StrCpy $InstallMode "CurrentUser"
    SetShellVarContext current
    ; Try to abort/skip this page
    Abort
  ${EndIf}
!macroend

!macro customInstall
  ${If} $InstallationType == "standard"
    SetShellVarContext current
  ${EndIf}
!macroend
