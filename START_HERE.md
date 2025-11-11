# 🚀 START HERE - Sistema Ristampa Referti

## 📦 File da Usare per il Deploy

### 1️⃣ **FILE DA COPIARE NEL BACKEND**

| File | Destinazione | Descrizione |
|------|--------------|-------------|
| **[ReprintReportsController.cs](ReprintReportsController.cs)** | `MedicalReportingAPI/Controllers/` | Controller pronto per il deploy |
| **[reprint-reports.html](reprint-reports.html)** | `MedicalReportingAPI/wwwroot/` | Pagina web per ristampa |

### 2️⃣ **FILE PER TEST E VERIFICA**

| File | Uso | Descrizione |
|------|-----|-------------|
| **[TEST_QUERY_REPRINT.sql](TEST_QUERY_REPRINT.sql)** | Eseguire in SQL Server | Trova valori di test validi |

### 3️⃣ **DOCUMENTAZIONE**

| File | Quando Leggerlo |
|------|-----------------|
| **[DEPLOY_INSTRUCTIONS_STEP_BY_STEP.md](DEPLOY_INSTRUCTIONS_STEP_BY_STEP.md)** | **INIZIA DA QUI** - Guida completa passo-passo |
| [API_ENDPOINTS_REPRINT.md](API_ENDPOINTS_REPRINT.md) | Riferimento tecnico API |
| [REPRINT_SETUP_GUIDE.md](REPRINT_SETUP_GUIDE.md) | Guida setup avanzata |
| [README_REPRINT_SYSTEM.md](README_REPRINT_SYSTEM.md) | Panoramica sistema |

---

## ⚙️ Settings da Configurare

### SETTING 1: Program.cs - Abilita CORS

**File**: `MedicalReportingAPI/Program.cs`

**Aggiungi DOPO `builder.Services.AddDbContext(...)`**:

```csharp
// ✅ AGGIUNGI QUESTO
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReprintSystem", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});
```

**Aggiungi PRIMA di `app.UseAuthorization()`**:

```csharp
// ✅ AGGIUNGI QUESTO
app.UseCors("AllowReprintSystem");
```

---

### SETTING 2: Program.cs - Abilita Static Files

**File**: `MedicalReportingAPI/Program.cs`

**Aggiungi PRIMA di `app.UseHttpsRedirection()`**:

```csharp
// ✅ AGGIUNGI QUESTO
app.UseStaticFiles();
```

---

### SETTING 3: Connection String

**File**: `MedicalReportingAPI/appsettings.json`

**Verifica che sia corretta**:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=YOUR_SERVER;Database=YOUR_DATABASE;User Id=YOUR_USER;Password=YOUR_PASSWORD;TrustServerCertificate=True;"
  }
}
```

**Sostituisci**:
- `YOUR_SERVER` → Il tuo server SQL
- `YOUR_DATABASE` → Il tuo database
- `YOUR_USER` → Username SQL
- `YOUR_PASSWORD` → Password SQL

---

## 🎯 Quick Start (5 Minuti)

### Passo 1: Copia i File

```bash
# Controller
Copia: ReprintReportsController.cs
  → In: MedicalReportingAPI/Controllers/

# Pagina HTML
Copia: reprint-reports.html
  → In: MedicalReportingAPI/wwwroot/
```

### Passo 2: Modifica Program.cs

Apri `MedicalReportingAPI/Program.cs` e aggiungi i 3 settings sopra.

### Passo 3: Build e Avvia

```bash
cd MedicalReportingAPI
dotnet build
dotnet run
```

### Passo 4: Trova Dati di Test

1. Apri SQL Server Management Studio
2. Esegui: `TEST_QUERY_REPRINT.sql`
3. Copia `ExternalAccessionNumber` e `ExternalPatientId`

### Passo 5: Testa la Pagina

1. Apri: `http://localhost:5000/reprint-reports.html`
2. Inserisci i valori dal passo 4
3. Clicca "Cerca Referto"
4. Test "Visualizza" e "Scarica"

---

## 📋 Checklist Rapida

Prima di iniziare:
- [ ] Ho letto [DEPLOY_INSTRUCTIONS_STEP_BY_STEP.md](DEPLOY_INSTRUCTIONS_STEP_BY_STEP.md)

Durante il deploy:
- [ ] Copiato `ReprintReportsController.cs` in `Controllers/`
- [ ] Copiato `reprint-reports.html` in `wwwroot/`
- [ ] Aggiunto CORS in `Program.cs`
- [ ] Aggiunto Static Files in `Program.cs`
- [ ] Verificato Connection String
- [ ] Build OK (nessun errore)
- [ ] API avviata

Test:
- [ ] Eseguito `TEST_QUERY_REPRINT.sql`
- [ ] Trovati valori di test
- [ ] Pagina web accessibile
- [ ] Ricerca funziona
- [ ] Visualizza PDF funziona
- [ ] Scarica PDF funziona

---

## 🔍 Schema Database Utilizzato

Il sistema usa questo schema (già corretto in tutto il codice):

```
DigitalSignedReports
├── Id (uniqueidentifier, PK)
├── ExaminationId (int, FK) ──┐
├── PatientId (int, FK)       │
├── Pdf (varbinary(max))      │
└── PrintDate (datetime)      │
                              │
ExaminationsAndConsultations  │
├── ExaminationId (int, PK) ←─┘
├── PatientId (int, FK) ──┐
└── ExternalAccessionNumber   │
                              │
Patients                      │
├── PatientId (int, PK) ←─────┘
├── FirstName
├── LastName
└── ExternalPatientId
```

---

## 📞 Hai Problemi?

### Errore di compilazione
→ Verifica namespace in `ReprintReportsController.cs`

### 404 Not Found su /api/reports/search
→ Ricontrolla che il controller sia in `Controllers/` e ribuilda

### CORS Error
→ Verifica che `app.UseCors()` sia PRIMA di `app.UseAuthorization()`

### File HTML non trovato
→ Verifica che `app.UseStaticFiles()` sia presente e che il file sia in `wwwroot/`

### No reports found
→ Esegui `TEST_QUERY_REPRINT.sql` per trovare valori validi

**Per troubleshooting completo**: Vedi [DEPLOY_INSTRUCTIONS_STEP_BY_STEP.md](DEPLOY_INSTRUCTIONS_STEP_BY_STEP.md) sezione "Troubleshooting"

---

## 💡 Consigli

1. **Leggi prima** [DEPLOY_INSTRUCTIONS_STEP_BY_STEP.md](DEPLOY_INSTRUCTIONS_STEP_BY_STEP.md) - È una guida completa con screenshots mentali
2. **Testa locale** prima di fare deploy in produzione
3. **Usa Visual Studio** se possibile - rende tutto più facile
4. **Backup** del database prima di iniziare
5. **Chiedi aiuto** se blocchi - vedi sezione Supporto sotto

---

## 📚 Documentazione Completa

| File | Quando Usarlo |
|------|---------------|
| **[DEPLOY_INSTRUCTIONS_STEP_BY_STEP.md](DEPLOY_INSTRUCTIONS_STEP_BY_STEP.md)** | Guida principale - inizia da qui |
| [API_ENDPOINTS_REPRINT.md](API_ENDPOINTS_REPRINT.md) | Riferimento tecnico endpoint |
| [REPRINT_SETUP_GUIDE.md](REPRINT_SETUP_GUIDE.md) | Setup avanzato e personalizzazioni |
| [README_REPRINT_SYSTEM.md](README_REPRINT_SYSTEM.md) | Overview architettura |
| [BUILD_CROSS_PLATFORM.md](BUILD_CROSS_PLATFORM.md) | Build multi-platform (Electron) |
| [BUILD_MAC_WITHOUT_SIGNING.md](BUILD_MAC_WITHOUT_SIGNING.md) | Build Mac senza certificato |
| [MAC_CODE_SIGNING_SETUP.md](MAC_CODE_SIGNING_SETUP.md) | Code signing Mac (avanzato) |

---

## 🎉 Pronto?

1. **Apri**: [DEPLOY_INSTRUCTIONS_STEP_BY_STEP.md](DEPLOY_INSTRUCTIONS_STEP_BY_STEP.md)
2. **Segui** i 10 passi
3. **Testa** il sistema
4. **Celebra** 🎊

**Tempo stimato**: 30-60 minuti per setup completo

---

## 📞 Supporto

- **Repository**: [MedicalReportingElectronApp](https://github.com/DharmaHC/MedicalReportingElectronApp)
- **Email**: info@dharmahealthcare.net

---

**Buon lavoro! 🚀**
