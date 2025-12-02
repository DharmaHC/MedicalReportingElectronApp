@echo off
REM ==========================================
REM Reset Configurazioni MedReportAndSign
REM ==========================================
REM
REM Questo script forza il reset di tutte le
REM configurazioni personalizzate, ripristinando
REM i valori di default piu' recenti.
REM
REM ATTENZIONE: Tutte le personalizzazioni
REM verranno perse!
REM ==========================================

echo.
echo ==========================================
echo Reset Configurazioni MedReportAndSign
echo ==========================================
echo.
echo ATTENZIONE: Questo script ripristinera' tutte
echo le configurazioni ai valori di default.
echo.
echo Tutte le personalizzazioni verranno perse!
echo.
pause

echo.
echo Creazione file marker per reset...
echo.

REM Crea la cartella se non esiste
if not exist "C:\ProgramData\MedReportAndSign" (
    mkdir "C:\ProgramData\MedReportAndSign"
    echo Cartella creata: C:\ProgramData\MedReportAndSign
)

REM Crea il file marker vuoto
echo. > "C:\ProgramData\MedReportAndSign\RESET_CONFIG"

if exist "C:\ProgramData\MedReportAndSign\RESET_CONFIG" (
    echo.
    echo [OK] File marker creato con successo!
    echo.
    echo Al prossimo avvio di MedReportAndSign,
    echo tutte le configurazioni verranno ripristinate.
    echo.
    echo File personalizzati da resettare:
    echo - C:\ProgramData\MedReportAndSign\assets\sign-settings.json
    echo - C:\ProgramData\MedReportAndSign\assets\company-ui-settings.json
    echo - C:\ProgramData\MedReportAndSign\assets\company-footer-settings.json
    echo - Tutte le immagini personalizzate
    echo.
) else (
    echo.
    echo [ERRORE] Impossibile creare il file marker!
    echo Verificare di avere i permessi necessari.
    echo.
)

echo.
pause
