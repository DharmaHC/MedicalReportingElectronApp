# API Endpoints per Ristampa Referti

Questi endpoint devono essere implementati nella tua API backend (MedicalReportingAPI) per supportare la funzionalità di ristampa referti dalla pagina web `reprint-reports.html`.

## 📋 Endpoint Richiesti

### 1. GET `/api/reports/search`

Cerca referti firmati in base a ExternalAccessionNumber e ExternalPatientId.

**Query Parameters:**
- `externalAccessionNumber` (string, required): Numero di accesso esterno
- `externalPatientId` (string, required): ID paziente esterno

**Response (200 OK):**
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

**Response (404 Not Found):**
```json
{
  "error": "No reports found"
}
```

### 2. GET `/api/reports/:id/pdf`

Scarica il PDF firmato del referto specificato.

**URL Parameters:**
- `id` (string, required): GUID del report

**Response (200 OK):**
- Content-Type: `application/pdf`
- Body: Binary PDF data

**Response (404 Not Found):**
```json
{
  "error": "Report not found"
}
```

---

## 🔧 Implementazione Esempio (Node.js + Express)

```javascript
const express = require('express');
const router = express.Router();
const sql = require('mssql');

// Search reports
router.get('/api/reports/search', async (req, res) => {
    try {
        const { externalAccessionNumber, externalPatientId } = req.query;

        if (!externalAccessionNumber || !externalPatientId) {
            return res.status(400).json({
                error: 'Both externalAccessionNumber and externalPatientId are required'
            });
        }

        // Query database with joins
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('externalAccessionNumber', sql.NVarChar, externalAccessionNumber)
            .input('externalPatientId', sql.NVarChar, externalPatientId)
            .query(`
                SELECT
                    dsr.ExamResultGUID as id,
                    p.Name + ' ' + p.Surname as patientName,
                    eac.ExternalAccessionNumber as externalAccessionNumber,
                    p.ExternalPatientID as externalPatientId,
                    dsr.SignedDate as signedDate,
                    DATALENGTH(dsr.SignedPdfData) as pdfSize
                FROM DigitalSignedReports dsr
                INNER JOIN ExamResults er ON dsr.ExamResultGUID = er.ExamResultGUID
                INNER JOIN ExaminationsAndConsultations eac ON er.ExaminationGUID = eac.ExaminationGUID
                INNER JOIN Patients p ON eac.PatientGUID = p.PatientGUID
                WHERE eac.ExternalAccessionNumber = @externalAccessionNumber
                  AND p.ExternalPatientID = @externalPatientId
                  AND dsr.SignedPdfData IS NOT NULL
                ORDER BY dsr.SignedDate DESC
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'No reports found' });
        }

        res.json(result.recordset);

    } catch (error) {
        console.error('Error searching reports:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get PDF by report ID
router.get('/api/reports/:id/pdf', async (req, res) => {
    try {
        const { id } = req.params;

        // Query database with joins
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('id', sql.UniqueIdentifier, id)
            .query(`
                SELECT
                    dsr.SignedPdfData as pdfData,
                    p.Name + ' ' + p.Surname as patientName,
                    eac.ExternalAccessionNumber as accessionNumber
                FROM DigitalSignedReports dsr
                INNER JOIN ExamResults er ON dsr.ExamResultGUID = er.ExamResultGUID
                INNER JOIN ExaminationsAndConsultations eac ON er.ExaminationGUID = eac.ExaminationGUID
                INNER JOIN Patients p ON eac.PatientGUID = p.PatientGUID
                WHERE dsr.ExamResultGUID = @id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }

        const report = result.recordset[0];

        if (!report.pdfData) {
            return res.status(404).json({ error: 'PDF data not found' });
        }

        // Set headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition',
            `inline; filename="Referto_${report.patientName}_${report.accessionNumber}.pdf"`
        );

        // Send PDF binary data
        res.send(report.pdfData);

    } catch (error) {
        console.error('Error retrieving PDF:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
```

---

## 🔧 Implementazione Esempio (C# + ASP.NET Core)

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

[ApiController]
[Route("api/reports")]
public class ReportsController : ControllerBase
{
    private readonly string _connectionString;

    public ReportsController(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection");
    }

    // GET: api/reports/search
    [HttpGet("search")]
    public async Task<IActionResult> SearchReports(
        [FromQuery] string externalAccessionNumber,
        [FromQuery] string externalPatientId)
    {
        if (string.IsNullOrEmpty(externalAccessionNumber) ||
            string.IsNullOrEmpty(externalPatientId))
        {
            return BadRequest(new { error = "Both parameters are required" });
        }

        var reports = new List<object>();

        using (var connection = new SqlConnection(_connectionString))
        {
            await connection.OpenAsync();

            var query = @"
                SELECT
                    dsr.ExamResultGUID as Id,
                    p.Name + ' ' + p.Surname as PatientName,
                    eac.ExternalAccessionNumber,
                    p.ExternalPatientID,
                    dsr.SignedDate,
                    DATALENGTH(dsr.SignedPdfData) as PdfSize
                FROM DigitalSignedReports dsr
                INNER JOIN ExamResults er ON dsr.ExamResultGUID = er.ExamResultGUID
                INNER JOIN ExaminationsAndConsultations eac ON er.ExaminationGUID = eac.ExaminationGUID
                INNER JOIN Patients p ON eac.PatientGUID = p.PatientGUID
                WHERE eac.ExternalAccessionNumber = @ExternalAccessionNumber
                  AND p.ExternalPatientID = @ExternalPatientId
                  AND dsr.SignedPdfData IS NOT NULL
                ORDER BY dsr.SignedDate DESC";

            using (var command = new SqlCommand(query, connection))
            {
                command.Parameters.AddWithValue("@ExternalAccessionNumber", externalAccessionNumber);
                command.Parameters.AddWithValue("@ExternalPatientId", externalPatientId);

                using (var reader = await command.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        reports.Add(new
                        {
                            id = reader["Id"].ToString(),
                            patientName = reader["PatientName"].ToString(),
                            externalAccessionNumber = reader["ExternalAccessionNumber"].ToString(),
                            externalPatientId = reader["ExternalPatientID"].ToString(),
                            signedDate = reader["SignedDate"],
                            pdfSize = reader["PdfSize"]
                        });
                    }
                }
            }
        }

        if (reports.Count == 0)
        {
            return NotFound(new { error = "No reports found" });
        }

        return Ok(reports);
    }

    // GET: api/reports/{id}/pdf
    [HttpGet("{id}/pdf")]
    public async Task<IActionResult> GetReportPdf(Guid id)
    {
        using (var connection = new SqlConnection(_connectionString))
        {
            await connection.OpenAsync();

            var query = @"
                SELECT
                    dsr.SignedPdfData,
                    p.Name + ' ' + p.Surname as PatientName,
                    eac.ExternalAccessionNumber
                FROM DigitalSignedReports dsr
                INNER JOIN ExamResults er ON dsr.ExamResultGUID = er.ExamResultGUID
                INNER JOIN ExaminationsAndConsultations eac ON er.ExaminationGUID = eac.ExaminationGUID
                INNER JOIN Patients p ON eac.PatientGUID = p.PatientGUID
                WHERE dsr.ExamResultGUID = @Id";

            using (var command = new SqlCommand(query, connection))
            {
                command.Parameters.AddWithValue("@Id", id);

                using (var reader = await command.ExecuteReaderAsync())
                {
                    if (await reader.ReadAsync())
                    {
                        if (reader["SignedPdfData"] == DBNull.Value)
                        {
                            return NotFound(new { error = "PDF data not found" });
                        }

                        var pdfData = (byte[])reader["SignedPdfData"];
                        var patientName = reader["PatientName"].ToString();
                        var accessionNumber = reader["ExternalAccessionNumber"].ToString();

                        var fileName = $"Referto_{patientName}_{accessionNumber}.pdf";

                        return File(pdfData, "application/pdf", fileName);
                    }
                }
            }
        }

        return NotFound(new { error = "Report not found" });
    }
}
```

---

## 🔒 Configurazione CORS (Importante!)

Per permettere alla pagina HTML di chiamare l'API, devi abilitare CORS.

### Node.js + Express

```javascript
const cors = require('cors');

app.use(cors({
    origin: '*', // In produzione, specifica i domini consentiti
    methods: ['GET'],
    allowedHeaders: ['Content-Type']
}));
```

### ASP.NET Core

```csharp
// In Program.cs o Startup.cs
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", builder =>
    {
        builder.AllowAnyOrigin()
               .AllowAnyMethod()
               .AllowAnyHeader();
    });
});

// Nel middleware
app.UseCors("AllowAll");
```

---

## 🗄️ Schema Database

Assicurati che la tabella `DigitalSignedReports` abbia questi campi:

```sql
CREATE TABLE DigitalSignedReports (
    ExamResultGUID UNIQUEIDENTIFIER PRIMARY KEY,
    PatientName NVARCHAR(255),
    ExternalAccessionNumber NVARCHAR(100),
    ExternalPatientID NVARCHAR(100),
    SignedDate DATETIME,
    SignedPdfData VARBINARY(MAX),
    -- Altri campi...

    INDEX IX_ExternalIds (ExternalAccessionNumber, ExternalPatientID)
);
```

---

## 🧪 Test degli Endpoint

### Test con cURL

```bash
# Search reports
curl "http://localhost:5000/api/reports/search?externalAccessionNumber=ACC123&externalPatientId=PAT456"

# Get PDF
curl "http://localhost:5000/api/reports/GUID-HERE/pdf" -o report.pdf
```

### Test con Postman

1. **Search Reports**
   - Method: GET
   - URL: `http://localhost:5000/api/reports/search`
   - Query Params:
     - `externalAccessionNumber`: ACC123
     - `externalPatientId`: PAT456

2. **Get PDF**
   - Method: GET
   - URL: `http://localhost:5000/api/reports/{GUID}/pdf`
   - Save Response as File

---

## 📦 Deployment

### 1. Deploy API Backend

Implementa gli endpoint nell'API e fai il deploy sul server.

### 2. Deploy Pagina HTML

Copia `reprint-reports.html` in una cartella pubblica dell'API, ad esempio:
- Node.js: `/public/reprint-reports.html`
- ASP.NET Core: `/wwwroot/reprint-reports.html`

### 3. Serve Static Files

**Node.js + Express:**
```javascript
app.use(express.static('public'));
```

**ASP.NET Core:**
```csharp
app.UseStaticFiles();
```

### 4. Accedi alla Pagina

Apri: `http://your-api-server:5000/reprint-reports.html`

---

## 🔐 Sicurezza (Opzionale)

Se vuoi aggiungere autenticazione in futuro:

1. Aggiungi un header Authorization
2. Implementa JWT o Basic Auth
3. Modifica il JavaScript nella pagina HTML per inviare il token

---

## 📞 Supporto

Per domande o problemi:
- Repository: [MedicalReportingElectronApp](https://github.com/DharmaHC/MedicalReportingElectronApp)
- Email: info@dharmahealthcare.net
