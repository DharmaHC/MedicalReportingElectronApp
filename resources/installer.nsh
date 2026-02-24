; Custom NSIS installer script for MedReport
; Asks user for installation type and skips mode selection for standard

!include "LogicLib.nsh"

Var InstallationType

!macro preInit
  ; Forza chiusura MedReport se in esecuzione (workaround bug NSIS detection)
  nsExec::ExecToStack 'taskkill /F /IM "MedReport.exe" /T'
  Pop $0 ; exit code
  Pop $1 ; output

  ; Pulisce chiavi registro residue che impediscono reinstallazione
  ; HKEY_CURRENT_USER
  DeleteRegKey HKCU "Software\MedReport"
  DeleteRegKey HKCU "Software\medreportandsign"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MedReport"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{net.dharmahealthcare.medreportandsign}"

  ; HKEY_LOCAL_MACHINE (richiede admin, fallisce silenziosamente se non admin)
  DeleteRegKey HKLM "SOFTWARE\MedReport"
  DeleteRegKey HKLM "SOFTWARE\medreportandsign"
  DeleteRegKey HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\MedReport"
  DeleteRegKey HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{net.dharmahealthcare.medreportandsign}"

  ; Windows 7 / 64-bit (Wow6432Node per app 32-bit su OS 64-bit)
  DeleteRegKey HKLM "SOFTWARE\Wow6432Node\MedReport"
  DeleteRegKey HKLM "SOFTWARE\Wow6432Node\medreportandsign"
  DeleteRegKey HKLM "SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\MedReport"
  DeleteRegKey HKLM "SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{net.dharmahealthcare.medreportandsign}"
  DeleteRegKey HKCU "Software\Wow6432Node\MedReport"
  DeleteRegKey HKCU "Software\Wow6432Node\medreportandsign"

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

  ; ═══ Force settings + images reset per v1.0.54 ═══
  ; Crea il marker RESET_CONFIG in ProgramData per forzare la sovrascrittura
  ; dei settings e delle immagini (logo/footer) con i nuovi default al prossimo avvio.
  ; Le immagini di default ora contengono i loghi corretti (non più placeholder vuoti).
  ReadEnvStr $R0 "ProgramData"
  CreateDirectory "$R0\MedReportAndSign"
  FileOpen $1 "$R0\MedReportAndSign\RESET_CONFIG" w
  FileWrite $1 "1.0.56"
  FileClose $1
!macroend
