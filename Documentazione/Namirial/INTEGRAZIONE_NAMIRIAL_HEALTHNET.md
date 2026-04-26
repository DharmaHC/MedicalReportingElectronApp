# Integrazione Firma Remota Namirial su Health.NET (legacy)

Documento di handover per l'implementazione della firma remota Namirial nel gestionale legacy **Health.NET**, riutilizzando la stessa infrastruttura SWS già deployata per **MedReportAndSign** (MRAS).

Il DB è condiviso: tabelle anagrafiche medici, utenti, configurazione firma sono già popolate. Serve solo il codice lato Health.NET per leggere la configurazione, chiamare SWS ed apporre la firma.

---

## 1. Architettura generale

```
Health.NET (WebForms ASP.NET 4.x, VB.NET/C#)
    │
    │  lookup medico + config firma
    ▼
SQL Server "Health.NET_Data_Aster"
    - UsersDetails (join su aspnet_Users)
    - [Health.NET_PersonalizationPerUser]
    - Doctors
    │
    ├─► credenziali firma (CodCertRHI, PinCodeRHI cifrato)
    │
    ▼
SOAP Client → SWS on-premises
    http://20.13.149.101:8080/SignEngineWeb/sign-services
    │
    │  mTLS client cert → HSM Namirial
    ▼
https://fra.firmacerta.it/ExtendedSignature/services
```

Nessun impatto su MRAS: il DB è condiviso ma le tabelle di config (`[Health.NET_PersonalizationPerUser]`) hanno un record per ogni UserId. Un medico ha **due UserId** (vedi §3): uno del membership provider legacy (`aspnet_Users`) e uno del provider Identity nuovo (`AspNetUsers`). Attualmente esistono due record PPU identici, uno per UserId. Health.NET userà il GUID da `aspnet_Users`.

---

## 2. Autenticazione utenti in Health.NET

Health.NET usa il **ASP.NET Membership Provider legacy** (tabella `aspnet_Users`), non ASP.NET Identity. L'utente è identificato da `aspnet_Users.UserName = <codice fiscale>`.

Esempio: Dr. Frisone
- `aspnet_Users.UserName = 'FRSRFL72R25H282U'`
- `aspnet_Users.UserId = '660xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'` (GUID)

Il GUID di `aspnet_Users` è **diverso** dal GUID di `AspNetUsers` per lo stesso CF — questo è atteso. Per Health.NET serve solo il primo.

---

## 3. Pattern "dual user" nel DB condiviso

Il DB ha due tabelle utente:

| Tabella | Uso | Esempio chiave |
|---------|-----|----------------|
| `aspnet_Users` | Legacy Membership (Health.NET) | `UserId` GUID, `UserName` = CF |
| `AspNetUsers` | Identity (MRAS) | `Id` GUID, `UserName` = CF |

Per ogni medico esistono **due UserId diversi** (uno per tabella). La config firma è replicata su **entrambi i GUID** nella tabella `[Health.NET_PersonalizationPerUser]` (PK su UserId).

Per Health.NET la lookup è:
```sql
-- 1. Trova UserId membership legacy
SELECT UserId FROM aspnet_Users WHERE UserName = @CodiceFiscale
-- 2. Config firma per quell'UserId
SELECT * FROM [Health.NET_PersonalizationPerUser] WHERE UserId = @UserId
```

**Importante**: se modifichi la config firma lato Health.NET, sincronizza su **entrambi** i record PPU (il GUID di `aspnet_Users` e il GUID di `AspNetUsers`), altrimenti MRAS vede dati non aggiornati.

Vedi §11 per lo script di sincronizzazione.

---

## 4. Tabelle DB rilevanti

### 4.1 `Doctors`

| Campo | Note |
|-------|------|
| `DoctorCode` | PK, es. `RFRIS` |
| `FullName` | Nome completo per la dicitura firma |
| `AllowMedicalReportDigitalSign` | **bit**. Se `0` non mostrare il pulsante firma |

### 4.2 `UsersDetails`

FK `UserId` → `aspnet_Users.UserId`.

| Campo | Note |
|-------|------|
| `UserId` | GUID di `aspnet_Users` |
| `TaxCode` | Codice fiscale (ridondante con `aspnet_Users.UserName`) |
| `DoctorCode` | FK verso `Doctors.DoctorCode` |
| `SignatureType` | `'otp'` oppure `'automatic'` |

Questa tabella collega `aspnet_Users` (auth) a `Doctors` (anagrafica) tramite `DoctorCode`.

### 4.3 `[Health.NET_PersonalizationPerUser]` — **la tabella firma**

Attenzione: il nome ha il punto, va sempre racchiuso tra `[` `]`.

| Campo | Cifrato? | Note |
|-------|----------|------|
| `UserId` | - | PK. GUID utente (sia da `aspnet_Users` che da `AspNetUsers`) |
| `SignatureType` | no | `'otp'` (RHI) oppure `'automatic'` (AHI) |
| `RemoteSignProvider` | no | `'NAMIRIAL'` |
| `CodCertRHI` | **no** (plaintext) | Codice dispositivo RHI, es. `RHIP26011648243800` |
| `PinCodeRHI` | **sì, AES-256** | PIN del dispositivo RHI |
| `RemoteSignUsername` | no | Codice AHI (firma automatica). Non usato per RHI |
| `RemoteSignPasswordEncrypted` | sì | Password AHI. Non usato per RHI |
| `RemoteSignPinEncrypted` | sì | PIN AHI. Non usato per RHI |

Per la firma RHI con OTP (caso d'uso principale Health.NET) servono solo `CodCertRHI` + `PinCodeRHI` + `SignatureType='otp'` + `RemoteSignProvider='NAMIRIAL'`.

---

## 5. Cifratura dei PIN

Gli encryption service in MRAS usano **AES-256-GCM** con chiave in `appsettings.json`:

```json
{
  "Encryption": {
    "Key": "<base64-encoded-256bit-key>"
  }
}
```

Health.NET **deve usare la stessa chiave** di MRAS per poter decifrare `PinCodeRHI`. Altrimenti il PIN salvato da una app non è leggibile dall'altra.

Il codice C# di reference è in `MedicalReportingAPI/Services/EncryptionService.cs`. Se serve riuso, estrai il servizio in una libreria condivisa oppure duplica la logica.

**Formato del campo cifrato**: stringa base64. Non c'è prefisso, non c'è versioning. Se mai introduci una seconda versione di crittografia, aggiungi un prefisso tipo `v2:`.

---

## 6. Server SWS

### 6.1 Accesso

- **URL SOAP**: `http://20.13.149.101:8080/SignEngineWeb/sign-services`
- **WSDL**: `http://20.13.149.101:8080/SignEngineWeb/sign-services?wsdl`
- **Health**: `http://20.13.149.101:8080/actuator/health` → `{"status":"UP"}`
- **OpenAPI**: `http://20.13.149.101:8080/openapi`

Il server è sulla VPN aziendale (rete 20.13.0.0/16 via Azure). La porta 8080 è aperta anche su Internet (firewall UFW). Auth SOAP: **nessuna** a livello trasporto (HTTP plain). L'autenticazione avviene a livello applicativo con `username + password + otp` nella busta SOAP.

### 6.2 SSH al server

- Host: `20.13.149.101`
- User: `dharma`
- Password: `nMAGGIO2017_dhc@!3` (solo via chiave in alcuni account; richiedi chiave SSH per automazioni)
- Docker container: `sws` (image `namirial/sws:latest`)
- Restart policy: `unless-stopped` (si riavvia automaticamente dopo reboot server)

Comandi utili:
```bash
ssh dharma@20.13.149.101
docker ps --filter name=sws
docker logs sws --tail 100
docker restart sws
```

### 6.3 File di configurazione SWS

Sul container, mount di `/opt/sws/custom`:

- `/opt/sws/custom/custom.properties` — config Spring Boot (verifier URL, keystore path)
- `/opt/sws/custom/keystore/prod_keystore.jks` — **client cert mTLS** per parlare con HSM Namirial
  - Alias: `sws_dharmahealthcare`
  - Password keystore: `foo123`
  - Subject: `CN=DHARMAHEALTHCARE, OU=Namirial Firma Automatica Remota, O=Namirial S.p.A./02046570426, C=IT`
  - Validità: 2026-03-19 → 2032-10-12
  - **Rinnovo**: contattare Namirial qualche mese prima della scadenza

### 6.4 SLA e monitoraggio

- Nessun SLA formale — è un container Docker su VM Azure.
- **Restart policy `unless-stopped`** → si riavvia da solo al boot del server.
- Eventuale downtime → health check da monitoring esterno (UptimeRobot consigliato).

---

## 7. Flusso firma RHI (OTP) — step-by-step

### 7.1 UI: modale inserimento OTP

Quando il medico clicca "Firma":
1. Leggi `CodCertRHI` e `PinCodeRHI` (decifrato) dalla PPU
2. Mostra modale con campo OTP (6 cifre). **Focus automatico sulla textbox**, **Enter** = Conferma, **Escape** = Annulla
3. Passa l'OTP al servizio backend

### 7.2 Backend: chiamate SOAP al SWS

Il WSDL è in `http://20.13.149.101:8080/SignEngineWeb/sign-services?wsdl`. Puoi generare la classe proxy con `svcutil` (WCF) o `wsdl.exe` (per .NET Framework legacy).

Alternativa: costruire direttamente la busta SOAP (più semplice, zero dipendenze). Namespace: `http://service.ws.nam/`.

#### Step 1: `getOTPList` — ottieni l'idOtp

**Critico**: il WSDL dichiara `idOtp` come `xs:int` obbligatorio. Se non lo passi o passi `0`, il server risponde `1001 Dispositivo OTP non esistente a sistema`.

Soluzione: prima di tutto chiama `getOTPList` per recuperare la lista dei dispositivi OTP associati al RHI, e usa l'`idOtp` del dispositivo preferito (priorità: `OTP GENERATOR` > `SMS` > `OTP PUSH`).

```xml
POST /SignEngineWeb/sign-services
Content-Type: text/xml;charset=UTF-8
SOAPAction: ""

<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ser="http://service.ws.nam/">
  <soapenv:Body>
    <ser:getOTPList>
      <credentials>
        <idOtp>0</idOtp>
        <username>RHIP26011648243800</username>
        <password>PIN_DECRYPTED</password>
      </credentials>
    </ser:getOTPList>
  </soapenv:Body>
</soapenv:Envelope>
```

Risposta:
```xml
<return><idOtp>230099040</idOtp><serialNumber>...</serialNumber><type>OTP GENERATOR</type></return>
<return><idOtp>230156094</idOtp><serialNumber>...</serialNumber><type>SMS</type></return>
<return><idOtp>230099043</idOtp><serialNumber>...</serialNumber><type>OTP PUSH</type></return>
```

Scegli `OTP GENERATOR` se presente (è quello usato dall'app Namirial Sign sul telefono), altrimenti `SMS`, altrimenti il primo.

#### Step 2: `openSession` — apri sessione 3 minuti

```xml
<ser:openSession>
  <credentials>
    <idOtp>230099040</idOtp>
    <otp>086153</otp>
    <password>PIN_DECRYPTED</password>
    <username>RHIP26011648243800</username>
  </credentials>
</ser:openSession>
```

Risposta: il sessionKey è una stringa base64 direttamente in `<return>`, **non** in un oggetto strutturato:

```xml
<return>a0beem8FYDGMiDbGhMpCVaiHbJ5Jy1IulSItw...==</return>
```

La sessione dura **180 secondi**. Puoi verificare il tempo residuo con `getRemainingTimeForSession`.

#### Step 3: `signPAdES` — firma il PDF

**Critico — undocumented**: anche quando usi `sessionKey`, il server on-premises richiede il campo `password` (il PIN) nella busta. Senza il PIN, torna `Errore Generico` (codice 1). Questo **non è documentato** da Namirial, ma riprodotto empiricamente in §12.

```xml
<ser:signPAdES>
  <credentials>
    <idOtp>0</idOtp>
    <username>RHIP26011648243800</username>
    <password>PIN_DECRYPTED</password>
    <sessionKey>a0beem8FYDGM...</sessionKey>
  </credentials>
  <buffer>{PDF_BASE64}</buffer>
  <PAdESPreferences>
    <hashAlgorithm>SHA256</hashAlgorithm>
    <level>B</level>
    <signType>0</signType>
    <withTimestamp>false</withTimestamp>
  </PAdESPreferences>
</ser:signPAdES>
```

Risposta: `<return>` contiene il PDF firmato in base64.

#### Step 4: `closeSession` (best effort)

```xml
<ser:closeSession>
  <credentials>
    <idOtp>0</idOtp>
    <sessionKey>a0beem8FYDGM...</sessionKey>
    <username>RHIP26011648243800</username>
  </credentials>
</ser:closeSession>
```

La sessione scade comunque da sola dopo 3 minuti, ma chiuderla libera risorse sul server e sull'HSM.

### 7.3 Firma batch (più referti nella stessa sessione)

Con una sola sessione puoi firmare N referti entro i 180 secondi. Due accortezze:

1. **Concurrency = 1**: l'HSM Namirial NON supporta firma concorrente sulla stessa sessionKey. Se chiami `signPAdES` in parallelo, ottieni `Errore Generico`. Usa un worker seriale.
2. **Watchdog scadenza**: prima di ogni `signPAdES`, controlla il tempo residuo con `getRemainingTimeForSession`. Se <10 secondi, rigenera la sessione (nuovo OTP dall'utente).

---

## 8. Codici errore SWS ricorrenti

| Codice | Messaggio | Significato |
|--------|-----------|-------------|
| `1001` | Dispositivo OTP non esistente a sistema | `idOtp` non corrisponde a nessun dispositivo (spesso 0 = default) |
| `4` | Credenziali errate | username/password errati |
| `44` | Codice OTP errato, riprovare | OTP sbagliato o scaduto |
| `69` | Session key scaduta | Sono passati più di 180s dall'openSession |
| `1` | Errore Generico | Spesso: password mancante in signPAdES con sessionKey on-premises. Vedi §12 |

**Fault SOAP standard**: vengono restituiti come `<soap:Fault>` con `<faultstring>` e `<detail><ns2:WSException><error><message>`.

---

## 9. Apposizione dicitura firma nel PDF

MRAS aggiunge una stringa tipo:

> _Referto firmato digitalmente ai sensi del D.Lgs. n. 82/2005 e successive modifiche da {signedBy} in data: {date}_

Template in `sign-settings.json` (`signatureTextLine1`, `signatureTextLine2`).

**Strategia consigliata per Health.NET**:

1. Decora il PDF (logo + footer) prima della firma
2. Aggiungi la dicitura con un renderer PDF (PdfSharp / iTextSharp)
3. Invia a `signPAdES`
4. Il PDF restituito ha già la firma PAdES crittografica + la dicitura visiva

Variabili del template:
- `{signedBy}` → `Doctors.FullName` (**non** il codice RHI)
- `{date}` → formato `gg/mm/aaaa HH:mm` o `gg/mm/aaaa` (configurabile)

Errore classico: passare `CodCertRHI` invece di `Doctors.FullName` in `{signedBy}`. Il PDF finale mostra `RHIP26011648243800` al posto del nome del medico.

---

## 10. Differenze RHI vs AHI

Caso d'uso principale Health.NET: **RHI con OTP interattivo**. Documentato anche AHI per completezza.

| Modalità | Device prefix | OTP | Scenario |
|----------|--------------|-----|----------|
| RHI | `RHIP*` | Sì, per ogni sessione | Firma singola o piccole batch con medico presente |
| AHI | `AHIP*` / `AHI*` | No | Firma automatica unattended (es. batch notturno) |

Per AHI, l'`openSession` funziona con solo `username + password` (niente OTP, niente `idOtp`). Il resto è identico.

---

## 11. Script di sincronizzazione dual-user

Se modifichi la config firma nel DB da Health.NET (legacy), ricordati di replicare il record anche sul GUID di `AspNetUsers` per mantenere MRAS allineato:

```sql
-- Sincronizza PPU da legacy (aspnet_Users) a Identity (AspNetUsers)
MERGE [Health.NET_PersonalizationPerUser] AS target
USING (
    SELECT a_new.Id AS NewId, p.*
    FROM [Health.NET_PersonalizationPerUser] p
    INNER JOIN UsersDetails ud ON ud.UserId = p.UserId      -- legacy
    INNER JOIN AspNetUsers a_new ON a_new.UserName = ud.TaxCode
    WHERE p.UserId IN (SELECT UserId FROM aspnet_Users)     -- solo record legacy
) AS src
ON target.UserId = src.NewId
WHEN MATCHED THEN UPDATE SET
    SignatureType = src.SignatureType,
    RemoteSignProvider = src.RemoteSignProvider,
    CodCertRHI = src.CodCertRHI,
    PinCodeRHI = src.PinCodeRHI,
    RemoteSignUsername = src.RemoteSignUsername,
    RemoteSignPasswordEncrypted = src.RemoteSignPasswordEncrypted,
    RemoteSignPinEncrypted = src.RemoteSignPinEncrypted
WHEN NOT MATCHED THEN INSERT
    (UserId, SignatureType, RemoteSignProvider, CodCertRHI, PinCodeRHI,
     RemoteSignUsername, RemoteSignPasswordEncrypted, RemoteSignPinEncrypted)
VALUES
    (src.NewId, src.SignatureType, src.RemoteSignProvider, src.CodCertRHI, src.PinCodeRHI,
     src.RemoteSignUsername, src.RemoteSignPasswordEncrypted, src.RemoteSignPinEncrypted);
```

In alternativa: triggers DB che replicano automaticamente la scrittura. Valuta tu.

---

## 12. Gotcha e bug risolti (da non ripetere)

Raccolta empirica, costata sangue:

### 12.1 `idOtp` mandatorio nella busta

WSDL dichiara `idOtp` come `xs:int` senza `minOccurs="0"`. Se il SOAP client JavaScript/Python/C# lo omette, il server lo legge come `0` (default Java int) e **qualsiasi utente RHI** ottiene `1001 Dispositivo OTP non esistente a sistema`.

→ **Chiamare `getOTPList` prima di `openSession`** per risolvere l'idOtp corretto.

### 12.2 `password` mandatoria in `signPAdES` anche con `sessionKey`

**Undocumented**. Empirico: SWS on-premises (versione 3.0.10.2) richiede `<password>` (il PIN) nella busta `signPAdES` anche quando stai già usando una `sessionKey` ottenuta da `openSession`. Se ometti la password, torna `Errore Generico (1)`.

→ Passa **sempre** anche il PIN decifrato oltre alla sessionKey.

### 12.3 Concorrenza sessione HSM

L'HSM Namirial **non permette** due `signPAdES` concorrenti sulla stessa sessionKey. Devi serializzare (worker pool con `concurrency = 1`).

### 12.4 Parsing `sessionKey`

`openSession` ritorna:
```xml
<return>stringBase64...</return>
```

`result.return` è **la stringa diretta**, non un oggetto `{sessionKey: ...}`. Alcuni client SOAP parsano male questo caso. Verifica `typeof result.return === 'string' && result.return.length > 20`.

### 12.5 Dual user e `SingleOrDefaultAsync`

Il backend MRAS fa:
```csharp
var ud = await _context.UsersDetails
    .Where(x => x.TaxCode == userName).SingleOrDefaultAsync();
```

Se ci sono **due record** `UsersDetails` per lo stesso `TaxCode` (es. dopo una migrazione che ha creato il nuovo UserId), `SingleOrDefaultAsync` lancia eccezione e `userInfo.DoctorFullName` resta null → la dicitura firma mostra `username` invece del nome medico.

→ Usa `FirstOrDefaultAsync` + ordering per scegliere il record deterministico. Oppure garantisci unique constraint su `(TaxCode)`.

### 12.6 Docker `restart: no`

Il container SWS originale era senza restart policy. Al primo reboot del server, il servizio non ripartiva e tutti i medici ricevevano `ECONNREFUSED`.

→ Già sistemato con `docker update --restart unless-stopped sws`. Verifica periodicamente che non torni a `no` dopo un redeploy.

### 12.7 DB: filtro refertati su `IsComplete` inaffidabile

La SP `_HealthNET_GetFilteredExaminations` filtrava i refertati su `EE.IsComplete`, ma la firma non aggiornava quel flag → referti già firmati continuavano a comparire nella worklist "Da refertare".

→ Già sistemato: la SP ora filtra anche `NOT EXISTS (DigitalSignedReports con ExaminationState IN (5, 7))`. Se aggiorni la SP, mantieni questo check.

---

## 13. Come testare senza scomodare un medico

### 13.1 Health check rapido

```bash
curl -s http://20.13.149.101:8080/actuator/health
# {"status":"UP"}
```

### 13.2 Test end-to-end con curl

Serve: codice RHI, PIN, OTP fresco (6 cifre dall'app Namirial Sign).

```bash
# 1. getOTPList
curl -X POST "http://20.13.149.101:8080/SignEngineWeb/sign-services" \
  -H "Content-Type: text/xml;charset=UTF-8" -H 'SOAPAction: ""' \
  -d '<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.ws.nam/"><soapenv:Body><ser:getOTPList><credentials><idOtp>0</idOtp><username>RHIP26011648243800</username><password>PIN_QUI</password></credentials></ser:getOTPList></soapenv:Body></soapenv:Envelope>'

# 2. openSession (con OTP fresco)
# 3. signPAdES con sessionKey + password
# 4. closeSession
```

Test reference nel repo: `MedReportAndSign/src/main/remoteSign/providers/NamirialRemoteSignProvider.ts`.

### 13.3 Credenziali demo (se servono per sviluppo isolato)

Sandbox Namirial SaaS: chiedere a Namirial l'account di test. Username tipicamente `DEMO` + password temporanea. **Non sono su questo SWS on-premises**: richiedono SaaS `sws-companynamesaas.test.namirialtsp.com` + mTLS p12 di test (in `Documentazione/Namirial/sws_saas_COMPANYNAMESaaS_test.p12`, password `V9x^2G0e6*`).

---

## 14. Checklist implementazione Health.NET

Milestone minima per la firma singola RHI:

- [ ] Libreria condivisa (o duplicazione) di `EncryptionService` — stessa chiave AES di MRAS
- [ ] Lookup utente loggato → `aspnet_Users.UserId` → `UsersDetails` → `Doctors` + `[Health.NET_PersonalizationPerUser]`
- [ ] Pulsante "Firma" abilitato solo se `Doctors.AllowMedicalReportDigitalSign = 1` e `SignatureType = 'otp'` e `CodCertRHI IS NOT NULL` e `PinCodeRHI IS NOT NULL`
- [ ] Modale inserimento OTP (focus automatico, Enter conferma)
- [ ] Client SOAP (scegli: proxy generato da WSDL oppure busta XML manuale)
- [ ] `getOTPList` → scegli idOtp (GENERATOR preferito)
- [ ] `openSession` → sessionKey
- [ ] Decora PDF (logo + footer Health.NET) + aggiungi dicitura firma con `Doctors.FullName`
- [ ] `signPAdES` con credentials completi (username + password + sessionKey + idOtp)
- [ ] Salva PDF firmato nel DB (`DigitalSignedReports.Pdf`, `ExaminationState = 5`, `SigningUser = DoctorCode`)
- [ ] Aggiorna `ExamResults.StateId = 8` per tutti i `ResultsIds` collegati
- [ ] `closeSession` (best effort)
- [ ] Gestione errori: 1001, 4, 44, 69, 1 → messaggi utente chiari
- [ ] Log sessione firma (audit trail) — vedi §15

Milestone estesa:
- [ ] Firma massiva (batch) con worker `concurrency = 1`
- [ ] Watchdog scadenza sessione
- [ ] Riordinamento UI persistente se pertinente
- [ ] Fallback AHI automatico se configurato

---

## 15. Audit trail D.Lgs. 82/2005

MRAS salva ogni firma in tabella `SignatureAudit`. Columns: `DigitalReportId`, `DoctorCode`, `SignatureType` (`LOCAL_PKCS11` / `REMOTE_OTP` / `REMOTE_AUTO`), `Provider` (`NAMIRIAL`), `CertificateCN` (`CodCertRHI`), `Outcome` (`SUCCESS` / `FAILED` / `BYPASSED`), `Timestamp`.

Per Health.NET replica lo stesso schema (o riusa la tabella esistente se il DB è condiviso). È obbligatorio per la conformità D.Lgs. 82/2005.

---

## 16. Riferimenti al codice MRAS

Il codice TypeScript del provider Namirial in MRAS è la sorgente verità per il protocollo SOAP:

- `src/main/remoteSign/providers/NamirialRemoteSignProvider.ts` — client SOAP completo
- `src/main/remoteSign/remoteSignIpcHandlers.ts` — orchestrazione firma singola/batch
- `src/main/signPdfService.ts` — decorazione PDF + dicitura firma
- `MedicalReportingAPI/Controllers/AccountController.cs` (line ~780) — lookup config firma per utente

Quando sei in dubbio su un campo SOAP, leggi `NamirialRemoteSignProvider.ts`: è passato attraverso debug remoto in produzione ed è affidabile.

---

## 17. Contatti

- **Team MRAS / infra SWS**: info@dharmahealthcare.net
- **Supporto Namirial**: assistenza@namirial.com (per rinnovo cert, nuovi dispositivi RHI, provisioning HSM)
- **Voucher Namirial attivazione dispositivi**: richiedere a Namirial tramite referente commerciale

---

_Documento generato per handover integrazione Namirial su Health.NET. Aggiornare dopo ogni bug risolto o cambio architetturale._
