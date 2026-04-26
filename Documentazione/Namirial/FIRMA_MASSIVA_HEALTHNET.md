# Firma Massiva Namirial su Health.NET — specifiche UI e logica

Documento companion di `INTEGRAZIONE_NAMIRIAL_HEALTHNET.md`. Descrive **nel dettaglio** la UX e il comportamento della modale di firma massiva di MRAS, da riprodurre in Health.NET.

Tutti i riferimenti al codice MRAS puntano a:
- `src/renderer/components/BulkSignModal.tsx` — modale principale
- `src/renderer/components/BulkSignAuthDialog.tsx` — dialog autenticazione (OTP/PIN)
- `src/renderer/store/bulkSignSlice.ts` — stato Redux
- `src/main/remoteSign/remoteSignIpcHandlers.ts` — orchestrazione backend (lato main process Electron, equivalente al web service backend di Health.NET)

---

## 1. Panoramica funzionale

La firma massiva permette al medico di firmare **N referti in una singola sessione**, inserendo OTP una sola volta (per utenti RHI) oppure zero volte (per utenti AHI). I referti vengono firmati sequenzialmente con lo stesso `sessionKey` SWS (valido 3 min).

Caso d'uso tipico: il medico accumula referti durante la giornata (stato "Da Firmare" / "Bozza") e li firma in blocco a fine turno.

### 1.1 Stati referto

Nella worklist DB i referti passano per questi stati (`DigitalSignedReports.ExaminationState`):

| Stato | Significato | Visibile in firma massiva |
|-------|-------------|---------------------------|
| `2` | Bozza (salvataggio intermedio) | Sì |
| `7` | Da Firmare (salvato con azione esplicita) | Sì |
| `5` | Firmato | Solo admin, per visualizzazione/reset |

### 1.2 Due modalità di firma utente

La modalità dipende dalla **configurazione del medico** letta dal DB:

| Modalità | Trigger | UX |
|----------|---------|-----|
| **RHI** (OTP interattivo) | `SignatureType = 'otp'` + `CodCertRHI` valorizzato + `PinCodeRHI` cifrato | Dialog chiede OTP, sessione 3 min |
| **AHI** (automatica) | `SignatureType = 'automatic'` + `RemoteSignUsername` (AHI code) + password/pin AHI | Nessun OTP, firma parte subito |

Se il medico ha **entrambe** le config, prevale `SignatureType` impostato nel DB.
Se non ne ha nessuna → errore UI "Firma non configurata, contatta admin".

---

## 2. Layout modale (1210×750 px)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Firma Remota Massiva                                          [X]   │
├─────────────────────────────────────────────────────────────────────┤
│ Provider Firma: [Namirial SWS ▼]         [⏱ Nessuna sessione]       │
├─────────────────────────────────────────────────────────────────────┤
│ Da: [gg/mm/aaaa]  A: [gg/mm/aaaa]  Paziente: [Cerca...]             │
│ Stato: [Tutti ▼]                                                    │
├─────────────────────────────────────────────────────────────────────┤
│ ┌──┬────────┬──────┬───────┬──────────┬──────┬────────┬──────────┐  │
│ │☐ │Cognome │Nome  │Cod.Es │Data Salv │Stato │Medico  │Firma     │  │
│ ├──┼────────┼──────┼───────┼──────────┼──────┼────────┼──────────┤  │
│ │☐ │ROSSI   │MARIO │030420…│03/04/2026│Da    │FRANCE. │    -     │  │
│ │☑ │VERDI   │ANNA  │070420…│07/04/2026│Da    │FRANCE. │    -     │  │
│ │☑ │BIANCHI │LUIGI │070420…│07/04/2026│Da    │FRANCE. │✓ Firmato │  │
│ └──┴────────┴──────┴───────┴──────────┴──────┴────────┴──────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│ [Seleziona tutti] [Deseleziona]        2 selezionati su 3 (1 firm.) │
├─────────────────────────────────────────────────────────────────────┤
│ [Progress bar durante la firma — visibile solo se in corso]         │
├─────────────────────────────────────────────────────────────────────┤
│                              [Chiudi]  [✎ Firma 2 Referti]          │
└─────────────────────────────────────────────────────────────────────┘
```

Componenti UI (Kendo in MRAS, sostituisci con equivalenti WebForms / Telerik ASP.NET AJAX su Health.NET):
- Dialog modale (bloccante)
- DropDownList per provider
- DatePicker × 2 per range date
- Input testo per paziente
- DropDownList per filtro stato
- Grid (con ordinamento, checkbox selezione)
- ProgressBar

---

## 3. Header — Provider e Sessione

### 3.1 Provider dropdown

- Valore di default: provider **associato al medico** (`remoteSignProvider` dalla PPU), tipicamente `NAMIRIAL`
- Lista: solo provider `enabled` + `configured` in `sign-settings.json` lato server
- Disabilitato durante la firma in corso
- Per Health.NET, se c'è solo Namirial, puoi anche ometterlo o renderlo readonly

### 3.2 Badge sessione

Tre stati visivi:

**Nessuna sessione attiva** (default):
```
🔒 Nessuna sessione attiva
```

**Sessione attiva** (dopo autenticazione OTP/AHI):
```
⏱ RHIP26011648243800
   2 min rimanenti
```

**Durante firma** (progress bar sotto):
```
⏱ Firmando...
   1 min rimanenti
```

Il countdown si aggiorna ogni secondo. Quando rimangono <30s mostra warning, quando scade la sessione → bottone torna a "Avvia Sessione e Firma" e richiede nuovo OTP.

---

## 4. Filtri

Quattro filtri in AND:

| Filtro | Tipo | Valore default |
|--------|------|----------------|
| Da | Data | Oggi |
| A | Data | Oggi |
| Paziente | Testo libero | vuoto |
| Stato | Dropdown: `Tutti` / `Bozze` / `Da Firmare` / `Firmati` | `Tutti` |

Al cambio di qualsiasi filtro, ricarica la lista referti via API `GetReportsToSign` (debounce 300ms per il campo testo).

### 4.1 API `GetReportsToSign`

```
GET /api/ExamResults/GetReportsToSign
  ?doctorCode=FRANFR
  &dateFrom=2026-04-01
  &dateTo=2026-04-17
  &lastName=rossi      (o firstName=mario)
  &states=2,7           (2=Bozza, 7=Da Firmare, 5=Firmato)
```

Risposta: array di oggetti `ReportToSign`:
```json
{
  "digitalReportId": "uuid",
  "examinationId": 12345,
  "linkedResultIds": [7158771, 7702241],
  "patientLastName": "ROSSI",
  "patientFirstName": "MARIO",
  "examinationMnemonicCodeFull": "030420260284",
  "printDate": "2026-04-07T14:00:00",
  "examinationState": 7,
  "doctorCode": "FRANFR",
  "doctorDisplayName": "FRANCESCONI FRANCESCA",
  "examNames": ["ECG", "MOC"],
  "companyId": "ASTER"
}
```

In MRAS questa API è in `ExamResultsController.cs` (metodo `GetReportsToSign`). Filtra per `DigitalSignedReports.ExaminationState IN (@states)` e join con `ExamResults` per recuperare `DoctorCode`. Per Health.NET la stessa logica vale.

---

## 5. Griglia referti

### 5.1 Colonne (da sinistra a destra)

| # | Colonna | Campo | Width | Note |
|---|---------|-------|-------|------|
| 1 | ☐ checkbox | `selected` | 50px | Selezione per firma |
| 2 | Cognome | `patientLastName` | 140px | |
| 3 | Nome | `patientFirstName` | 120px | |
| 4 | Codice Esame | `examinationMnemonicCodeFull` | 200px | Badge extra 👁 apre anteprima PDF (vedi §8) |
| 5 | Data Salvataggio | `printDate` | 130px | Formato `dd/MM/yyyy` |
| 6 | Stato | `examinationState` | 100px | Badge colorato: Bozza/Da Firmare/Firmato |
| 7 | Medico | `doctorDisplayName` | 150px | Firma + nome, tooltip con DoctorCode |
| 8 | Firma | `signStatus` (UI) | 120px | `-` / `In corso...` / `✓ Firmato` / `✗ Errore` |
| 9 | Azioni | (solo admin) | 100px | Pulsanti ↩ Reset / ✕ Elimina (§9) |

### 5.2 Interazioni

- **Click su riga**: toggle checkbox (equivalente)
- **Checkbox disabilitata** se `item.signStatus === 'signed'` (per evitare double-sign nella stessa sessione)
- **Riga evidenziata** (background #dbeafe) se `item.selected === true`
- **Riga disabilitata** (grigia) durante `isSigningInProgress`

### 5.3 Indicatore referto composito

Un "referto composito" ha più prestazioni linkate (`linkedResultIds.length > 1`). Nella colonna Codice Esame mostra un'icona extra (📋 in MRAS) con tooltip: "Referto composito: 2 prestazioni". Opzionale ma utile.

### 5.4 Column reorder (opzionale)

In MRAS le colonne della griglia Prestazioni (non questa — altra griglia nella pagina paziente) sono riordinabili. Per la firma massiva l'abbiamo tenuto statico per semplicità. Se Health.NET usa Telerik RadGrid, `AllowColumnReorder="true"` + persistenza in localStorage per-utente.

---

## 6. Barra selezione

```
[Seleziona tutti] [Deseleziona]     2 selezionati su 13 (9 firmati)
```

- `Seleziona tutti`: seleziona tutti i referti con `signStatus === 'pending'` (esclude i già firmati nella sessione corrente)
- `Deseleziona`: deseleziona tutti
- Contatore: "N selezionati su M" + "(K firmati)" se la sessione ha già firmato qualcosa

---

## 7. Dialog autenticazione (OTP/AHI)

Al click su "Avvia Sessione e Firma" si apre un dialog modale secondario. Due varianti:

### 7.1 Variante RHI (OTP)

```
┌─────────────────────────────────────────┐
│ Autenticazione Namirial SWS       [X]   │
├─────────────────────────────────────────┤
│ Firma con OTP (dispositivo RHI).        │
│ Inserisci il codice OTP per avviare     │
│ una sessione di 3 minuti.               │
│                                         │
│ Codice Dispositivo RHI                  │
│ [RHIP26011648243800            ] (ro*)  │
│ Il codice RHI del tuo certificato       │
│                                         │
│ PIN (salvato)                           │
│ [••••••••••                    ] 👁     │
│ Il PIN del dispositivo RHI              │
│                                         │
│ OTP (codice SMS/App) - obbligatorio     │
│ [                              ]        │
│ Codice OTP dall'app Namirial Sign o     │
│ ricevuto via SMS.                       │
│                                         │
│                 [Annulla] [🔒 Accedi]   │
└─────────────────────────────────────────┘
```
*(ro = readonly, precompilato dalla PPU)*

**UX critica**:
- **Focus automatico** sulla textbox OTP all'apertura
- **Enter** → Accedi (equivalente click)
- **Escape** → Annulla
- Campo OTP `maxLength=8`, pattern numerico
- `Accedi` disabilitato se username o pin o otp vuoti

### 7.2 Variante AHI (automatica)

```
┌─────────────────────────────────────────┐
│ Autenticazione Namirial SWS       [X]   │
├─────────────────────────────────────────┤
│ Firma automatica (dispositivo AHI).     │
│ La sessione Namirial dura max 3 minuti. │
│                                         │
│ Codice Dispositivo AHI                  │
│ [AHI7789383744609              ] (ro)   │
│                                         │
│ PIN (salvato)                           │
│ [••••••••••                    ] 👁     │
│                                         │
│ OTP (codice SMS/App) - opzionale        │
│ [                              ]        │
│ Lascia vuoto per firma automatica.      │
│                                         │
│                 [Annulla] [🔒 Accedi]   │
└─────────────────────────────────────────┘
```

Identico ma OTP opzionale. Se vuoto, la firma è automatica (nessun OTP passato a SWS).

### 7.3 Logica selezione modalità

```typescript
const hasCompleteAHI = remoteSignUsername && (hasRemoteSignPassword || hasRemoteSignPin);
const hasCompleteRHI = codCertRHI && hasRhiPin;

const useRHIMode =
  signatureType === 'otp'       ? hasCompleteRHI
: signatureType === 'automatic' ? false
: /* fallback */                  !hasCompleteAHI && hasCompleteRHI;
```

Messaggi d'errore specifici:
- `SignatureType='otp'` ma RHI incompleto → "Configurazione RHI incompleta. Verifica cod. dispositivo RHI e PIN."
- `SignatureType='automatic'` ma AHI incompleto → "Configurazione AHI incompleta. Verifica cod. dispositivo AHI e password."
- Nessuno dei due → "Firma non configurata. Contatta l'amministratore."

### 7.4 Precompilazione credenziali

All'apertura del dialog chiama l'API `GET /api/account/signature-credentials` (in MRAS: `getStoredCredentials`) che ritorna:
```json
{
  "username": "AHI7789383744609",   // solo se AHI config
  "password": "decrypted",           // solo se AHI password
  "pin": "decrypted",                // solo se AHI pin
  "pinRHI": "decrypted",             // solo se RHI pin
  "codCertRHI": "RHIP...",           // solo se RHI
  "signatureType": "otp",
  "provider": "NAMIRIAL"
}
```

L'API **decifra** i PIN AES-256 prima di restituirli (su HTTPS). Non salvarli in localStorage — usali solo in memoria durante la sessione.

**Check backend**: l'API ritorna 404 "Password/PIN firma non configurati" se **nessuno** tra password/pin/pinRHI è valorizzato. In MRAS abbiamo un bug fixato in v1.0.92: il check originale ignorava `pinRHI`. Se stai scrivendo Health.NET da zero, includi subito `pinRHI` nel check.

---

## 8. Anteprima PDF

Nella colonna Codice Esame (o via pulsante separato) c'è un'icona 👁 che apre un dialog con l'anteprima del PDF:

- **Referti non firmati** (stato 2, 7): chiama `GET /api/ExamResults/GetUnsignedPdf/{id}`, aggiunge la dicitura firma (preview) e mostra in iframe
- **Referti firmati** (stato 5): chiama `GET /api/ExamResults/GetReportPdf/{id}` e mostra il PDF firmato così com'è

In Health.NET puoi usare una finestra popup con `<object type="application/pdf">` o PDF.js.

---

## 9. Azioni admin (utenti privilegiati)

Se l'utente loggato è nella whitelist admin (in MRAS: `userName === 'FRSRFL72R25H282U'`, configurabile), la griglia mostra una colonna "Azioni" con due pulsanti per i **referti firmati** (stato 5):

### 9.1 ↩ Reset a "Da Firmare"

Rimette il referto in stato 7:
- `DigitalSignedReports.ExaminationState = 7`
- `DigitalSignedReports.SigningUser = NULL`
- `ExamResults.StateId = 7` per tutti i ResultsIds collegati (da `StateId = 8`)
- Audit trail: `Outcome = 'RESET_TO_UNSIGNED'`

API: `POST /api/ExamResults/ResetToUnsigned/{id}`, richiede conferma utente ("Riportare il referto di {paz} allo stato Da Firmare?").

### 9.2 ✕ Elimina referto

Cancella il record `DigitalSignedReports` e riporta gli `ExamResults` collegati allo stato precedente (`StateId = 5` = In Lavorazione):
- `DELETE FROM DigitalSignedReports WHERE Id = @id`
- `UPDATE ExamResults SET StateId = 5, ReportDate = NULL WHERE ResultId IN (...)`
- Audit trail: `Outcome = 'DELETED'`

API: `DELETE /api/ExamResults/DeleteSignedReport/{id}`, richiede **doppia conferma** ("ATTENZIONE: eliminare definitivamente il referto firmato di {paz}? Questa azione non è reversibile.").

### 9.3 Chi è admin

In Health.NET definisci una tabella `AdminUsers` (o riutilizza `UsersDetails.HasAdminRights`) per fare la whitelist per CF. Non hardcodare il CF nel codice.

---

## 10. Flusso firma batch (dopo click "Accedi e Firma")

```
1. Dialog auth si chiude
2. [Frontend] dispatch startSigning() → UI disabilita input, mostra ProgressBar
3. [Backend] SOAP openSession → sessionKey 3 min
4. [Backend] Per ogni referto selezionato (in SERIE, concurrency=1):
   a. GET /api/ExamResults/GetUnsignedPdf/{id} → PDF base64
   b. Decora PDF (logo/footer) + aggiungi dicitura firma (Doctors.FullName)
   c. SOAP signPAdES(credentials + buffer) → PDF firmato
   d. POST /api/ExamResults/UpdateSignedReport (salva PDF, stato 5, aggiorna ExamResults.StateId=8)
   e. [Frontend] notify progress: 3/10 firmati, paziente "ROSSI MARIO"
   f. Aggiorna signStatus = 'signed' o 'error' per quel referto
5. [Backend] SOAP closeSession (best effort)
6. [Frontend] dispatch finishSigning({total, successful, failed}) → notifica finale
```

Durante il passo 4:
- Se una firma fallisce (es. dispositivo offline), **continua** con gli altri. Errore tracciato in `signStatus = 'error'` + `errorMessage`.
- Se la sessione scade (errore 69), **abort** del batch rimanente. L'utente deve rigenerare sessione.
- Se il server Namirial risponde con "Errore Generico" per un referto specifico (es. PDF malformato), skip quello e continua.

### 10.1 Gestione progress

Stato Redux `signProgress`:
```typescript
{
  total: 10,           // referti selezionati
  completed: 3,        // firmati OK
  failed: 1,           // errori
  currentPatient: "ROSSI MARIO"
}
```

ProgressBar:
```
[████████░░░░░░░░░] 40%
Firmando: ROSSI MARIO               4/10 (1 errori)
```

### 10.2 Update UI per-riga

Ogni referto ha il suo `signStatus` che viene aggiornato in tempo reale:
- `pending` → `-`
- `signing` → `⏳ In corso...` (con spinner)
- `signed` → `✓ Firmato` (verde)
- `error` → `✗ Errore` (rosso, tooltip con messaggio)

In Health.NET WebForms usa UpdatePanel + Timer (polling) o SignalR se già integrato.

---

## 11. Pulsante principale "Firma N Referti"

Testo dinamico:

| Condizione | Testo |
|-----------|-------|
| Tutti i selezionati già firmati | `{N} Referti già firmati` (disabilitato) |
| Sessione attiva | `Firma {N} Referti` |
| `signatureType=automatic` + AHI completo | `Firma Automatica {N} Referti` |
| Altro | `Avvia Sessione e Firma` |

Disabilitato se:
- `selectedCount === 0`
- `isSigningInProgress` in corso
- nessun provider selezionato
- `signedCount === selectedCount` (tutti firmati)

---

## 12. Notifiche toast

In alto a destra, temporizzate 5s:

- ✅ **Successo**: "10 referti firmati con successo" (verde)
- ⚠ **Parziale**: "8 referti firmati, 2 errori" (giallo)
- ✗ **Errore totale**: "Firma fallita: {messaggio}" (rosso)

Errori specifici da tradurre in messaggi utente chiari:
- `CKR_TOKEN_NOT_RECOGNIZED` → "Smartcard non riconosciuta. Verificare che il token sia inserito correttamente."
- `1001` Dispositivo OTP non esistente → "Codice dispositivo RHI non valido sul server Namirial."
- `44` OTP errato → "Codice OTP errato. Riprovare con un nuovo codice."
- `4` Credenziali errate → "PIN errato. Verificare la configurazione."
- `69` Session key scaduta → "Sessione scaduta. Reinserire OTP per continuare."
- `ECONNREFUSED` → "Server di firma non raggiungibile. Riprovare tra qualche minuto."
- `Errore Generico` → "Errore generico del servizio firma. Contattare l'amministratore."

---

## 13. Stati Redux / session state lato server

In MRAS lo stato è in Redux (frontend Electron). Per Health.NET WebForms puoi usare **Session** ASP.NET o un ViewState serializzato. Campi minimi:

```csharp
public class BulkSignSessionState
{
    public bool SessionActive { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public string SessionKey { get; set; }          // da SWS openSession
    public string SignedByDisplayName { get; set; } // Doctors.FullName
    public string UsernameRHI { get; set; }         // CodCertRHI
    public string Provider { get; set; }            // "NAMIRIAL"
    public List<Guid> SignedReportIds { get; set; } // già firmati in questa sessione
    public SignProgress Progress { get; set; }
}
```

Il `SessionKey` **non deve essere serializzato nel ViewState** del browser (è sensibile). Mantienilo server-side (Session) oppure in memoria main process.

---

## 14. Endpoint API necessari

Riepilogo delle API che il backend deve esporre (su MRAS sono in `ExamResultsController` + `AccountController`):

| Verb | Endpoint | Scopo |
|------|----------|-------|
| GET | `/api/ExamResults/GetReportsToSign?doctorCode=...&states=...&...` | Lista referti filtrati |
| GET | `/api/ExamResults/GetUnsignedPdf/{id}` | PDF non firmato per firma o preview |
| GET | `/api/ExamResults/GetReportPdf/{id}` | PDF (firmato o non) per preview |
| POST | `/api/ExamResults/UpdateSignedReport` | Salva PDF firmato + aggiorna stati |
| POST | `/api/ExamResults/ResetToUnsigned/{id}` | (admin) Reset a "Da Firmare" |
| DELETE | `/api/ExamResults/DeleteSignedReport/{id}` | (admin) Elimina referto firmato |
| GET | `/api/account/signature-credentials` | Credenziali firma decifrate per utente |

Se Health.NET usa ASMX / WCF legacy invece di REST, adatta ma mantieni la stessa semantica.

---

## 15. Concorrenza e consistenza

### 15.1 Un medico, due PC

Se lo stesso medico apre la firma massiva su due PC contemporaneamente e seleziona lo stesso referto, il primo a firmare vince. Il secondo, quando prova `UpdateSignedReport`, deve ricevere errore (referto già in stato 5, non matcha il filtro `ExaminationState IN (2, 7)`). Gestisci in UI mostrando "Referto già firmato da un'altra sessione".

### 15.2 Molti medici sulla stessa istanza SWS

Il server SWS gestisce sessioni per-utente (chiave = username + sessionKey). Medici diversi possono firmare **in parallelo** senza interferire (sessioni distinte). Ma **lo stesso medico** non può avere più `signPAdES` concorrenti sulla stessa sessionKey (vedi `concurrency=1` in MRAS).

---

## 16. Differenze da MRAS (Electron) rispetto a Health.NET (WebForms)

| Aspetto | MRAS (Electron) | Health.NET (WebForms) |
|---------|-----------------|------------------------|
| Dialog modale | Kendo React Dialog | Telerik RadWindow o jQuery UI dialog |
| State management | Redux Toolkit | Session ASP.NET + ViewState |
| Live update progress | Redux dispatch | UpdatePanel + Timer / SignalR |
| SOAP client | `soap` npm package | `System.ServiceModel` / `HttpClient` |
| File PDF | pdf-lib (JS) | iTextSharp / PdfSharp |
| Encryption key | Node env variable | `appsettings.json` (condivisa con MRAS) |

La logica funzionale è identica. Solo i tool di implementazione cambiano.

---

## 17. Checklist implementazione UI

Per ricostruire la modale:

**Layout**:
- [ ] Dialog modale 1210×750, chiudibile con X (se non `isSigningInProgress`)
- [ ] Header con provider dropdown + badge sessione
- [ ] 4 filtri (Da/A/Paziente/Stato) con reload lista on-change
- [ ] Griglia 8 colonne + (admin: colonna 9)
- [ ] Barra selezione (seleziona tutti / deseleziona / contatore)
- [ ] Progress bar durante firma
- [ ] Pulsanti footer (Chiudi / Firma)

**Dialog auth (RHI)**:
- [ ] Precompilazione username + pin (da API credentials)
- [ ] Focus automatico su OTP
- [ ] Enter = Accedi, Escape = Annulla
- [ ] Validazione: OTP obbligatorio
- [ ] Messaggio errore in-dialog per credenziali errate

**Anteprima PDF**:
- [ ] Pulsante 👁 per riga
- [ ] Endpoint diverso se firmato o no
- [ ] Dialog PDF viewer con pulsanti Stampa/Chiudi

**Admin**:
- [ ] Whitelist da DB (`HasAdminRights` o tabella dedicata)
- [ ] Pulsanti solo su righe `examinationState === 5`
- [ ] Doppia conferma su DELETE

**Flusso firma**:
- [ ] openSession SWS (con getOTPList per RHI)
- [ ] Worker seriale (concurrency=1)
- [ ] Update progress in tempo reale
- [ ] Gestione errore per-referto (non abortire batch)
- [ ] closeSession best effort
- [ ] Notifica toast finale

**Error handling**:
- [ ] Map codici errore SWS → messaggi utente
- [ ] Riprova con nuovo OTP se sessione scade
- [ ] Retry button per referti in errore

---

## 18. Screenshot di riferimento

Vedi gli screenshot in `Documentazione/Namirial/` (se presenti) oppure chiedi ai clienti (Aster, LCMH) un video di una sessione di firma massiva in MRAS per replicare fedelmente l'UX.

---

## 19. Domande aperte per Health.NET

- **Library UI**: Telerik ASP.NET AJAX (già usata in Health.NET) o pura HTML/jQuery?
- **Async pattern**: UpdatePanel classic o SignalR per progress realtime?
- **Encryption key condivisa**: definire chi è owner e dove è salvata (Key Vault? appsettings cifrato con DPAPI?)
- **Admin whitelist**: nuova tabella o campo boolean in `UsersDetails`?
- **Audit trail**: riusa tabella MRAS `SignatureAudit` o crea tabella dedicata Health.NET?

Da concordare con il PM prima di iniziare.

---

_Documento companion di `INTEGRAZIONE_NAMIRIAL_HEALTHNET.md`. Tutti i dettagli tecnici SOAP/DB sono in quel documento._
