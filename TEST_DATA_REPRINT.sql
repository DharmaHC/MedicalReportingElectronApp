-- Test Data per Sistema Ristampa Referti
-- Questo script crea dati di test nella tabella DigitalSignedReports

USE YourDatabaseName;  -- Sostituisci con il nome del tuo database
GO

-- Verifica se la tabella esiste
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DigitalSignedReports')
BEGIN
    PRINT 'ERRORE: La tabella DigitalSignedReports non esiste!';
    PRINT 'Crea prima la tabella seguendo lo schema in API_ENDPOINTS_REPRINT.md';
END
ELSE
BEGIN
    PRINT 'Inserimento dati di test...';

    -- Inserisci alcuni referti di test
    -- NOTA: Sostituisci 'SignedPdfData' con dati binari reali di un PDF per test completi

    -- Test 1: Paziente Rossi Mario
    IF NOT EXISTS (SELECT 1 FROM DigitalSignedReports
                   WHERE ExternalAccessionNumber = 'ACC123456'
                   AND ExternalPatientID = 'PAT789012')
    BEGIN
        INSERT INTO DigitalSignedReports (
            ExamResultGUID,
            PatientName,
            ExternalAccessionNumber,
            ExternalPatientID,
            SignedDate,
            SignedPdfData  -- Per test reali, usa un PDF binario
        ) VALUES (
            NEWID(),
            'Rossi Mario',
            'ACC123456',
            'PAT789012',
            GETDATE(),
            NULL  -- Sostituisci con: (SELECT * FROM OPENROWSET(BULK 'C:\path\to\test.pdf', SINGLE_BLOB) AS PDF)
        );

        PRINT 'Inserito referto test per Rossi Mario';
    END

    -- Test 2: Paziente Bianchi Laura
    IF NOT EXISTS (SELECT 1 FROM DigitalSignedReports
                   WHERE ExternalAccessionNumber = 'ACC789456'
                   AND ExternalPatientID = 'PAT456789')
    BEGIN
        INSERT INTO DigitalSignedReports (
            ExamResultGUID,
            PatientName,
            ExternalAccessionNumber,
            ExternalPatientID,
            SignedDate,
            SignedPdfData
        ) VALUES (
            NEWID(),
            'Bianchi Laura',
            'ACC789456',
            'PAT456789',
            GETDATE(),
            NULL
        );

        PRINT 'Inserito referto test per Bianchi Laura';
    END

    -- Test 3: Stesso paziente, due referti diversi (per testare risultati multipli)
    IF NOT EXISTS (SELECT 1 FROM DigitalSignedReports
                   WHERE ExternalAccessionNumber = 'ACC111222'
                   AND ExternalPatientID = 'PAT333444')
    BEGIN
        INSERT INTO DigitalSignedReports (
            ExamResultGUID,
            PatientName,
            ExternalAccessionNumber,
            ExternalPatientID,
            SignedDate,
            SignedPdfData
        ) VALUES (
            NEWID(),
            'Verdi Giuseppe',
            'ACC111222',
            'PAT333444',
            DATEADD(DAY, -5, GETDATE()),  -- 5 giorni fa
            NULL
        );

        -- Secondo referto dello stesso paziente
        INSERT INTO DigitalSignedReports (
            ExamResultGUID,
            PatientName,
            ExternalAccessionNumber,
            ExternalPatientID,
            SignedDate,
            SignedPdfData
        ) VALUES (
            NEWID(),
            'Verdi Giuseppe',
            'ACC111222',
            'PAT333444',
            GETDATE(),  -- Oggi
            NULL
        );

        PRINT 'Inseriti 2 referti test per Verdi Giuseppe';
    END

    PRINT 'Dati di test inseriti con successo!';
    PRINT '';
    PRINT '=== DATI DI TEST PER RICERCA ===';
    PRINT 'Test 1:';
    PRINT '  ExternalAccessionNumber: ACC123456';
    PRINT '  ExternalPatientID: PAT789012';
    PRINT '  Risultati attesi: 1';
    PRINT '';
    PRINT 'Test 2:';
    PRINT '  ExternalAccessionNumber: ACC789456';
    PRINT '  ExternalPatientID: PAT456789';
    PRINT '  Risultati attesi: 1';
    PRINT '';
    PRINT 'Test 3 (risultati multipli):';
    PRINT '  ExternalAccessionNumber: ACC111222';
    PRINT '  ExternalPatientID: PAT333444';
    PRINT '  Risultati attesi: 2';
    PRINT '';
    PRINT 'NOTA: SignedPdfData è NULL. Per test completi di download PDF,';
    PRINT 'carica dati binari reali usando OPENROWSET o UPDATE con dati PDF.';
END
GO

-- Visualizza i dati inseriti
SELECT
    ExamResultGUID,
    PatientName,
    ExternalAccessionNumber,
    ExternalPatientID,
    SignedDate,
    CASE
        WHEN SignedPdfData IS NULL THEN 'NO'
        ELSE 'SI'
    END AS HasPdfData,
    DATALENGTH(SignedPdfData) AS PdfSize
FROM DigitalSignedReports
WHERE ExternalAccessionNumber IN ('ACC123456', 'ACC789456', 'ACC111222')
ORDER BY SignedDate DESC;
GO

-- Query di test per verificare le ricerche (con JOIN corretti)
-- NOTA: Le query usano JOIN con Patients e ExaminationsAndConsultations
--       come richiesto dalla struttura reale del database
PRINT '';
PRINT '=== TEST QUERY (con JOIN) ===';
PRINT '';
PRINT '1. Ricerca per ACC123456 e PAT789012:';
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
WHERE eac.ExternalAccessionNumber = 'ACC123456'
  AND p.ExternalPatientID = 'PAT789012'
  AND dsr.SignedPdfData IS NOT NULL;

PRINT '';
PRINT '2. Ricerca multipla per ACC111222 e PAT333444:';
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
WHERE eac.ExternalAccessionNumber = 'ACC111222'
  AND p.ExternalPatientID = 'PAT333444'
ORDER BY dsr.SignedDate DESC;
GO

-- Script per caricare un PDF di test (OPZIONALE)
-- Decommentare e modificare il path per caricare un PDF reale

/*
-- Carica un PDF di test per il primo record
UPDATE DigitalSignedReports
SET SignedPdfData = (
    SELECT * FROM OPENROWSET(
        BULK 'C:\Path\To\Your\TestPDF.pdf',
        SINGLE_BLOB
    ) AS PDFData
)
WHERE ExternalAccessionNumber = 'ACC123456'
  AND ExternalPatientID = 'PAT789012';

PRINT 'PDF di test caricato per ACC123456';
*/
GO

-- Cleanup (se vuoi rimuovere i dati di test)
/*
DELETE FROM DigitalSignedReports
WHERE ExternalAccessionNumber IN ('ACC123456', 'ACC789456', 'ACC111222')
  AND ExternalPatientID IN ('PAT789012', 'PAT456789', 'PAT333444');

PRINT 'Dati di test rimossi';
*/
