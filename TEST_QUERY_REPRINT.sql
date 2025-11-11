-- Test Query per Sistema di Ristampa Referti
-- Schema Database Reale basato su ApplicationDbContext

-- ==============================================
-- SCHEMA DEL DATABASE
-- ==============================================
-- DigitalSignedReports:
--   - Id (uniqueidentifier, PK)
--   - ExaminationId (int, FK to ExaminationsAndConsultations)
--   - PatientId (int, FK to Patients)
--   - Pdf (varbinary(max))
--   - PrintDate (datetime)
--
-- ExaminationsAndConsultations:
--   - ExaminationId (int, PK)
--   - PatientId (int, FK to Patients)
--   - ExternalAccessionNumber (nvarchar)
--
-- Patients:
--   - PatientId (int, PK)
--   - FirstName (nvarchar)
--   - LastName (nvarchar)
--   - ExternalPatientId (nvarchar)
-- ==============================================

USE YourDatabaseName;  -- Sostituisci con il nome del tuo database
GO

-- ==============================================
-- 1. QUERY DI RICERCA (come implementata nell'API)
-- ==============================================

PRINT '=== TEST QUERY 1: Ricerca per ExternalAccessionNumber ed ExternalPatientId ===';
PRINT '';

DECLARE @ExternalAccessionNumber NVARCHAR(100) = 'YOUR_TEST_ACCESSION_NUMBER';
DECLARE @ExternalPatientId NVARCHAR(100) = 'YOUR_TEST_PATIENT_ID';

SELECT
    dsr.Id as id,
    p.FirstName + ' ' + p.LastName as patientName,
    eac.ExternalAccessionNumber as externalAccessionNumber,
    p.ExternalPatientId as externalPatientId,
    dsr.PrintDate as signedDate,
    DATALENGTH(dsr.Pdf) as pdfSize
FROM DigitalSignedReports dsr
INNER JOIN ExaminationsAndConsultations eac ON dsr.ExaminationId = eac.ExaminationId
INNER JOIN Patients p ON eac.PatientId = p.PatientId
WHERE eac.ExternalAccessionNumber = @ExternalAccessionNumber
  AND p.ExternalPatientId = @ExternalPatientId
  AND dsr.Pdf IS NOT NULL
ORDER BY dsr.PrintDate DESC;

-- Se non trovi risultati, verifica che i dati esistano:
IF @@ROWCOUNT = 0
BEGIN
    PRINT '';
    PRINT '⚠️ Nessun risultato trovato. Verifica i dati di test:';
    PRINT '';

    -- Mostra alcuni ExternalAccessionNumber disponibili
    PRINT '--- ExternalAccessionNumber disponibili nella tabella ExaminationsAndConsultations:';
    SELECT TOP 10 ExternalAccessionNumber
    FROM ExaminationsAndConsultations
    WHERE ExternalAccessionNumber IS NOT NULL
    ORDER BY ExaminationId DESC;

    -- Mostra alcuni ExternalPatientId disponibili
    PRINT '';
    PRINT '--- ExternalPatientId disponibili nella tabella Patients:';
    SELECT TOP 10 ExternalPatientId
    FROM Patients
    WHERE ExternalPatientId IS NOT NULL
    ORDER BY PatientId DESC;

    -- Mostra referti firmati disponibili
    PRINT '';
    PRINT '--- Referti firmati disponibili (ultimi 10):';
    SELECT TOP 10
        dsr.Id,
        dsr.ExaminationId,
        dsr.PatientId,
        dsr.PrintDate,
        DATALENGTH(dsr.Pdf) as PdfSize
    FROM DigitalSignedReports dsr
    WHERE dsr.Pdf IS NOT NULL
    ORDER BY dsr.PrintDate DESC;
END
ELSE
BEGIN
    PRINT '';
    PRINT '✅ Query eseguita con successo!';
END
GO

-- ==============================================
-- 2. QUERY PER RECUPERARE PDF (by Id)
-- ==============================================

PRINT '';
PRINT '=== TEST QUERY 2: Recupero PDF per Id ===';
PRINT '';

DECLARE @ReportId UNIQUEIDENTIFIER = 'YOUR_TEST_REPORT_GUID';  -- Sostituisci con un GUID reale

SELECT
    dsr.Pdf,
    p.FirstName + ' ' + p.LastName as PatientName,
    eac.ExternalAccessionNumber
FROM DigitalSignedReports dsr
INNER JOIN ExaminationsAndConsultations eac ON dsr.ExaminationId = eac.ExaminationId
INNER JOIN Patients p ON eac.PatientId = p.PatientId
WHERE dsr.Id = @ReportId;

IF @@ROWCOUNT = 0
BEGIN
    PRINT '⚠️ Report non trovato. Usa un Id valido dalla query precedente.';
END
ELSE
BEGIN
    PRINT '✅ PDF trovato!';
END
GO

-- ==============================================
-- 3. QUERY DI VERIFICA DATI
-- ==============================================

PRINT '';
PRINT '=== QUERY DI VERIFICA DATI ===';
PRINT '';

-- Conta referti firmati
PRINT '--- Totale referti firmati nel database:';
SELECT COUNT(*) as TotalSignedReports
FROM DigitalSignedReports
WHERE Pdf IS NOT NULL;

-- Conta referti con ExternalAccessionNumber
PRINT '';
PRINT '--- Referti firmati collegati a ExternalAccessionNumber:';
SELECT COUNT(*) as ReportsWithExternalAccessionNumber
FROM DigitalSignedReports dsr
INNER JOIN ExaminationsAndConsultations eac ON dsr.ExaminationId = eac.ExaminationId
WHERE eac.ExternalAccessionNumber IS NOT NULL
  AND dsr.Pdf IS NOT NULL;

-- Conta referti con ExternalPatientId
PRINT '';
PRINT '--- Referti firmati collegati a ExternalPatientId:';
SELECT COUNT(*) as ReportsWithExternalPatientId
FROM DigitalSignedReports dsr
INNER JOIN ExaminationsAndConsultations eac ON dsr.ExaminationId = eac.ExaminationId
INNER JOIN Patients p ON eac.PatientId = p.PatientId
WHERE p.ExternalPatientId IS NOT NULL
  AND dsr.Pdf IS NOT NULL;

-- Mostra combinazioni ExternalAccessionNumber + ExternalPatientId valide
PRINT '';
PRINT '--- Prime 10 combinazioni valide per test (ultimi referti firmati):';
SELECT TOP 10
    eac.ExternalAccessionNumber,
    p.ExternalPatientId,
    p.FirstName + ' ' + p.LastName as PatientName,
    dsr.PrintDate,
    dsr.Id as ReportId,
    DATALENGTH(dsr.Pdf) as PdfSize
FROM DigitalSignedReports dsr
INNER JOIN ExaminationsAndConsultations eac ON dsr.ExaminationId = eac.ExaminationId
INNER JOIN Patients p ON eac.PatientId = p.PatientId
WHERE eac.ExternalAccessionNumber IS NOT NULL
  AND p.ExternalPatientId IS NOT NULL
  AND dsr.Pdf IS NOT NULL
ORDER BY dsr.PrintDate DESC;

PRINT '';
PRINT '=== FINE TEST ===';
PRINT '';
PRINT '📝 NOTA: Usa i valori dalla query sopra per testare il sistema di ristampa.';
PRINT '   Copia ExternalAccessionNumber ed ExternalPatientId e usali nella pagina web.';
GO
