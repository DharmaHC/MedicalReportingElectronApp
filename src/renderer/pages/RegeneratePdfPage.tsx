import React, { useState, useRef, useEffect } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import { Button } from "@progress/kendo-react-buttons";
import { Input, TextArea } from "@progress/kendo-react-inputs";
import { Grid, GridColumn, GridSortChangeEvent } from "@progress/kendo-react-grid";
import { DatePicker } from "@progress/kendo-react-dateinputs";
import { ComboBox, ComboBoxChangeEvent, ComboBoxFilterChangeEvent } from "@progress/kendo-react-dropdowns";
import { Loader } from "@progress/kendo-react-indicators";
import { Dialog, DialogActionsBar } from "@progress/kendo-react-dialogs";
import { SortDescriptor, orderBy } from "@progress/kendo-data-query";
import { getApiBaseUrl } from "../utility/urlLib";

interface Doctor {
  doctorCode: string;
  doctorDescription: string;
}

interface SearchResult {
  id: string;
  patientName: string;
  externalAccessionNumber: string;
  externalPatientId: string;
  examinationDate: string;
  signedDate: string;
  pdfSize: number;
  doctorName: string;
  selected?: boolean;
}

interface RegenerateResult {
  reportId: string;
  status: "pending" | "processing" | "success" | "error";
  message?: string;
  patientName?: string;
  accessionNumber?: string;
  examinationId?: number;
  resultsIds?: string;
  newPdfSize?: number;
  backupFilePath?: string;
  webReportUpdated?: boolean;
}

const RegeneratePdfPage: React.FC = () => {
  const token = useSelector((state: RootState) => state.auth.token);

  // Search state
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [filteredDoctors, setFilteredDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");

  // Regeneration options
  const [useCurrentTemplate, setUseCurrentTemplate] = useState(false);

  // Regeneration state
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateResults, setRegenerateResults] = useState<RegenerateResult[]>([]);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);

  // Log state
  const [logMessages, setLogMessages] = useState<string[]>([]);

  // Modal state
  const [showResultsModal, setShowResultsModal] = useState(false);
  const resultsTableRef = useRef<HTMLDivElement>(null);

  // Sort state
  const [sort, setSort] = useState<SortDescriptor[]>([{ field: "signedDate", dir: "desc" }]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogMessages(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  // Load doctors list on mount
  useEffect(() => {
    const loadDoctors = async () => {
      if (!token) return;
      setLoadingDoctors(true);
      try {
        const response = await fetch(`${getApiBaseUrl()}doctors`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          // Ordina alfabeticamente per descrizione
          const sorted = data.sort((a: Doctor, b: Doctor) =>
            (a.doctorDescription || "").localeCompare(b.doctorDescription || "")
          );
          setDoctors(sorted);
          setFilteredDoctors(sorted);
        }
      } catch (error) {
        console.error("Errore caricamento medici:", error);
      } finally {
        setLoadingDoctors(false);
      }
    };
    loadDoctors();
  }, [token]);

  // Filter doctors for autocomplete
  const handleDoctorFilterChange = (event: ComboBoxFilterChangeEvent) => {
    const filter = event.filter.value.toLowerCase();
    if (!filter) {
      setFilteredDoctors(doctors);
    } else {
      setFilteredDoctors(
        doctors.filter(d =>
          (d.doctorDescription || "").toLowerCase().includes(filter)
        )
      );
    }
  };

  // Search reports
  const handleSearch = async () => {
    if (!lastName && !firstName && !selectedDoctor && !dateFrom && !dateTo) {
      setSearchMessage("Inserisci almeno un criterio di ricerca");
      return;
    }

    setSearching(true);
    setSearchMessage("");
    setSearchResults([]);
    addLog("Avvio ricerca referti...");

    try {
      const params = new URLSearchParams();
      if (lastName) params.append("lastName", lastName);
      if (firstName) params.append("firstName", firstName);
      if (selectedDoctor) params.append("doctorCode", selectedDoctor.doctorCode.trim());
      // Usa formato locale per evitare shift di timezone con toISOString()
      if (dateFrom) {
        const df = `${dateFrom.getFullYear()}-${String(dateFrom.getMonth() + 1).padStart(2, '0')}-${String(dateFrom.getDate()).padStart(2, '0')}`;
        params.append("dateFrom", df);
      }
      if (dateTo) {
        const dt = `${dateTo.getFullYear()}-${String(dateTo.getMonth() + 1).padStart(2, '0')}-${String(dateTo.getDate()).padStart(2, '0')}`;
        params.append("dateTo", dt);
      }

      const response = await fetch(`${getApiBaseUrl()}reports/search?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.reports && data.reports.length > 0) {
        setSearchResults(data.reports.map((r: any) => ({ ...r, selected: false })));
        setSearchMessage(`Trovati ${data.reports.length} referti`);
        addLog(`Trovati ${data.reports.length} referti`);
      } else {
        setSearchMessage(data.message || "Nessun referto trovato");
        addLog("Nessun referto trovato");
      }
    } catch (error) {
      setSearchMessage(`Errore nella ricerca: ${error}`);
      addLog(`ERRORE: ${error}`);
    } finally {
      setSearching(false);
    }
  };

  // Toggle selection
  const toggleSelection = (id: string) => {
    setSearchResults(prev =>
      prev.map(r => (r.id === id ? { ...r, selected: !r.selected } : r))
    );
  };

  // Select all
  const selectAll = () => {
    setSearchResults(prev => prev.map(r => ({ ...r, selected: true })));
  };

  // Deselect all
  const deselectAll = () => {
    setSearchResults(prev => prev.map(r => ({ ...r, selected: false })));
  };

  // Clear all search filters
  const clearFilters = () => {
    setLastName("");
    setFirstName("");
    setSelectedDoctor(null);
    setDateFrom(null);
    setDateTo(null);
    setFilteredDoctors(doctors);
  };

  // Regenerate single report - returns detailed result
  const regenerateSingle = async (reportId: string, patientName: string, accessionNumber: string): Promise<RegenerateResult> => {
    try {
      addLog(`Rigenerazione ${patientName} (${reportId})...`);

      // 1. Get regenerated PDF from API
      const regenUrl = `${getApiBaseUrl()}reports/${reportId}/regenerate-pdf${useCurrentTemplate ? '?useCurrentTemplate=true' : ''}`;
      const regenResponse = await fetch(regenUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!regenResponse.ok) {
        const errorData = await regenResponse.json();
        throw new Error(errorData.error || "Errore nel recupero RTF");
      }

      const regenData = await regenResponse.json();
      addLog(`  RTF recuperato, conversione in PDF completata`);
      if (regenData.templateUsed) {
        addLog(`  Modello attuale: ${regenData.templateFound ? 'APPLICATO' : 'NON TROVATO (fallback RTF originale)'}`);
      }
      addLog(`  CompanyId: "${regenData.companyId}" - Medico: "${regenData.doctorName}"`);

      // Calcola data firma: 1 ora dopo la data di refertazione originale
      let signatureDate: string | undefined;
      if (regenData.originalSignDate) {
        const originalDate = new Date(regenData.originalSignDate);
        originalDate.setHours(originalDate.getHours() + 1);
        signatureDate = originalDate.toISOString();
        addLog(`  Data firma forzata: ${originalDate.toLocaleString()}`);
      }

      // 2. Decorate PDF with bypass signature - Usa nativeSign come nel flusso normale
      const signResult = await (window as any).nativeSign.signPdf({
        pdfBase64: regenData.pdfBase64,
        companyId: regenData.companyId || "",
        footerText: null, // Verrà caricato da company-footer-settings.json
        useRemote: null,
        otpCode: null,
        pin: null,
        userCN: null,
        bypassSignature: true,
        signedByName: regenData.doctorName || regenData.signingUser || "Medico",
        doctorName: regenData.doctorName,
        signatureDate, // Data firma forzata (1 ora dopo refertazione)
      });

      if (!signResult.signedPdfBase64) {
        throw new Error("Decorazione PDF fallita");
      }
      addLog(`  PDF decorato con header/footer`);

      // 3. Save regenerated PDF
      const saveResponse = await fetch(`${getApiBaseUrl()}reports/${reportId}/save-regenerated-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pdfBase64: signResult.signedPdfBase64 }),
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(errorData.error || "Errore nel salvataggio");
      }

      const saveData = await saveResponse.json();
      addLog(`  COMPLETATO: ${patientName} - Nuovo PDF: ${saveData.newPdfSize} bytes`);

      return {
        reportId,
        status: "success",
        patientName,
        accessionNumber,
        examinationId: regenData.examinationId,
        resultsIds: regenData.resultsIds,
        newPdfSize: saveData.newPdfSize,
        backupFilePath: saveData.backupFilePath,
        webReportUpdated: saveData.webReportUpdated,
        message: "Rigenerato con successo",
      };

    } catch (error) {
      addLog(`  ERRORE ${patientName}: ${error}`);
      return {
        reportId,
        status: "error",
        patientName,
        accessionNumber,
        message: String(error),
      };
    }
  };

  // Regenerate selected reports
  const handleRegenerateSelected = async () => {
    const selected = searchResults.filter(r => r.selected);
    if (selected.length === 0) {
      setSearchMessage("Seleziona almeno un referto da rigenerare");
      return;
    }

    const confirmMsg = `Stai per rigenerare ${selected.length} refert${selected.length > 1 ? 'i' : 'o'}.\n\n` +
      `ATTENZIONE: I PDF rigenerati NON avranno firma digitale valida (solo bypass estetico).\n\n` +
      `Continuare?`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    setRegenerating(true);
    setTotalToProcess(selected.length);
    setCurrentProgress(0);
    setRegenerateResults([]);
    addLog(`=== INIZIO RIGENERAZIONE DI ${selected.length} REFERTI ===`);

    const results: RegenerateResult[] = [];

    for (let i = 0; i < selected.length; i++) {
      const report = selected[i];
      setCurrentProgress(i + 1);

      const result = await regenerateSingle(report.id, report.patientName, report.externalAccessionNumber);
      results.push(result);
      setRegenerateResults([...results]);
    }

    const successCount = results.filter(r => r.status === "success").length;
    const errorCount = results.filter(r => r.status === "error").length;

    addLog(`=== COMPLETATO: ${successCount} successi, ${errorCount} errori ===`);
    setRegenerating(false);

    // Show results modal
    setShowResultsModal(true);
  };

  // View PDF from DigitalSignedReports
  const viewPdfDigitalSigned = async (reportId: string) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}reports/${reportId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("PDF non trovato");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      alert(`Errore: ${error}`);
    }
  };

  // View PDF from WebReportsPdfFilesStream
  const viewPdfWebReport = async (examinationId: number, resultsIds: string) => {
    try {
      const response = await fetch(
        `${getApiBaseUrl()}reports/web-pdf?examinationId=${examinationId}&resultsIds=${encodeURIComponent(resultsIds)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error("PDF non trovato in WebReportsPdfFilesStream");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      alert(`Errore: ${error}`);
    }
  };

  // Print results table
  const handlePrintResults = () => {
    const printContent = resultsTableRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const successCount = regenerateResults.filter(r => r.status === "success").length;
    const errorCount = regenerateResults.filter(r => r.status === "error").length;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Riepilogo Rigenerazione PDF</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { font-size: 18px; margin-bottom: 10px; }
          .summary { margin-bottom: 15px; font-size: 14px; }
          .success { color: green; }
          .error { color: red; }
          table { border-collapse: collapse; width: 100%; font-size: 11px; }
          th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
          th { background: #f0f0f0; }
          .status-success { background: #d4edda; }
          .status-error { background: #f8d7da; }
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>Riepilogo Rigenerazione PDF Referti</h1>
        <div class="summary">
          Data: ${new Date().toLocaleString('it-IT')}<br>
          Totale elaborati: ${regenerateResults.length} |
          <span class="success">Successi: ${successCount}</span> |
          <span class="error">Errori: ${errorCount}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Paziente</th>
              <th>Accession</th>
              <th>Esito</th>
              <th>Size</th>
              <th>WebReport</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            ${regenerateResults.map(r => `
              <tr class="status-${r.status}">
                <td>${r.patientName || '-'}</td>
                <td>${r.accessionNumber || '-'}</td>
                <td>${r.status === 'success' ? 'OK' : 'ERRORE'}</td>
                <td>${r.newPdfSize ? Math.round(r.newPdfSize / 1024) + ' KB' : '-'}</td>
                <td>${r.webReportUpdated ? 'Aggiornato' : 'Non trovato'}</td>
                <td>${r.message || ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Download PDF for preview
  const handlePreviewPdf = async (reportId: string, patientName: string) => {
    try {
      addLog(`Anteprima PDF originale: ${patientName}`);
      const response = await fetch(`${getApiBaseUrl()}reports/${reportId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("PDF non trovato");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      addLog(`Errore anteprima: ${error}`);
    }
  };

  // Test regeneration (preview only, don't save)
  const handleTestRegenerate = async (reportId: string, patientName: string) => {
    try {
      addLog(`TEST rigenerazione: ${patientName}`);

      // 1. Get regenerated PDF
      const regenUrl = `${getApiBaseUrl()}reports/${reportId}/regenerate-pdf${useCurrentTemplate ? '?useCurrentTemplate=true' : ''}`;
      const regenResponse = await fetch(regenUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!regenResponse.ok) {
        const errorData = await regenResponse.json();
        throw new Error(errorData.error || "Errore");
      }

      const regenData = await regenResponse.json();
      addLog(`  RTF trovato, PDF rigenerato (non decorato): ${regenData.pdfBase64.length} chars`);
      addLog(`  CompanyId da DB: "${regenData.companyId}" - Medico: "${regenData.doctorName}"`);
      if (regenData.templateUsed) {
        addLog(`  Modello attuale: ${regenData.templateFound ? 'APPLICATO' : 'NON TROVATO (fallback RTF originale)'}`);
      }

      // Calcola data firma: 1 ora dopo la data di refertazione originale
      let signatureDate: string | undefined;
      if (regenData.originalSignDate) {
        const originalDate = new Date(regenData.originalSignDate);
        originalDate.setHours(originalDate.getHours() + 1);
        signatureDate = originalDate.toISOString();
        addLog(`  Data firma forzata: ${originalDate.toLocaleString()}`);
      }

      // 2. Decorate with bypass - Usa nativeSign come nel flusso normale di firma
      const signResult = await (window as any).nativeSign.signPdf({
        pdfBase64: regenData.pdfBase64,
        companyId: regenData.companyId || "",
        footerText: null, // Verrà caricato da company-footer-settings.json
        useRemote: null,
        otpCode: null,
        pin: null,
        userCN: null,
        bypassSignature: true,
        signedByName: regenData.doctorName || regenData.signingUser || "Medico",
        doctorName: regenData.doctorName,
        signatureDate, // Data firma forzata (1 ora dopo refertazione)
      });

      addLog(`  PDF decorato: ${signResult.signedPdfBase64.length} chars`);

      // 3. Open preview
      const pdfBytes = Uint8Array.from(atob(signResult.signedPdfBase64), c => c.charCodeAt(0));
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');

      addLog(`  TEST COMPLETATO - PDF aperto in nuova finestra`);

    } catch (error) {
      addLog(`  TEST FALLITO: ${error}`);
    }
  };

  const selectedCount = searchResults.filter(r => r.selected).length;

  return (
    <div style={{ padding: "20px", maxWidth: "1400px", margin: "0 auto" }}>
      <h2>Rigenerazione PDF Referti</h2>
      <p style={{ color: "#666", marginBottom: "20px" }}>
        Usa questa pagina per rigenerare i PDF dei referti che sono stati impaginati male.
        <br />
        <strong style={{ color: "#c00" }}>ATTENZIONE:</strong> I PDF rigenerati avranno solo firma estetica (bypass), non firma digitale valida.
      </p>

      {/* Search Section */}
      <div style={{
        background: "#f5f5f5",
        padding: "15px",
        borderRadius: "8px",
        marginBottom: "20px"
      }}>
        <h4>Ricerca Referti</h4>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label>Cognome</label>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.value || "")}
              style={{ width: "150px" }}
            />
          </div>
          <div>
            <label>Nome</label>
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.value || "")}
              style={{ width: "150px" }}
            />
          </div>
          <div>
            <label>Medico</label>
            <ComboBox
              data={filteredDoctors}
              textField="doctorDescription"
              dataItemKey="doctorCode"
              value={selectedDoctor}
              onChange={(e: ComboBoxChangeEvent) => setSelectedDoctor(e.value)}
              onFilterChange={handleDoctorFilterChange}
              placeholder="Seleziona medico..."
              filterable={true}
              loading={loadingDoctors}
              style={{ width: "250px" }}
            />
          </div>
          <div>
            <label title="Data di firma del referto (non data accettazione)">Data Referto Da</label>
            <DatePicker
              value={dateFrom}
              onChange={(e) => setDateFrom(e.value)}
              format="dd/MM/yyyy"
              style={{ width: "140px" }}
            />
          </div>
          <div>
            <label title="Data di firma del referto (non data accettazione)">Data Referto A</label>
            <DatePicker
              value={dateTo}
              onChange={(e) => setDateTo(e.value)}
              format="dd/MM/yyyy"
              style={{ width: "140px" }}
            />
          </div>
          <Button
            themeColor="primary"
            onClick={handleSearch}
            disabled={searching}
          >
            {searching ? <Loader size="small" /> : "Cerca"}
          </Button>
          <Button
            fillMode="outline"
            onClick={clearFilters}
          >
            Pulisci Filtri
          </Button>
        </div>
        {searchMessage && (
          <div style={{ marginTop: "10px", color: searchResults.length > 0 ? "green" : "#666" }}>
            {searchMessage}
          </div>
        )}
      </div>

      {/* Results Grid */}
      {searchResults.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", gap: "10px", marginBottom: "10px", alignItems: "center" }}>
            <Button onClick={selectAll} fillMode="outline">Seleziona Tutti</Button>
            <Button onClick={deselectAll} fillMode="outline">Deseleziona Tutti</Button>
            <span style={{ marginLeft: "auto", fontWeight: "bold" }}>
              Selezionati: {selectedCount} / {searchResults.length}
            </span>
          </div>

          <Grid
            data={orderBy(searchResults, sort)}
            style={{ height: "300px" }}
            sortable={true}
            sort={sort}
            onSortChange={(e: GridSortChangeEvent) => setSort(e.sort)}
          >
            <GridColumn
              field="selected"
              title=""
              width="50px"
              sortable={false}
              cell={(props) => (
                <td>
                  <input
                    type="checkbox"
                    checked={props.dataItem.selected || false}
                    onChange={() => toggleSelection(props.dataItem.id)}
                  />
                </td>
              )}
            />
            <GridColumn field="patientName" title="Paziente" width="200px" />
            <GridColumn field="externalAccessionNumber" title="Accession" width="120px" />
            <GridColumn
              field="signedDate"
              title="Data Firma"
              width="150px"
              cell={(props) => (
                <td>{new Date(props.dataItem.signedDate).toLocaleString('it-IT')}</td>
              )}
            />
            <GridColumn field="doctorName" title="Medico" width="150px" />
            <GridColumn
              field="pdfSize"
              title="Size"
              width="80px"
              cell={(props) => (
                <td>{Math.round(props.dataItem.pdfSize / 1024)} KB</td>
              )}
            />
            <GridColumn
              title="Azioni"
              width="200px"
              sortable={false}
              cell={(props) => (
                <td>
                  <Button
                    size="small"
                    fillMode="flat"
                    onClick={() => handlePreviewPdf(props.dataItem.id, props.dataItem.patientName)}
                  >
                    PDF Orig
                  </Button>
                  <Button
                    size="small"
                    fillMode="flat"
                    themeColor="warning"
                    onClick={() => handleTestRegenerate(props.dataItem.id, props.dataItem.patientName)}
                  >
                    Test
                  </Button>
                </td>
              )}
            />
          </Grid>

          {/* Template option */}
          <div style={{
            marginTop: "15px",
            padding: "10px 14px",
            background: "#fff3cd",
            borderRadius: "4px",
            border: "1px solid #ffc107"
          }}>
            <label style={{ display: "flex", alignItems: "center", cursor: "pointer", fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={useCurrentTemplate}
                onChange={(e) => setUseCurrentTemplate(e.target.checked)}
                style={{ marginRight: "8px", width: "16px", height: "16px" }}
              />
              Usa header/footer dal modello attuale del medico
            </label>
            <div style={{ fontSize: "11px", color: "#856404", marginTop: "4px", marginLeft: "24px" }}>
              Se attivo, il body del referto viene mantenuto dall'RTF originale,
              ma header e footer vengono presi dal modello corrente del medico.
            </div>
          </div>

          {/* Regenerate Button */}
          <div style={{ marginTop: "15px" }}>
            <Button
              themeColor="error"
              size="large"
              onClick={handleRegenerateSelected}
              disabled={regenerating || selectedCount === 0}
            >
              {regenerating
                ? `Rigenerazione in corso... (${currentProgress}/${totalToProcess})`
                : `Rigenera ${selectedCount} Refert${selectedCount !== 1 ? 'i' : 'o'} Selezionat${selectedCount !== 1 ? 'i' : 'o'}`
              }
            </Button>
          </div>
        </div>
      )}

      {/* Progress/Results */}
      {regenerateResults.length > 0 && (
        <div style={{
          background: "#e8f5e9",
          padding: "15px",
          borderRadius: "8px",
          marginBottom: "20px"
        }}>
          <h4>Risultati Rigenerazione</h4>
          <div>
            Completati: {regenerateResults.filter(r => r.status === "success").length} successi, {' '}
            {regenerateResults.filter(r => r.status === "error").length} errori
          </div>
        </div>
      )}

      {/* Log Section */}
      <div style={{
        background: "#1e1e1e",
        color: "#d4d4d4",
        padding: "15px",
        borderRadius: "8px",
        fontFamily: "monospace",
        fontSize: "12px",
        maxHeight: "300px",
        overflow: "auto"
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "10px",
          borderBottom: "1px solid #444",
          paddingBottom: "5px"
        }}>
          <span>Log Operazioni</span>
          <Button size="small" fillMode="flat" onClick={() => setLogMessages([])}>
            Pulisci
          </Button>
        </div>
        {logMessages.length === 0 ? (
          <div style={{ color: "#666" }}>Nessuna operazione eseguita</div>
        ) : (
          logMessages.map((msg, i) => (
            <div key={i} style={{
              color: msg.includes("ERRORE") ? "#f44" :
                     msg.includes("COMPLETATO") ? "#4f4" :
                     msg.includes("===") ? "#ff0" : "#d4d4d4"
            }}>
              {msg}
            </div>
          ))
        )}
      </div>

      {/* Results Modal */}
      {showResultsModal && (
        <Dialog
          title="Riepilogo Rigenerazione PDF"
          onClose={() => setShowResultsModal(false)}
          width={900}
          height={600}
        >
          <div ref={resultsTableRef}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "15px",
              padding: "10px",
              background: "#f5f5f5",
              borderRadius: "4px"
            }}>
              <div>
                <strong>Totale elaborati:</strong> {regenerateResults.length} |{" "}
                <span style={{ color: "green" }}>
                  Successi: {regenerateResults.filter(r => r.status === "success").length}
                </span>{" "}|{" "}
                <span style={{ color: "red" }}>
                  Errori: {regenerateResults.filter(r => r.status === "error").length}
                </span>
              </div>
              <div>
                <Button themeColor="primary" onClick={handlePrintResults}>
                  Stampa Elenco
                </Button>
              </div>
            </div>

            <div style={{ maxHeight: "400px", overflow: "auto" }}>
              <table style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12px"
              }}>
                <thead>
                  <tr style={{ background: "#e0e0e0" }}>
                    <th style={{ padding: "8px", border: "1px solid #ccc", textAlign: "left" }}>Paziente</th>
                    <th style={{ padding: "8px", border: "1px solid #ccc", textAlign: "left" }}>Accession</th>
                    <th style={{ padding: "8px", border: "1px solid #ccc", textAlign: "center" }}>Esito</th>
                    <th style={{ padding: "8px", border: "1px solid #ccc", textAlign: "right" }}>Size</th>
                    <th style={{ padding: "8px", border: "1px solid #ccc", textAlign: "center" }}>WebReport</th>
                    <th style={{ padding: "8px", border: "1px solid #ccc", textAlign: "center" }}>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {regenerateResults.map((r, idx) => (
                    <tr
                      key={idx}
                      style={{
                        background: r.status === "success" ? "#d4edda" : "#f8d7da"
                      }}
                    >
                      <td style={{ padding: "6px", border: "1px solid #ccc" }}>
                        {r.patientName || "-"}
                      </td>
                      <td style={{ padding: "6px", border: "1px solid #ccc" }}>
                        {r.accessionNumber || "-"}
                      </td>
                      <td style={{ padding: "6px", border: "1px solid #ccc", textAlign: "center" }}>
                        {r.status === "success" ? (
                          <span style={{ color: "green", fontWeight: "bold" }}>OK</span>
                        ) : (
                          <span style={{ color: "red", fontWeight: "bold" }}>ERRORE</span>
                        )}
                      </td>
                      <td style={{ padding: "6px", border: "1px solid #ccc", textAlign: "right" }}>
                        {r.newPdfSize ? `${Math.round(r.newPdfSize / 1024)} KB` : "-"}
                      </td>
                      <td style={{ padding: "6px", border: "1px solid #ccc", textAlign: "center" }}>
                        {r.webReportUpdated ? (
                          <span style={{ color: "green" }}>Aggiornato</span>
                        ) : (
                          <span style={{ color: "#999" }}>Non trovato</span>
                        )}
                      </td>
                      <td style={{ padding: "6px", border: "1px solid #ccc", textAlign: "center" }}>
                        {r.status === "success" && (
                          <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                            <Button
                              size="small"
                              fillMode="flat"
                              onClick={() => viewPdfDigitalSigned(r.reportId)}
                              title="Vedi PDF da DigitalSignedReports"
                            >
                              DSR
                            </Button>
                            {r.webReportUpdated && r.examinationId && r.resultsIds && (
                              <Button
                                size="small"
                                fillMode="flat"
                                themeColor="info"
                                onClick={() => viewPdfWebReport(r.examinationId!, r.resultsIds!)}
                                title="Vedi PDF da WebReportsPdfFilesStream"
                              >
                                WEB
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <DialogActionsBar>
            <Button onClick={() => setShowResultsModal(false)}>Chiudi</Button>
          </DialogActionsBar>
        </Dialog>
      )}
    </div>
  );
};

export default RegeneratePdfPage;
