; Custom NSIS installer script for MedReport
; Asks user for installation type and skips mode selection for standard

!include "LogicLib.nsh"

Var InstallationType

!macro preInit
  ; Forza chiusura MedReport se in esecuzione (workaround bug NSIS detection)
  nsExec::ExecToStack 'taskkill /F /IM "MedReport.exe" /T'
  Pop $0 ; exit code
  Pop $1 ; output

  ; NOTE: NON cancellare chiavi di registro qui!
  ; In modalita' --updated, NSIS legge il registro per trovare la directory
  ; di installazione esistente. Se le chiavi vengono cancellate prima,
  ; l'installer installa in una nuova directory invece di aggiornare.

  StrCpy $InstallationType "standard"
!macroend

!macro customInit
  ; In modalita' --updated (auto-update), NSIS gira in silent mode (/S).
  ; MessageBox in silent mode restituisce IDNO di default, che manderebbe
  ; nel path "advanced" rompendo l'auto-update. Skippiamo tutto e teniamo
  ; il tipo "standard" settato in preInit.
  IfSilent done

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

  ; ═══ Pulizia chiavi registro residue ═══
  ; Eseguita DOPO l'installazione (non in preInit) per non interferire
  ; con la rilevazione della directory in modalita' --updated
  ; HKEY_CURRENT_USER
  DeleteRegKey HKCU "Software\MedReport"
  DeleteRegKey HKCU "Software\medreportandsign"

  ; HKEY_LOCAL_MACHINE (richiede admin, fallisce silenziosamente se non admin)
  DeleteRegKey HKLM "SOFTWARE\MedReport"
  DeleteRegKey HKLM "SOFTWARE\medreportandsign"

  ; Windows 7 / 64-bit (Wow6432Node per app 32-bit su OS 64-bit)
  DeleteRegKey HKLM "SOFTWARE\Wow6432Node\MedReport"
  DeleteRegKey HKLM "SOFTWARE\Wow6432Node\medreportandsign"
  DeleteRegKey HKCU "Software\Wow6432Node\MedReport"
  DeleteRegKey HKCU "Software\Wow6432Node\medreportandsign"

  ; ═══ Force settings + images reset ═══
  ; Crea il marker RESET_CONFIG in ProgramData per forzare la sovrascrittura
  ; dei settings e delle immagini con i nuovi default al prossimo avvio dell'app.
  ReadEnvStr $R0 "ProgramData"
  CreateDirectory "$R0\MedReportAndSign"
  FileOpen $1 "$R0\MedReportAndSign\RESET_CONFIG" w
  FileWrite $1 "1.0.59"
  FileClose $1
!macroend
