# Documento Tecnico Operativo - MedReportAndSign

Ultimo aggiornamento: 2026-02-16
Stato: baseline iniziale (analisi architetturale completa)

## 1. Scopo del documento
Questo documento serve come memoria tecnica persistente del progetto, da aggiornare progressivamente con:
- nuove analisi,
- decisioni architetturali,
- bugfix rilevanti,
- differenze tra branch master e branch W7,
- rischi aperti e interventi consigliati.

## 2. Perimetro analizzato
Repository principale:
- `D:\Lavoro\Sviluppo\MedicalReportingAPP\MedReportAndSign\MedReportAndSign`

Branch Windows 7:
- `D:\Lavoro\Sviluppo\MedicalReportingAPP\MedReportAndSign\MedReportAndSignW7`

Componenti inclusi:
- Electron app (main, preload, renderer React)
- API ASP.NET Core (`MedicalReportingAPI`)
- Editor WPF (`MedReportEditor.Wpf`)

## 3. Architettura ad alto livello
### 3.1 Frontend Electron + React
- Shell desktop Electron con renderer React/Redux Persist.
- Routing principale in `src/renderer/App.tsx`.
- Comunicazione:
  - Renderer -> API via HTTP/fetch (`src/renderer/utility/urlLib.ts`).
  - Renderer -> Main process via IPC (`preload/index.ts`).

### 3.2 Main process (servizi locali)
Responsabilità principali:
- Firma PDF locale smartcard/PKCS#11 (`src/main/signPdfService.ts`).
- Firma remota multi-provider (`src/main/remoteSign/*`).
- Gestione configurazione persistente (`src/main/configManager.ts`).
- Bridge con editor WPF (`src/main/wpfEditor.ts`).
- Speech-to-text locale Whisper (`src/main/speechToText/*`, solo master).

### 3.3 Backend API ASP.NET Core
- Bootstrap/config in `MedicalReportingAPI/Program.cs`.
- Data access e procedure in:
  - `MedicalReportingAPI/Data/ApplicationDbContext.cs`
  - `MedicalReportingAPI/Models/ApplicationDbContextProcedures.cs`
- Controller core:
  - `MedicalReportingAPI/Controllers/ExamResultsController.cs`
  - `MedicalReportingAPI/Controllers/AccountController.cs`
  - `MedicalReportingAPI/Controllers/ReprintReportsController.cs`
  - `MedicalReportingAPI/Controllers/MedicalPrescriptionsController.cs`
  - `MedicalReportingAPI/Controllers/ReportNotificationController.cs`

### 3.4 Editor WPF
- Applicazione separata con Telerik RadRichTextBox.
- Integrazione orchestrata da Electron via processo e Named Pipe.
- File chiave:
  - `MedReportEditor.Wpf/MainWindow.xaml`
  - `MedReportEditor.Wpf/MainWindow.xaml.cs`

## 4. Flussi funzionali principali
### 4.1 Refertazione
1. Login e contesto utente/ruoli.
2. Carico worklist/esami da API.
3. Compilazione template (RTF/HTML).
4. Salvataggio bozza/finale tramite endpoint `ExamResultsController`.
5. Generazione/aggiornamento PDF.

Endpoint rilevanti (esempi):
- `GetCompiledRtfTemplate`
- `SendReportResultHTMLv2`
- `ProcessRtfAndPdfReport`
- `GetReportsToSign`
- `GetUnsignedPdf/{id}`
- `UpdateSignedReport`

### 4.2 Firma digitale
- Locale: certificato/smartcard e apposizione firma su PDF in main process.
- Remota: provider multipli (Aruba, InfoCert, Namirial, LAZIOcrea, OpenAPI) con gestione sessione dedicata.

### 4.3 Rigenerazione PDF
- Presente nel master (`src/renderer/pages/RegeneratePdfPage.tsx`) e supportata da `ReprintReportsController`.

### 4.4 Speech-to-text
- Presente nel master (Whisper locale), non rilevata nel W7.

## 5. Confronto master vs W7
Osservazioni consolidate:
- W7 e un branch ridotto orientato alla compatibilita Windows 7.
- Canale update dedicato W7 (`...\MedReportAndSignW7\GESTIONE_RELEASE_W7.md`).
- Feature core condivise: refertazione + firma locale/remota.
- Feature presenti nel master e non nel W7:
  - speech-to-text locale,
  - integrazione WPF editor nel set corrente del master,
  - pagina rigenerazione PDF,
  - moduli UI aggiuntivi.

## 6. Valutazione qualitativa
Punti forti:
- Copertura funzionale ampia per il dominio clinico.
- Integrazione firma digitale avanzata (anche massiva e multi-provider).
- Architettura pragmatica su tre livelli (Renderer/Main/API).

Criticita:
- File monolitici ad alta complessita:
  - `src/renderer/pages/EditorPage.tsx`
  - `MedicalReportingAPI/Controllers/ExamResultsController.cs`
- Debito tecnico e stratificazione legacy.
- Aree di sicurezza da hardenizzare (configurazioni sensibili e gestione cifratura).

## 7. Rischi tecnici aperti
- Presenza di segreti/configurazioni sensibili in chiaro in `MedicalReportingAPI/appsettings.json`.
- Possibili fallback crittografici deboli/rigidi in `MedicalReportingAPI/Services/EncryptionService.cs`.
- Necessita di revisione query SQL dinamiche e validazione parametri in endpoint complessi.
- Copertura test non omogenea rispetto alla complessita del dominio.

## 8. Backlog tecnico consigliato (priorita)
1. Hardening sicurezza configurazioni e segreti (vault/env separation).
2. Refactor progressivo dei file monolitici (EditorPage + ExamResultsController).
3. Audit query SQL raw/dinamiche + parametrizzazione completa.
4. Stabilizzazione contratti IPC e logging end-to-end sui flussi firma.
5. Test automatici su use-case critici (firma, salvataggio referto, reprint).

## 9. Regole di aggiornamento del documento
Ad ogni intervento significativo aggiornare:
- sezione "Ultimo aggiornamento",
- sezione tecnica impattata,
- changelog in coda.

Formato aggiornamento consigliato:
- Data (YYYY-MM-DD)
- Ambito (Electron/API/WPF/W7)
- Modifica effettuata
- Rischi residui
- Follow-up suggerito

## 10. Changelog analisi
### 2026-02-16
- Eseguita analisi architetturale completa di master + W7.
- Mappati i flussi applicativi principali Electron/API/WPF.
- Identificate differenze funzionali master vs W7.
- Identificate criticita principali su sicurezza e manutenibilita.

### 2026-02-16 (refactor lifecycle WPF)
- Refactor manager WPF in `src/main/wpfEditor.ts` con stato esplicito (`stopped/starting/ready_hidden/ready_visible/stopping/faulted`).
- Introdotte sessioni renderer (`attach/detach`) e idle-stop automatico del processo WPF.
- Introdotta serializzazione comandi pipe (queue) per ridurre race condition e callback incoerenti.
- Introdotto heartbeat `PING/PONG` con transizione a `faulted` e stop controllato su failure ripetuti.
- Esteso bridge `preload` e typings globali con API `attach`, `detach`, `getStatus`, `isDirty`, eventi status.
- Aggiornato `EditorPage` per lifecycle session-based e per invalidazione cache con `isDirty` lato WPF.
- Reso il toggle manuale WPF visibile solo all'utente test admin `FRSRFL72R25H282U`.
- Fix successivi su review:
  - rimosso double-resolve in `waitForReady`,
  - sostituito delay fragile in startup durante stop con attesa esplicita `stopPromise`,
  - eliminata doppia chiamata a `getContentBounds()` in `setBounds`,
  - collegati eventi runtime `wpf-editor:status` al renderer,
  - allineata gestione visibilita WPF con modale stampa imperativa tramite stato React dedicato,
  - aggiunto riallineamento periodico bounds in editor per scenari multi-monitor/DPI misti.
  - cambiata strategia `setBounds` nel main: invio coordinate relative CSS (`absolute=false`) e conversione DPI/schermo demandata al WPF per ridurre offset nel drag tra monitor.
  - fix WPF `SetBounds`: nel ramo overlay con parent noto usa coordinate DIP (`Left/Top/Width/Height`) derivate da `ClientToScreen` invece di `MoveWindow` in pixel fisici.
