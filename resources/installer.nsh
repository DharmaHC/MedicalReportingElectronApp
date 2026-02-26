; Custom NSIS installer script for MedReport
; Handles auto-update (--updated flag from electron-updater) and manual installation
;
; v1.0.70: NON-SILENT auto-update with WMIC Job Object escape
;
; Fix 1 - WMIC self-relaunch to escape Chromium Job Object:
; When electron-updater (v1.0.52 and earlier) spawns this installer via
; child_process.spawn(), the installer is a child of the Electron process.
; Chromium's Windows Job Object kills ALL child processes when the app exits
; (app.quit() is called immediately after spawn). The installer process gets
; terminated during .onInit, before it can reach customInit.
; Fix: At the very start of preInit, if --updated but NOT --wmic-relaunched,
; relaunch ourselves via "wmic process call create" (which creates a process
; through the WMI service, completely independent of any Job Object) and exit.
; The relaunched instance has --wmic-relaunched flag and proceeds normally.
;
; v1.0.70: Removed SetSilent for auto-updates. The installer now shows its
; full UI (Welcome, Directory, Progress) so the user can follow the update.
; The Finish page is auto-skipped (app is launched from customInstall).
;
; Auto-update flow:
;   0. preInit: WMIC self-relaunch (if spawned by Electron, escapes Job Object)
;   1. preInit: kill stuck old installers + kill app processes (NO SetSilent)
;   2. ALLOW_ONLY_ONE_INSTALLER_INSTANCE: mutex check
;   3. initMultiUser: reads registry, sets $INSTDIR to existing install path
;   4. customInit: confirms --updated, sets standard install, BringToFront
;   5. Pages shown: Welcome → Directory (pre-filled) → Progress
;   6. customInstall: launch app via StdUtils.ExecShellAsUser
;   7. customFinishPage PRE: skip finish page (app already launched)

!include "LogicLib.nsh"
!include "FileFunc.nsh"

Var InstallationType

!macro preInit
  ; ═══ CRITICAL FIX 1: Self-relaunch via WMIC to escape Chromium Job Object ═══
  ; When electron-updater (v1.0.52 and earlier) uses child_process.spawn() to
  ; launch this installer, we are a child of the Electron process. Chromium's
  ; Job Object will kill us when app.quit() is called (immediately after spawn).
  ; Fix: Relaunch ourselves via "wmic process call create" which creates a
  ; process through the WMI service, completely outside Electron's Job Object.
  ; The relaunched instance detects --wmic-relaunched and proceeds normally.
  ${StdUtils.TestParameter} $R9 "wmic-relaunched"
  StrCmp "$R9" "true" skipWmicRelaunch 0
  ${StdUtils.TestParameter} $R9 "updated"
  StrCmp "$R9" "true" 0 skipWmicRelaunch
    ; We are in auto-update mode but NOT yet relaunched via wmic.
    ; Relaunch ourselves via wmic to escape the Job Object, then exit.
    ReadEnvStr $R0 TEMP
    FileOpen $2 "$R0\NSIS_RELAUNCH.log" w
    FileWrite $2 "v1.0.70 WMIC self-relaunch$\r$\n"
    FileWrite $2 "EXEPATH=$EXEPATH$\r$\n"
    System::Call 'kernel32::GetCommandLineW() t .r3'
    FileWrite $2 "OrigCmdLine=$3$\r$\n"
    nsExec::ExecToStack `wmic process call create '"$EXEPATH" --updated --force-run --wmic-relaunched'`
    Pop $0
    Pop $1
    FileWrite $2 "wmic rc=$0$\r$\n"
    FileWrite $2 "wmic out=$1$\r$\n"
    FileClose $2
    ; Only quit if wmic succeeded (rc=0), otherwise fall through and try normally
    StrCmp "$0" "0" 0 skipWmicRelaunch
    Quit
  skipWmicRelaunch:

  ; ═══ CRITICAL: Kill stuck old installer processes ═══
  ; Previous installer versions may be stuck showing hidden dialogs
  ; (MessageBox or NSIS pages behind other windows). These processes
  ; hold the NSIS APP_GUID mutex, which causes
  ; ALLOW_ONLY_ONE_INSTALLER_INSTANCE to silently abort all new
  ; installer runs. preInit runs BEFORE the mutex check.
  System::Call 'kernel32::GetCurrentProcessId() i .r9'

  ; Write diagnostic to %TEMP% (preInit can't use $INSTDIR yet)
  ReadEnvStr $R0 TEMP
  FileOpen $2 "$R0\NSIS_PREINIT.log" w
  FileWrite $2 "preInit v1.0.70$\r$\n"
  FileWrite $2 "OurPID=$9$\r$\n"

  ; --- Diagnostic: raw command line ---
  System::Call 'kernel32::GetCommandLineW() t .r3'
  FileWrite $2 "RawCmdLine=$3$\r$\n"
  ${StdUtils.GetAllParameters} $3 ""
  FileWrite $2 "StdUtilsAllParams=$3$\r$\n"

  ; --- Diagnostic: isUpdated, wmic-relaunched, and Silent flags ---
  ${If} ${isUpdated}
    FileWrite $2 "isUpdated=YES (non-silent, UI visible)$\r$\n"
  ${Else}
    FileWrite $2 "isUpdated=NO$\r$\n"
  ${EndIf}
  ${StdUtils.TestParameter} $R9 "wmic-relaunched"
  ${If} "$R9" == "true"
    FileWrite $2 "wmic-relaunched=YES (escaped Job Object)$\r$\n"
  ${Else}
    FileWrite $2 "wmic-relaunched=NO$\r$\n"
  ${EndIf}
  ${If} ${Silent}
    FileWrite $2 "Silent=YES$\r$\n"
  ${Else}
    FileWrite $2 "Silent=NO$\r$\n"
  ${EndIf}

  ; --- Diagnostic: list all MedReport* processes BEFORE kill ---
  nsExec::ExecToStack `wmic process where "name like 'MedReport%'" get processid,name /format:list`
  Pop $0
  Pop $1
  FileWrite $2 "BEFORE kill (wmic list): rc=$0$\r$\n"
  FileWrite $2 "$1$\r$\n"

  ; ═══ Kill Method 1: WMIC wildcard terminate ═══
  ; WMIC uses SQL LIKE with % wildcard - no escaping issues unlike PowerShell
  ; Kills all processes matching MedReport*Setup* except our own PID
  nsExec::ExecToStack `wmic process where "name like 'MedReport%Setup%' and processid <> $9" call terminate`
  Pop $0
  Pop $1
  FileWrite $2 "WMIC terminate: rc=$0 out=$1$\r$\n"

  ; ═══ Kill Method 2: Explicit taskkill for known stuck versions ═══
  ; taskkill with exact /IM name is the most reliable method
  ; MedReport (Main build) - versions 59-64
  nsExec::ExecToStack 'taskkill /F /IM "MedReport-Setup-1.0.59.exe"'
  Pop $0
  Pop $1
  FileWrite $2 "taskkill MR-59: $0 $1$\r$\n"
  nsExec::ExecToStack 'taskkill /F /IM "MedReport-Setup-1.0.60.exe"'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'taskkill /F /IM "MedReport-Setup-1.0.61.exe"'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'taskkill /F /IM "MedReport-Setup-1.0.62.exe"'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'taskkill /F /IM "MedReport-Setup-1.0.63.exe"'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'taskkill /F /IM "MedReport-Setup-1.0.64.exe"'
  Pop $0
  Pop $1
  ; MedReportAndSign (W7 build) - versions 59-64
  nsExec::ExecToStack 'taskkill /F /IM "MedReportAndSign-Setup-1.0.59.exe"'
  Pop $0
  Pop $1
  FileWrite $2 "taskkill MRAS-59: $0 $1$\r$\n"
  nsExec::ExecToStack 'taskkill /F /IM "MedReportAndSign-Setup-1.0.60.exe"'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'taskkill /F /IM "MedReportAndSign-Setup-1.0.61.exe"'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'taskkill /F /IM "MedReportAndSign-Setup-1.0.62.exe"'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'taskkill /F /IM "MedReportAndSign-Setup-1.0.63.exe"'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'taskkill /F /IM "MedReportAndSign-Setup-1.0.64.exe"'
  Pop $0
  Pop $1

  ; ═══ Kill Method 3: PowerShell simplified (no $_ escaping needed) ═══
  ; Uses Get-Process -Name with wildcard (avoids Where-Object {$_.Name})
  ; and Where-Object simplified syntax (avoids {$_.Id})
  nsExec::ExecToStack `powershell -NoProfile -Command "Get-Process -Name 'MedReport*Setup*' -ErrorAction SilentlyContinue | Where-Object Id -ne $9 | Stop-Process -Force -ErrorAction SilentlyContinue"`
  Pop $0
  Pop $1
  FileWrite $2 "PS kill: rc=$0$\r$\n"

  ; Wait for processes to fully exit and release the mutex
  Sleep 2000

  ; --- Diagnostic: check if the APP_GUID mutex still exists ---
  ; APP_GUID is a UUID v5 derived from the appId, used by ALLOW_ONLY_ONE_INSTALLER_INSTANCE
  ; Check BOTH possible mutex names
  System::Call 'kernel32::OpenMutex(i 0x00100000, i 0, t "${APP_GUID}") i .r0'
  StrCmp $0 "0" uuidMutexNotFound uuidMutexFound
  uuidMutexFound:
    FileWrite $2 "WARNING: UUID Mutex HELD! Handle=$0 GUID=${APP_GUID}$\r$\n"
    System::Call 'kernel32::CloseHandle(i r0)'
    Goto uuidMutexDone
  uuidMutexNotFound:
    FileWrite $2 "UUID Mutex clear (${APP_GUID})$\r$\n"
  uuidMutexDone:
  ; Also check the appId-named mutex
  System::Call 'kernel32::OpenMutex(i 0x00100000, i 0, t "net.dharmahealthcare.medreportandsign") i .r0'
  StrCmp $0 "0" appIdMutexNotFound appIdMutexFound
  appIdMutexFound:
    FileWrite $2 "WARNING: AppId Mutex HELD! Handle=$0$\r$\n"
    System::Call 'kernel32::CloseHandle(i r0)'
    Goto appIdMutexDone
  appIdMutexNotFound:
    FileWrite $2 "AppId Mutex clear$\r$\n"
  appIdMutexDone:

  ; --- Diagnostic: list all MedReport* processes AFTER kill ---
  nsExec::ExecToStack `wmic process where "name like 'MedReport%'" get processid,name /format:list`
  Pop $0
  Pop $1
  FileWrite $2 "AFTER kill (wmic list): rc=$0$\r$\n"
  FileWrite $2 "$1$\r$\n"

  FileWrite $2 "Proceeding to .onInit checks$\r$\n"
  FileClose $2

  ; Force kill app processes (both productName variants)
  nsExec::ExecToStack 'taskkill /F /IM "MedReport.exe" /T'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'taskkill /F /IM "MedReportAndSign.exe" /T'
  Pop $0
  Pop $1

  ; NOTE: Do NOT delete registry keys here!
  ; In --updated mode, NSIS reads the registry (initMultiUser) to find
  ; the existing install directory. Deleting keys here would cause
  ; the installer to install to a NEW default directory instead.

  StrCpy $InstallationType "standard"
!macroend

!macro customInit
  ; Write diagnostic to confirm customInit was reached (past mutex check)
  ReadEnvStr $R0 TEMP
  FileOpen $2 "$R0\NSIS_CUSTOMINIT.log" w
  FileWrite $2 "customInit v1.0.70 reached (mutex check passed!)$\r$\n"

  ${If} ${isUpdated}
    ; Auto-update: set standard install type, bring window to front
    ; The installer shows its UI (non-silent) so the user can follow the update progress.
    FileWrite $2 "isUpdated=YES, standard install + BringToFront$\r$\n"
    StrCpy $InstallationType "standard"
    StrCpy $InstallMode "CurrentUser"
    SetShellVarContext current
    BringToFront
  ${Else}
    FileWrite $2 "isUpdated=NO, showing MessageBox$\r$\n"
    FileClose $2

    ; Manual installation - show installation type choice
    MessageBox MB_YESNO|MB_ICONQUESTION "Scegli la modalità di installazione:$\n$\nSI = Installazione Standard (Consigliata)$\n        Per utente corrente, con aggiornamenti automatici$\n$\nNO = Installazione Avanzata$\n        Permette di installare per tutti gli utenti (solo per Service)" IDNO advanced

    ; User clicked YES - Standard installation
    StrCpy $InstallationType "standard"
    StrCpy $InstallMode "CurrentUser"
    SetShellVarContext current
    Goto customInitDone

    advanced:
    ; User clicked NO - Advanced installation
    StrCpy $InstallationType "advanced"

    customInitDone:
    Goto customInitEnd
  ${EndIf}

  FileClose $2

  customInitEnd:
!macroend

; Skip the install mode page for standard installations
!macro customInstallMode
  ${If} $InstallationType == "standard"
    StrCpy $InstallMode "CurrentUser"
    SetShellVarContext current
    Abort
  ${EndIf}
!macroend

!macro customInstall
  ${If} $InstallationType == "standard"
    SetShellVarContext current
  ${EndIf}

  ; ═══ Registry cleanup (after install, not in preInit) ═══
  DeleteRegKey HKCU "Software\MedReport"
  DeleteRegKey HKCU "Software\medreportandsign"
  DeleteRegKey HKLM "SOFTWARE\MedReport"
  DeleteRegKey HKLM "SOFTWARE\medreportandsign"
  DeleteRegKey HKLM "SOFTWARE\Wow6432Node\MedReport"
  DeleteRegKey HKLM "SOFTWARE\Wow6432Node\medreportandsign"
  DeleteRegKey HKCU "Software\Wow6432Node\MedReport"
  DeleteRegKey HKCU "Software\Wow6432Node\medreportandsign"

  ; ═══ Force settings + images reset ═══
  ReadEnvStr $R0 "ProgramData"
  CreateDirectory "$R0\MedReportAndSign"
  FileOpen $1 "$R0\MedReportAndSign\RESET_CONFIG" w
  FileWrite $1 "1.0.70"
  FileClose $1

  ; ═══ Diagnostic log in $INSTDIR ═══
  FileOpen $2 "$INSTDIR\NSIS_AUTOUPDATE.log" w
  FileWrite $2 "version=1.0.70$\r$\n"
  FileWrite $2 "INSTDIR=$INSTDIR$\r$\n"
  FileWrite $2 "launchLink=$launchLink$\r$\n"
  FileWrite $2 "appExe=$appExe$\r$\n"
  FileWrite $2 "APP_EXE=${APP_EXECUTABLE_FILENAME}$\r$\n"
  ${If} ${isUpdated}
    FileWrite $2 "isUpdated=YES$\r$\n"
  ${Else}
    FileWrite $2 "isUpdated=NO$\r$\n"
  ${EndIf}
  ${If} ${Silent}
    FileWrite $2 "Silent=YES$\r$\n"
  ${Else}
    FileWrite $2 "Silent=NO$\r$\n"
  ${EndIf}

  ; ═══ Launch app after auto-update ═══
  ; Uses StdUtils.ExecShellAsUser (same API as template's StartApp)
  ; to launch in the user's context, not elevated.
  ${If} ${isUpdated}
    FileWrite $2 "Launching app via ExecShellAsUser...$\r$\n"
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--updated"
    FileWrite $2 "ExecShellAsUser result=$0$\r$\n"
  ${EndIf}
  FileClose $2
!macroend

; ═══ Custom finish page ═══
; Auto-skip finish page during auto-update (app is already launched from customInstall).
; For manual installations, shows the normal finish page with "Run app" checkbox.
!macro customFinishPage
  ; Define StartApp function for the "Run app" checkbox (manual installs only)
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${If} ${isUpdated}
        StrCpy $1 "--updated"
      ${Else}
        StrCpy $1 ""
      ${EndIf}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif

  ; PRE callback: auto-skip finish page during auto-update
  ; (app was already launched from customInstall)
  !define MUI_PAGE_CUSTOMFUNCTION_PRE finishPageAutoSkip
  !insertmacro MUI_PAGE_FINISH

  Function finishPageAutoSkip
    ${If} ${isUpdated}
      Abort
    ${EndIf}
  FunctionEnd
!macroend
