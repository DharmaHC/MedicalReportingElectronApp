# 🚀 Istruzioni Deploy: Sistema Ristampa Referti

Guida step-by-step per implementare il sistema di ristampa referti nel tuo progetto MedicalReportingAPI.

## ✅ Prerequisiti

Prima di iniziare, assicurati di avere:
- [ ] Progetto MedicalReportingAPI funzionante
- [ ] Accesso al database SQL Server
- [ ] Visual Studio o VS Code
- [ ] .NET 8.0 SDK installato

---

## 📋 PASSO 1: Copia il Controller nel Progetto

### 1.1 Trova la Cartella Controllers

Nel tuo progetto `MedicalReportingAPI`, localizza la cartella:
```
MedicalReportingAPI/
└── Controllers/
```

### 1.2 Copia il File Controller

1. Prendi il file: `ReprintReportsController.cs`
2. Copialo nella cartella `Controllers`
3. Il file sarà: `MedicalReportingAPI/Controllers/ReprintReportsController.cs`

### 1.3 Verifica il Namespace

Apri `ReprintReportsController.cs` e verifica che il namespace sia corretto:

```csharp
namespace MedicalReportingAPI.Controllers  // ✅ Deve corrispondere al namespace del tuo progetto
```

Se il namespace del tuo progetto è diverso (es: `YourCompany.MedicalReportingAPI`), aggiorna il namespace di conseguenza.

---

## 📋 PASSO 2: Abilita CORS

### 2.1 Trova il File Program.cs

Apri il file: `MedicalReportingAPI/Program.cs`

### 2.2 Aggiungi Configurazione CORS

**Cerca questa sezione nel file** (di solito all'inizio, dopo `var builder = WebApplication.CreateBuilder(args);`):

```csharp
// Existing services...
builder.Services.AddControllers();
builder.Services.AddDbContext<ApplicationDbContext>(...);
```

**Aggiungi subito dopo**:

```csharp
// ✅ AGGIUNGI QUESTO - Configurazione CORS per sistema ristampa
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReprintSystem", policy =>
    {
        policy.AllowAnyOrigin()        // Permette qualsiasi origine (per test)
              .AllowAnyMethod()        // Permette GET, POST, etc
              .AllowAnyHeader();       // Permette qualsiasi header
    });
});
```

### 2.3 Abilita CORS nel Middleware

**Cerca questa sezione** (di solito dopo `var app = builder.Build();`):

```csharp
// Existing middleware...
app.UseHttpsRedirection();
app.UseAuthorization();
```

**Aggiungi PRIMA di `app.UseAuthorization()`**:

```csharp
// ✅ AGGIUNGI QUESTO - Abilita CORS
app.UseCors("AllowReprintSystem");

// Existing middleware
app.UseAuthorization();
```

### 2.4 Esempio Completo Program.cs

Il tuo `Program.cs` dovrebbe assomigliare a questo:

```csharp
var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddControllers();
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// ✅ AGGIUNTO - CORS Configuration
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReprintSystem", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

// Configure middleware
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}

app.UseHttpsRedirection();

// ✅ AGGIUNTO - Enable CORS
app.UseCors("AllowReprintSystem");

app.UseAuthorization();
app.MapControllers();

app.Run();
```

---

## 📋 PASSO 3: Serve la Pagina HTML

### 3.1 Abilita File Statici

Nel file `Program.cs`, **aggiungi prima di `app.UseHttpsRedirection()`**:

```csharp
// ✅ AGGIUNGI QUESTO - Serve static files
app.UseStaticFiles();
```

### 3.2 Crea la Cartella wwwroot

Nella root del progetto `MedicalReportingAPI`, crea la cartella:
```
MedicalReportingAPI/
└── wwwroot/
```

### 3.3 Copia la Pagina HTML

1. Prendi il file: `reprint-reports.html`
2. Copialo nella cartella `wwwroot`
3. Il file sarà: `MedicalReportingAPI/wwwroot/reprint-reports.html`

### 3.4 Verifica File Properties

In Visual Studio:
1. Click destro su `reprint-reports.html`
2. Properties
3. **Build Action**: `Content`
4. **Copy to Output Directory**: `Copy if newer`

---

## 📋 PASSO 4: Configura Connection String

### 4.1 Trova appsettings.json

Apri: `MedicalReportingAPI/appsettings.json`

### 4.2 Verifica Connection String

Assicurati di avere una connection string valida:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=YOUR_SERVER;Database=YOUR_DATABASE;User Id=YOUR_USER;Password=YOUR_PASSWORD;TrustServerCertificate=True;"
  }
}
```

**Sostituisci**:
- `YOUR_SERVER` → Nome del server SQL (es: `localhost`, `192.168.1.100\\SQLEXPRESS`)
- `YOUR_DATABASE` → Nome database (es: `MedicalReportingDB`)
- `YOUR_USER` → Username SQL Server
- `YOUR_PASSWORD` → Password SQL Server

---

## 📋 PASSO 5: Testa l'API

### 5.1 Build del Progetto

In Visual Studio:
- **Build** → **Build Solution** (Ctrl+Shift+B)
- Verifica che non ci siano errori

In VS Code o Terminal:
```bash
cd MedicalReportingAPI
dotnet build
```

### 5.2 Avvia l'API

In Visual Studio:
- Premi **F5** o **Start Debugging**

In VS Code o Terminal:
```bash
dotnet run
```

### 5.3 Verifica URL

Dovresti vedere un output simile:
```
info: Microsoft.Hosting.Lifetime[14]
      Now listening on: https://localhost:5001
      Now listening on: http://localhost:5000
```

**Prendi nota dell'URL** (es: `http://localhost:5000` o `https://localhost:5001`)

---

## 📋 PASSO 6: Test con SQL Query

### 6.1 Esegui Test Query

1. Apri SQL Server Management Studio (SSMS)
2. Connettiti al database
3. Apri il file: `TEST_QUERY_REPRINT.sql`
4. **Sostituisci** `YourDatabaseName` con il nome reale del database
5. **Esegui la query** (F5)

### 6.2 Verifica Risultati

La query ti mostrerà:
- ✅ Combinazioni valide di `ExternalAccessionNumber` e `ExternalPatientId`
- ✅ `ReportId` (GUID) disponibili
- ✅ Dimensioni PDF

**Esempio output**:
```
ExternalAccessionNumber | ExternalPatientId | PatientName    | ReportId                              | PdfSize
ACC12345                | PAT67890          | Rossi Mario    | A1B2C3D4-E5F6-7890-ABCD-EF1234567890  | 524288
```

### 6.3 Prendi Nota dei Valori

Copia questi valori, li userai nel prossimo passo:
- **ExternalAccessionNumber**: es `ACC12345`
- **ExternalPatientId**: es `PAT67890`

---

## 📋 PASSO 7: Test della Pagina Web

### 7.1 Apri la Pagina

Nel browser, vai su:
```
http://localhost:5000/reprint-reports.html
```
oppure
```
https://localhost:5001/reprint-reports.html
```

### 7.2 Configura URL API

Nel campo **"URL API Server"**, inserisci:
```
http://localhost:5000
```
oppure
```
https://localhost:5001
```

(usa lo stesso URL con cui hai aperto la pagina)

### 7.3 Cerca un Referto

1. **Numero Accesso Esterno**: Inserisci il valore di `ExternalAccessionNumber` dalla query SQL
2. **ID Paziente Esterno**: Inserisci il valore di `ExternalPatientId` dalla query SQL
3. Clicca **"Cerca Referto"**

### 7.4 Verifica Risultati

Dovresti vedere:
- ✅ Una tabella con i referti trovati
- ✅ Pulsanti "Visualizza" e "Scarica"

### 7.5 Test Download PDF

1. Clicca sul pulsante **"Visualizza"** → Il PDF si apre in una nuova tab
2. Clicca sul pulsante **"Scarica"** → Il PDF viene scaricato sul computer

---

## 📋 PASSO 8: Deploy in Produzione

### 8.1 Publish del Progetto

In Visual Studio:
1. Click destro sul progetto `MedicalReportingAPI`
2. **Publish...**
3. Scegli il target (IIS, Azure, Folder, etc)
4. Segui il wizard di pubblicazione

In VS Code o Terminal:
```bash
dotnet publish -c Release -o ./publish
```

### 8.2 Deploy su IIS (Windows Server)

1. Copia la cartella `publish` sul server
2. Crea un nuovo Application Pool in IIS
3. Crea un nuovo sito web che punta alla cartella `publish`
4. Configura binding (porta 80 o 443)
5. Verifica che il file `web.config` sia presente

### 8.3 Configura URL di Produzione

Aggiorna `appsettings.Production.json` con:
- Connection string di produzione
- Altre configurazioni specifiche

### 8.4 Test di Produzione

1. Apri: `http://your-server.com/reprint-reports.html`
2. Configura URL API: `http://your-server.com`
3. Test completo di ricerca e download

---

## 📋 PASSO 9: Sicurezza (Opzionale)

### 9.1 Limitare CORS (Produzione)

In `Program.cs`, modifica la policy CORS per limitare le origini:

```csharp
// PRODUZIONE - Limita CORS solo al dominio specifico
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReprintSystem", policy =>
    {
        policy.WithOrigins("https://your-domain.com")  // ✅ Solo il tuo dominio
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});
```

### 9.2 Aggiungere Autenticazione (Opzionale)

Se vuoi proteggere gli endpoint, aggiungi al controller:

```csharp
[Authorize]  // ✅ Richiede autenticazione
[ApiController]
[Route("api/reports")]
public class ReprintReportsController : ControllerBase
{
    // ...
}
```

### 9.3 HTTPS Obbligatorio

In `Program.cs`, assicurati di avere:

```csharp
app.UseHttpsRedirection();  // ✅ Forza HTTPS
```

---

## 📋 PASSO 10: Monitoraggio e Log

### 10.1 Aggiungi Logging al Controller

Nel controller, inietta `ILogger`:

```csharp
private readonly ApplicationDbContext _context;
private readonly ILogger<ReprintReportsController> _logger;  // ✅ AGGIUNTO

public ReprintReportsController(
    ApplicationDbContext context,
    ILogger<ReprintReportsController> logger)  // ✅ AGGIUNTO
{
    _context = context;
    _logger = logger;  // ✅ AGGIUNTO
}
```

Usa il logger nei metodi:

```csharp
[HttpGet("search")]
public async Task<IActionResult> SearchReports(...)
{
    _logger.LogInformation("Search request: {AccessionNumber}, {PatientId}",
        externalAccessionNumber, externalPatientId);

    // ... rest of code
}
```

### 10.2 Configura Logging in appsettings.json

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "MedicalReportingAPI.Controllers.ReprintReportsController": "Debug"
    }
  }
}
```

---

## ✅ Checklist Finale

Prima di considerare il deploy completato, verifica:

### Backend
- [ ] `ReprintReportsController.cs` copiato in `Controllers/`
- [ ] CORS abilitato in `Program.cs`
- [ ] Static files abilitati in `Program.cs`
- [ ] Connection string configurata
- [ ] Progetto compila senza errori
- [ ] API avviata e raggiungibile

### Frontend
- [ ] `reprint-reports.html` copiato in `wwwroot/`
- [ ] Pagina accessibile via browser
- [ ] URL API configurato correttamente

### Database
- [ ] Query di test eseguita
- [ ] Dati di test disponibili
- [ ] ExternalAccessionNumber e ExternalPatientId validi trovati

### Funzionalità
- [ ] Ricerca referti funziona
- [ ] Visualizza PDF funziona
- [ ] Scarica PDF funziona
- [ ] Nessun errore in console browser
- [ ] Nessun errore nei log API

### Produzione (se applicabile)
- [ ] Deploy su server
- [ ] CORS configurato correttamente per produzione
- [ ] HTTPS abilitato
- [ ] URL di produzione funzionanti
- [ ] Test completo in produzione

---

## 🐛 Troubleshooting

### Errore: "CORS policy error"

**Causa**: CORS non abilitato o configurato male

**Soluzione**:
1. Verifica che `app.UseCors("AllowReprintSystem")` sia presente in `Program.cs`
2. Verifica che sia **PRIMA** di `app.UseAuthorization()`
3. Riavvia l'API

### Errore: "404 Not Found" per /api/reports/search

**Causa**: Controller non registrato o routing errato

**Soluzione**:
1. Verifica che `ReprintReportsController.cs` sia nella cartella `Controllers`
2. Verifica che `[ApiController]` e `[Route("api/reports")]` siano presenti
3. Ribuilda il progetto
4. Riavvia l'API

### Errore: "Cannot access reprint-reports.html"

**Causa**: Static files non abilitati o file non trovato

**Soluzione**:
1. Verifica che `app.UseStaticFiles()` sia presente in `Program.cs`
2. Verifica che `reprint-reports.html` sia in `wwwroot/`
3. Verifica properties del file (Build Action = Content)
4. Ribuilda il progetto

### Errore: "No reports found" nella ricerca

**Causa**: Dati non presenti o valori sbagliati

**Soluzione**:
1. Esegui `TEST_QUERY_REPRINT.sql` per trovare valori validi
2. Verifica che `ExternalAccessionNumber` e `ExternalPatientId` siano corretti
3. Verifica che i referti abbiano `Pdf IS NOT NULL`
4. Controlla i log dell'API per dettagli

### Errore: "Cannot download PDF"

**Causa**: PDF non presente o errore nel database

**Soluzione**:
1. Verifica che il campo `Pdf` non sia NULL nel database
2. Controlla i log dell'API per errori specifici
3. Verifica i permessi del database

---

## 📞 Supporto

Per problemi o domande:
- **Repository**: [MedicalReportingElectronApp](https://github.com/DharmaHC/MedicalReportingElectronApp)
- **Email**: info@dharmahealthcare.net
- **Documentazione Completa**:
  - [API_ENDPOINTS_REPRINT.md](API_ENDPOINTS_REPRINT.md)
  - [REPRINT_SETUP_GUIDE.md](REPRINT_SETUP_GUIDE.md)
  - [README_REPRINT_SYSTEM.md](README_REPRINT_SYSTEM.md)

---

## 🎉 Conclusione

Se hai completato tutti i passi, il sistema di ristampa referti è pronto!

**Tempo stimato**: 30-60 minuti per il setup completo

Buon lavoro! 🚀
