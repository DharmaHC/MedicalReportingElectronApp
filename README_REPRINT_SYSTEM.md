# 📄 Sistema di Ristampa Referti Firmati

Sistema completo per la ricerca e ristampa di referti medici digitalmente firmati, accessibile tramite interfaccia web senza autenticazione.

## 🎯 Caratteristiche

✅ **Interfaccia Web Standalone** - Pagina HTML auto-contenuta, pronta all'uso
✅ **Nessuna Autenticazione Richiesta** - Accesso diretto (personalizzabile)
✅ **Ricerca per ExternalAccessionNumber e ExternalPatientId**
✅ **Visualizzazione e Download PDF** - Apri nel browser o scarica
✅ **Design Moderno e Responsive** - Funziona su desktop, tablet e mobile
✅ **Pronta per Produzione** - Codice ottimizzato e testato

---

## 📦 File Inclusi

| File | Descrizione |
|------|-------------|
| **[reprint-reports.html](reprint-reports.html)** | Pagina web standalone per ricerca e ristampa |
| **[API_ENDPOINTS_REPRINT.md](API_ENDPOINTS_REPRINT.md)** | Documentazione endpoint API con esempi di codice |
| **[REPRINT_SETUP_GUIDE.md](REPRINT_SETUP_GUIDE.md)** | Guida completa all'installazione e configurazione |
| **[TEST_DATA_REPRINT.sql](TEST_DATA_REPRINT.sql)** | Script SQL per creare dati di test |
| **[README_REPRINT_SYSTEM.md](README_REPRINT_SYSTEM.md)** | Questo file |

---

## 🚀 Quick Start (5 Minuti)

### 1. Implementa gli Endpoint API

Scegli il tuo stack tecnologico e segui l'esempio in [API_ENDPOINTS_REPRINT.md](API_ENDPOINTS_REPRINT.md):

**Node.js + Express:**
```javascript
router.get('/api/reports/search', async (req, res) => {
    const { externalAccessionNumber, externalPatientId } = req.query;
    // Query database e restituisci risultati
});

router.get('/api/reports/:id/pdf', async (req, res) => {
    // Recupera PDF dal database e invialo
});
```

**C# + ASP.NET Core:**
```csharp
[HttpGet("search")]
public async Task<IActionResult> SearchReports(
    string externalAccessionNumber,
    string externalPatientId) {
    // Query database e restituisci risultati
}

[HttpGet("{id}/pdf")]
public async Task<IActionResult> GetReportPdf(Guid id) {
    // Recupera PDF dal database e invialo
}
```

### 2. Abilita CORS

**Node.js:**
```javascript
const cors = require('cors');
app.use(cors());
```

**ASP.NET Core:**
```csharp
builder.Services.AddCors(options => {
    options.AddPolicy("AllowAll",
        builder => builder.AllowAnyOrigin()
                          .AllowAnyMethod()
                          .AllowAnyHeader());
});
app.UseCors("AllowAll");
```

### 3. Deploy Pagina HTML

Copia `reprint-reports.html` nella cartella pubblica dell'API:

```bash
# Node.js + Express
cp reprint-reports.html ./public/

# ASP.NET Core
cp reprint-reports.html ./wwwroot/

# Apache/Nginx
cp reprint-reports.html /var/www/html/

# IIS
cp reprint-reports.html C:\inetpub\wwwroot\
```

### 4. Testa!

1. Apri: `http://localhost:5000/reprint-reports.html`
2. Configura URL API: `http://localhost:5000`
3. Inserisci:
   - ExternalAccessionNumber: `ACC123456`
   - ExternalPatientId: `PAT789012`
4. Clicca **"Cerca Referto"**
5. Visualizza o scarica il PDF

---

## 📸 Screenshot Interfaccia

```
┌─────────────────────────────────────────────────┐
│  📄 Ristampa Referti Firmati                   │
│  Sistema di recupero e ristampa referti medici │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  URL API Server:                                │
│  ┌───────────────────────────────────────────┐ │
│  │ http://localhost:5000                     │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  🔍 Ricerca Referto                             │
│                                                  │
│  N° Accesso Esterno  │  ID Paziente  │  Azione │
│  ┌────────────────┐  │  ┌──────────┐ │  ┌────┐│
│  │ ACC123456      │  │  │ PAT78901 │ │  │🔍  ││
│  └────────────────┘  │  └──────────┘ │  └────┘│
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Risultati della Ricerca          1 risultato   │
├─────────────────────────────────────────────────┤
│ Paziente │ N° Accesso │ Data Firma │ Azioni    │
│ Rossi M. │ ACC123456  │ 11/01/2025 │ 👁️ ⬇️    │
└─────────────────────────────────────────────────┘
```

---

## 🗄️ Schema Database

La tabella `DigitalSignedReports` deve avere questa struttura:

```sql
CREATE TABLE DigitalSignedReports (
    ExamResultGUID UNIQUEIDENTIFIER PRIMARY KEY,
    PatientName NVARCHAR(255),
    ExternalAccessionNumber NVARCHAR(100),
    ExternalPatientID NVARCHAR(100),
    SignedDate DATETIME,
    SignedPdfData VARBINARY(MAX),

    INDEX IX_ExternalIds (ExternalAccessionNumber, ExternalPatientID)
);
```

---

## 🔧 Architettura

```
┌─────────────────┐
│   Browser       │
│  (User)         │
└────────┬────────┘
         │
         │ HTTP GET/POST
         ↓
┌─────────────────────────────────────────┐
│   reprint-reports.html                  │
│   - Form di ricerca                     │
│   - Chiamate AJAX                       │
│   - Visualizzazione risultati           │
└────────┬────────────────────────────────┘
         │
         │ Fetch API
         ↓
┌─────────────────────────────────────────┐
│   API Backend                           │
│   - GET /api/reports/search             │
│   - GET /api/reports/:id/pdf            │
└────────┬────────────────────────────────┘
         │
         │ SQL Query
         ↓
┌─────────────────────────────────────────┐
│   SQL Server Database                   │
│   - DigitalSignedReports Table          │
│     - ExternalAccessionNumber           │
│     - ExternalPatientID                 │
│     - SignedPdfData (VARBINARY)         │
└─────────────────────────────────────────┘
```

---

## 📋 API Endpoints

### 1. Search Reports

```
GET /api/reports/search
  ?externalAccessionNumber=ACC123456
  &externalPatientId=PAT789012
```

**Response:**
```json
[
  {
    "id": "guid-del-report",
    "patientName": "Rossi Mario",
    "externalAccessionNumber": "ACC123456",
    "externalPatientId": "PAT789012",
    "signedDate": "2025-01-15T10:30:00Z",
    "pdfSize": 524288
  }
]
```

### 2. Get PDF

```
GET /api/reports/{guid}/pdf
```

**Response:**
- Content-Type: `application/pdf`
- Binary PDF data

---

## 🧪 Test

### Test con dati fittizi

1. Esegui lo script: [TEST_DATA_REPRINT.sql](TEST_DATA_REPRINT.sql)
2. Usa questi valori di test:
   - **ExternalAccessionNumber**: `ACC123456`
   - **ExternalPatientId**: `PAT789012`

### Test con cURL

```bash
# Test search
curl "http://localhost:5000/api/reports/search?externalAccessionNumber=ACC123456&externalPatientId=PAT789012"

# Test PDF download
curl "http://localhost:5000/api/reports/{GUID}/pdf" -o test.pdf
```

---

## 🔐 Sicurezza

### Versione Attuale (Senza Autenticazione)

La pagina **non richiede autenticazione**. Adatta per:
- ✅ Uso su rete locale/intranet
- ✅ Accesso controllato tramite firewall
- ✅ Ambienti di test/sviluppo

### Aggiungere Autenticazione (Opzionale)

Se necessario, puoi aggiungere:
1. **Basic Auth** - Semplice username/password
2. **JWT** - Token-based authentication
3. **OAuth 2.0** - Single Sign-On
4. **Active Directory** - Integrazione aziendale

Vedi [REPRINT_SETUP_GUIDE.md](REPRINT_SETUP_GUIDE.md) per esempi di implementazione.

---

## 🎨 Personalizzazione

### Cambiare Logo/Colori

Modifica la sezione `<style>` in `reprint-reports.html`:

```css
/* Cambia i colori principali */
.btn-primary {
    background: #YOUR_COLOR;
}

body {
    background: linear-gradient(135deg, #COLOR1 0%, #COLOR2 100%);
}
```

### Aggiungere Campi

Puoi aggiungere campi di ricerca aggiuntivi:
- Data esame
- Tipo di esame
- Medico refertatore
- Centro di refertazione

Vedi [REPRINT_SETUP_GUIDE.md](REPRINT_SETUP_GUIDE.md) per dettagli.

---

## 📱 Compatibilità

| Browser | Supportato | Note |
|---------|-----------|------|
| Chrome  | ✅ | Completamente supportato |
| Firefox | ✅ | Completamente supportato |
| Safari  | ✅ | iOS 12+ |
| Edge    | ✅ | Chromium-based |
| IE 11   | ⚠️ | Richiede polyfills |

| Device  | Supportato | Note |
|---------|-----------|------|
| Desktop | ✅ | Ottimizzato |
| Tablet  | ✅ | Responsive |
| Mobile  | ✅ | Responsive |

---

## 🚀 Deployment

### Ambiente di Sviluppo

```bash
# 1. Avvia API
npm start  # o dotnet run

# 2. Apri pagina HTML
open reprint-reports.html
```

### Ambiente di Produzione

```bash
# 1. Deploy API su server
# 2. Copia pagina HTML nella cartella pubblica
cp reprint-reports.html /path/to/public/

# 3. Configura SSL/HTTPS
# 4. Testa accesso: https://your-domain.com/reprint-reports.html
```

---

## 🐛 Troubleshooting

### Problema: "CORS policy error"
**Soluzione**: Abilita CORS nell'API

### Problema: "Failed to fetch"
**Soluzione**: Verifica URL API e che il server sia avviato

### Problema: "No reports found"
**Soluzione**: Verifica dati nel database e query SQL

### Problema: "Cannot download PDF"
**Soluzione**: Verifica che SignedPdfData non sia NULL

Vedi [REPRINT_SETUP_GUIDE.md](REPRINT_SETUP_GUIDE.md) per troubleshooting completo.

---

## 📚 Documentazione Completa

| File | Contenuto |
|------|-----------|
| [API_ENDPOINTS_REPRINT.md](API_ENDPOINTS_REPRINT.md) | Implementazione endpoint API (Node.js, C#) |
| [REPRINT_SETUP_GUIDE.md](REPRINT_SETUP_GUIDE.md) | Guida completa setup e configurazione |
| [TEST_DATA_REPRINT.sql](TEST_DATA_REPRINT.sql) | Script per creare dati di test |

---

## 🎯 Checklist Completa

### Setup Iniziale
- [ ] Leggi [API_ENDPOINTS_REPRINT.md](API_ENDPOINTS_REPRINT.md)
- [ ] Implementa endpoint API
- [ ] Abilita CORS
- [ ] Esegui [TEST_DATA_REPRINT.sql](TEST_DATA_REPRINT.sql)
- [ ] Test endpoint con cURL/Postman

### Deploy
- [ ] Copia `reprint-reports.html` nella cartella pubblica
- [ ] Configura URL API nella pagina
- [ ] Test ricerca e download
- [ ] Verifica su più browser

### Produzione
- [ ] Setup SSL/HTTPS
- [ ] Test completo in produzione
- [ ] Monitora log API
- [ ] Documenta URL per gli utenti

---

## 📞 Supporto

Per problemi o domande:
- **Repository**: [MedicalReportingElectronApp](https://github.com/DharmaHC/MedicalReportingElectronApp)
- **Email**: info@dharmahealthcare.net

---

## 📝 Licenza

MIT License - Dharma Healthcare © 2025

---

## 🎉 Conclusione

Il sistema è pronto all'uso! Segui il **Quick Start** sopra per iniziare in 5 minuti.

**Tempo stimato setup completo**: 30-60 minuti

Buon lavoro! 🚀
