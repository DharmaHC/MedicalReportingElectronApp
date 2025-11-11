# Guida Setup: Sistema Ristampa Referti

Guida completa per configurare e utilizzare il sistema di ristampa referti firmati.

## 📋 Panoramica

Il sistema è composto da:
1. **reprint-reports.html** - Pagina web standalone per la ricerca e ristampa
2. **API Endpoints** - Due endpoint backend per ricerca e download PDF

## 🚀 Setup Rapido

### Passo 1: Implementa gli Endpoint API

Segui le istruzioni in [API_ENDPOINTS_REPRINT.md](API_ENDPOINTS_REPRINT.md) per implementare:

1. `GET /api/reports/search` - Ricerca referti
2. `GET /api/reports/:id/pdf` - Download PDF

Scegli l'implementazione:
- **Node.js + Express** (esempio fornito)
- **ASP.NET Core** (esempio fornito)

### Passo 2: Abilita CORS

Configura CORS nell'API per permettere le chiamate dalla pagina HTML.

**Node.js + Express:**
```javascript
const cors = require('cors');
app.use(cors());
```

**ASP.NET Core:**
```csharp
builder.Services.AddCors(options => {
    options.AddPolicy("AllowAll", builder => {
        builder.AllowAnyOrigin()
               .AllowAnyMethod()
               .AllowAnyHeader();
    });
});
app.UseCors("AllowAll");
```

### Passo 3: Deploy Pagina HTML

#### Opzione A: Serve dalla Stessa API

Copia `reprint-reports.html` nella cartella pubblica dell'API:

**Node.js + Express:**
```javascript
// Serve static files
app.use(express.static('public'));

// Copia reprint-reports.html in: ./public/reprint-reports.html
```

**ASP.NET Core:**
```csharp
// In Program.cs
app.UseStaticFiles();

// Copia reprint-reports.html in: ./wwwroot/reprint-reports.html
```

Accedi: `http://your-api-server:5000/reprint-reports.html`

#### Opzione B: Server Web Separato

Puoi hostare `reprint-reports.html` su:
- **Apache/Nginx** - Copia il file nella document root
- **IIS** - Aggiungi a un sito web
- **Anche localmente** - Apri direttamente con un browser (configurando l'URL API)

### Passo 4: Configura URL API

Quando apri la pagina:
1. Nel campo "URL API Server", inserisci l'indirizzo della tua API
   - Esempio locale: `http://localhost:5000`
   - Esempio produzione: `https://api.example.com`
2. L'URL viene salvato automaticamente nel browser (localStorage)

---

## 🎯 Come Usare la Pagina

### 1. Apertura

Apri `reprint-reports.html` nel browser:
- Direttamente: `file:///percorso/reprint-reports.html`
- Tramite server: `http://server/reprint-reports.html`

### 2. Configurazione Iniziale

Nel campo **"URL API Server"**, inserisci l'indirizzo completo della tua API:
```
http://localhost:5000
```
o
```
https://api.medicalsystem.com
```

### 3. Ricerca Referto

1. **Numero Accesso Esterno**: Inserisci il numero di accesso (es: `ACC123456`)
2. **ID Paziente Esterno**: Inserisci l'ID paziente (es: `PAT789012`)
3. Clicca **"Cerca Referto"**

### 4. Risultati

La tabella mostrerà:
- Nome paziente
- Numero di accesso
- ID paziente
- Data di firma
- Dimensione PDF
- Stato (Firmato)

### 5. Azioni

Per ogni referto trovato:
- **👁️ Visualizza**: Apre il PDF in una nuova tab del browser
- **⬇️ Scarica**: Scarica il PDF sul computer

---

## 🗄️ Struttura Database

La pagina si aspetta che l'API interroghi una tabella `DigitalSignedReports` con:

```sql
CREATE TABLE DigitalSignedReports (
    ExamResultGUID UNIQUEIDENTIFIER PRIMARY KEY,
    PatientName NVARCHAR(255),
    ExternalAccessionNumber NVARCHAR(100),
    ExternalPatientID NVARCHAR(100),
    SignedDate DATETIME,
    SignedPdfData VARBINARY(MAX),

    -- Indice per velocizzare le ricerche
    INDEX IX_ExternalIds (ExternalAccessionNumber, ExternalPatientID)
);
```

---

## 🔧 Personalizzazione

### Cambiare Colori/Stile

Modifica il `<style>` nell'HTML:

```css
/* Cambia il gradiente principale */
body {
    background: linear-gradient(135deg, #YOUR_COLOR1 0%, #YOUR_COLOR2 100%);
}

/* Cambia il colore dei pulsanti */
.btn-primary {
    background: #YOUR_COLOR;
}
```

### Aggiungere Campi di Ricerca

Aggiungi nuovi input nel form:

```html
<div class="form-group">
    <label for="newField">Nuovo Campo</label>
    <input type="text" id="newField" placeholder="...">
</div>
```

Modifica la funzione `searchReports()` per includere il parametro.

### Personalizzare la Tabella

Modifica la funzione `displayResults()` per aggiungere/rimuovere colonne:

```javascript
<th>Nuova Colonna</th>
// ...
<td>${report.newField || 'N/A'}</td>
```

---

## 🔐 Sicurezza

### Versione Senza Autenticazione (Attuale)

La pagina attuale **non richiede autenticazione**. Adatta per:
- Uso interno (rete locale)
- Accesso controllato a livello di rete/firewall
- Ambienti di test

### Aggiungere Autenticazione (Opzionale)

Se vuoi proteggere gli endpoint:

#### 1. Backend - Aggiungi JWT Auth

```javascript
// Middleware di autenticazione
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Proteggi gli endpoint
router.get('/api/reports/search', authenticateToken, async (req, res) => {
    // ...
});
```

#### 2. Frontend - Aggiungi Login

Aggiungi un form di login prima della ricerca:

```html
<div id="loginForm">
    <input type="text" id="username" placeholder="Username">
    <input type="password" id="password" placeholder="Password">
    <button onclick="login()">Login</button>
</div>
```

```javascript
async function login() {
    const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

    const { token } = await response.json();
    localStorage.setItem('token', token);
}

// Aggiungi token alle richieste
const response = await fetch(url, {
    headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
});
```

---

## 🧪 Test e Debug

### Test Locali

1. **Avvia l'API Backend**:
   ```bash
   # Node.js
   npm start

   # .NET
   dotnet run
   ```

2. **Apri la pagina HTML**:
   ```bash
   # Direttamente nel browser
   open reprint-reports.html

   # O tramite server locale
   python -m http.server 8000
   # Poi: http://localhost:8000/reprint-reports.html
   ```

3. **Configura URL API**: `http://localhost:5000`

4. **Test ricerca** con dati reali dal database

### Debug

Apri **Developer Tools** (F12) per vedere:
- **Console**: Log ed errori JavaScript
- **Network**: Richieste HTTP e risposte
- **Application > Local Storage**: URL API salvato

### Errori Comuni

#### ❌ "CORS policy error"
**Soluzione**: Abilita CORS nell'API (vedi sopra)

#### ❌ "Failed to fetch"
**Soluzione**:
- Verifica che l'API sia avviata
- Controlla l'URL API nella pagina
- Verifica firewall/antivirus

#### ❌ "No reports found"
**Soluzione**:
- Verifica che i dati esistano nel database
- Controlla ExternalAccessionNumber e ExternalPatientID (case-sensitive?)
- Verifica la query SQL

#### ❌ "Cannot download PDF"
**Soluzione**:
- Verifica che SignedPdfData non sia NULL
- Controlla i permessi del database
- Verifica la conversione binario nel backend

---

## 📦 Deployment in Produzione

### 1. Checklist Pre-Deploy

- [ ] Endpoint API implementati e testati
- [ ] CORS configurato correttamente
- [ ] Database contiene dati di test
- [ ] Pagina HTML testata localmente
- [ ] URL di produzione configurato

### 2. Deploy Backend API

Segui il processo di deploy standard per la tua API.

### 3. Deploy Pagina HTML

**Opzione A - Stesso server API:**
```bash
# Copia nella cartella pubblica dell'API
cp reprint-reports.html /path/to/api/public/
```

**Opzione B - Server web separato:**
```bash
# Apache/Nginx
cp reprint-reports.html /var/www/html/

# IIS
cp reprint-reports.html C:\inetpub\wwwroot\
```

### 4. Configurazione SSL/HTTPS

Se l'API usa HTTPS, assicurati che anche la pagina sia servita via HTTPS per evitare errori "Mixed Content".

### 5. Test di Produzione

1. Apri la pagina in produzione
2. Configura URL API di produzione
3. Test completo di ricerca e download
4. Verifica con più browser (Chrome, Firefox, Safari, Edge)

---

## 📊 Monitoraggio

### Log delle Chiamate API

Aggiungi logging nell'API per tracciare:
```javascript
console.log(`Search request: ${externalAccessionNumber}, ${externalPatientId}`);
console.log(`PDF downloaded: ${reportId}`);
```

### Analytics (Opzionale)

Aggiungi Google Analytics o altro servizio:
```html
<!-- Nel <head> della pagina -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

---

## 🆘 Troubleshooting

### Problema: La pagina non comunica con l'API

**Possibili cause:**
1. URL API non configurato correttamente
2. CORS non abilitato
3. Firewall blocca le richieste
4. API non in esecuzione

**Soluzioni:**
```bash
# Verifica che l'API risponda
curl http://localhost:5000/api/reports/search?externalAccessionNumber=TEST&externalPatientId=TEST

# Controlla i log dell'API
# Controlla Developer Tools > Network nel browser
```

### Problema: PDF non si scarica

**Possibili cause:**
1. SignedPdfData è NULL nel database
2. Errore nella conversione VARBINARY → bytes
3. Header Content-Type non corretto

**Soluzioni:**
```sql
-- Verifica dati nel DB
SELECT
    ExamResultGUID,
    DATALENGTH(SignedPdfData) as PdfSize
FROM DigitalSignedReports
WHERE ExternalAccessionNumber = 'TEST'

-- PdfSize deve essere > 0
```

---

## 📞 Supporto

Per problemi o domande:
- **Repository**: [MedicalReportingElectronApp](https://github.com/DharmaHC/MedicalReportingElectronApp)
- **Email**: info@dharmahealthcare.net
- **Documentazione API**: [API_ENDPOINTS_REPRINT.md](API_ENDPOINTS_REPRINT.md)

---

## 🎉 Quick Start Checklist

- [ ] Leggi [API_ENDPOINTS_REPRINT.md](API_ENDPOINTS_REPRINT.md)
- [ ] Implementa i 2 endpoint API
- [ ] Abilita CORS
- [ ] Testa gli endpoint con cURL/Postman
- [ ] Deploy `reprint-reports.html`
- [ ] Apri la pagina nel browser
- [ ] Configura URL API
- [ ] Test ricerca e download
- [ ] Deploy in produzione
- [ ] Test finale

**Tempo stimato setup**: 30-60 minuti

Buon lavoro! 🚀
