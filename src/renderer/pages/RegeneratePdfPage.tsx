import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import { Button } from "@progress/kendo-react-buttons";
import { Input } from "@progress/kendo-react-inputs";
import { Grid, GridColumn, GridSortChangeEvent } from "@progress/kendo-react-grid";
import { DatePicker } from "@progress/kendo-react-dateinputs";
import { ComboBox, ComboBoxChangeEvent, ComboBoxFilterChangeEvent, DropDownList, DropDownListChangeEvent } from "@progress/kendo-react-dropdowns";
import { Loader } from "@progress/kendo-react-indicators";
import { Dialog, DialogActionsBar } from "@progress/kendo-react-dialogs";
import { SortDescriptor, orderBy } from "@progress/kendo-data-query";
import { getApiBaseUrl } from "../utility/urlLib";
import "./RegeneratePdfPage.css";

interface Doctor {
  doctorCode: string;
  doctorDescription: string;
}

interface SearchResult {
  id: string;
  patientName: string;
  birthDate: string | null;
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

type PageMode = "regenerate" | "sign-unsigned" | "publish-web";

const UNSIGNED_FILTER_OPTIONS = [
  { text: "Tutti", value: "all" },
  { text: "Salvati da Firmare", value: "saved-for-signing" },
  { text: "Non Firmati da Firmare", value: "not-in-db" },
];

const RegeneratePdfPage: React.FC = () => {
  const navigate = useNavigate();
  const token = useSelector((state: RootState) => state.auth.token);

  const [mode, setMode] = useState<PageMode>("regenerate");
  const [filterType, setFilterType] = useState<string>("all");

  // Search state
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [filteredDoctors, setFilteredDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [examNames, setExamNames] = useState<string[]>([]);
  const [filteredExamNames, setFilteredExamNames] = useState<string[]>([]);
  const [selectedExamName, setSelectedExamName] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [searchFound, setSearchFound] = useState(false);

  // Options
  const [useCurrentTemplate, setUseCurrentTemplate] = useState(false);

  // Processing state
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateResults, setRegenerateResults] = useState<RegenerateResult[]>([]);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);

  // Log
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const logBodyRef = useRef<HTMLDivElement>(null);

  // Modal
  const [showResultsModal, setShowResultsModal] = useState(false);
  const resultsTableRef = useRef<HTMLDivElement>(null);

  // Sort
  const [sort, setSort] = useState<SortDescriptor[]>([{ field: "signedDate", dir: "desc" }]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogMessages(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  // Auto-scroll log
  useEffect(() => {
    if (logBodyRef.current) {
      logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
    }
  }, [logMessages]);

  // Load doctors on mount
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

  // Load distinct exam names on mount
  useEffect(() => {
    const loadExamNames = async () => {
      if (!token) return;
      try {
        const response = await fetch(`${getApiBaseUrl()}reports/distinct-exam-names`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data: string[] = await response.json();
          setExamNames(data);
          setFilteredExamNames(data);
        }
      } catch (error) {
        console.error("Errore caricamento nomi esami:", error);
      }
    };
    loadExamNames();
  }, [token]);

  const handleExamNameFilterChange = (event: ComboBoxFilterChangeEvent) => {
    const filter = event.filter.value.toLowerCase();
    setFilteredExamNames(!filter ? examNames : examNames.filter(n => n.toLowerCase().includes(filter)));
  };

  const handleDoctorFilterChange = (event: ComboBoxFilterChangeEvent) => {
    const filter = event.filter.value.toLowerCase();
    setFilteredDoctors(!filter ? doctors : doctors.filter(d =>
      (d.doctorDescription || "").toLowerCase().includes(filter)
    ));
  };

  const handleSearch = async () => {
    if (!lastName && !firstName && !selectedDoctor && !selectedExamName && !dateFrom && !dateTo) {
      setSearchMessage("Inserisci almeno un criterio di ricerca");
      setSearchFound(false);
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
      if (selectedExamName) params.append("examName", selectedExamName);
      if (dateFrom) {
        const df = `${dateFrom.getFullYear()}-${String(dateFrom.getMonth() + 1).padStart(2, '0')}-${String(dateFrom.getDate()).padStart(2, '0')}`;
        params.append("dateFrom", df);
      }
      if (dateTo) {
        const dt = `${dateTo.getFullYear()}-${String(dateTo.getMonth() + 1).padStart(2, '0')}-${String(dateTo.getDate()).padStart(2, '0')}`;
        params.append("dateTo", dt);
      }

      const endpoint = mode === "sign-unsigned"
        ? `${getApiBaseUrl()}reports/unsigned/search?${params.toString()}&filterType=${filterType}`
        : mode === "publish-web"
        ? `${getApiBaseUrl()}reports/unpublished/search?${params.toString()}`
        : `${getApiBaseUrl()}reports/search?${params.toString()}`;

      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();

      if (data.reports && data.reports.length > 0) {
        const mapped = data.reports.map((r: any) => ({
          ...r,
          id: r.id ?? `${r.examinationId}_${r.resultIds}`,
          selected: false,
        }));
        setSearchResults(mapped);
        setSearchMessage(`Trovati ${data.reports.length} referti`);
        setSearchFound(true);
        addLog(`Trovati ${data.reports.length} referti`);
      } else {
        setSearchMessage(data.message || "Nessun referto trovato");
        setSearchFound(false);
        addLog("Nessun referto trovato");
      }
    } catch (error) {
      setSearchMessage(`Errore nella ricerca: ${error}`);
      setSearchFound(false);
      addLog(`ERRORE: ${error}`);
    } finally {
      setSearching(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSearchResults(prev => prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r));
  };

  const selectAll = () => setSearchResults(prev => prev.map(r => ({ ...r, selected: true })));
  const deselectAll = () => setSearchResults(prev => prev.map(r => ({ ...r, selected: false })));

  const clearFilters = () => {
    setLastName("");
    setFirstName("");
    setSelectedDoctor(null);
    setSelectedExamName(null);
    setDateFrom(null);
    setDateTo(null);
    setFilteredDoctors(doctors);
    setFilteredExamNames(examNames);
  };

  const switchMode = (newMode: PageMode) => {
    setMode(newMode);
    setSearchResults([]);
    setSearchMessage("");
    setRegenerateResults([]);
    setFilterType("all");
  };

  // =====================================================================
  // REGENERATE SINGLE
  // =====================================================================
  const regenerateSingle = async (reportId: string, patientName: string, accessionNumber: string): Promise<RegenerateResult> => {
    try {
      addLog(`Rigenerazione ${patientName} (${reportId})...`);

      const regenUrl = `${getApiBaseUrl()}reports/${reportId}/regenerate-pdf${useCurrentTemplate ? '?useCurrentTemplate=true' : ''}`;
      const regenResponse = await fetch(regenUrl, { headers: { Authorization: `Bearer ${token}` } });

      if (!regenResponse.ok) {
        const errorData = await regenResponse.json();
        throw new Error(errorData.error || "Errore nel recupero RTF");
      }

      const regenData = await regenResponse.json();
      addLog(`  RTF recuperato, PDF convertito`);
      if (regenData.templateUsed) {
        addLog(`  Modello attuale: ${regenData.templateFound ? 'APPLICATO' : 'NON TROVATO (fallback RTF originale)'}`);
      }
      addLog(`  CompanyId: "${regenData.companyId}" - Medico: "${regenData.doctorName}"`);

      let signatureDate: string | undefined;
      if (regenData.originalSignDate) {
        const originalDate = new Date(regenData.originalSignDate);
        originalDate.setHours(originalDate.getHours() + 1);
        signatureDate = originalDate.toISOString();
        addLog(`  Data firma forzata: ${originalDate.toLocaleString()}`);
      }

      const signResult = await (window as any).nativeSign.signPdf({
        pdfBase64: regenData.pdfBase64,
        companyId: regenData.companyId || "",
        footerText: null,
        useRemote: null, otpCode: null, pin: null, userCN: null,
        bypassSignature: true,
        signedByName: regenData.doctorName || regenData.signingUser || "Medico",
        doctorName: regenData.doctorName,
        signatureDate,
      });

      if (!signResult.signedPdfBase64) throw new Error("Decorazione PDF fallita");
      addLog(`  PDF decorato con header/footer`);

      const saveResponse = await fetch(`${getApiBaseUrl()}reports/${reportId}/save-regenerated-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pdfBase64: signResult.signedPdfBase64 }),
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(errorData.error || "Errore nel salvataggio");
      }

      const saveData = await saveResponse.json();
      addLog(`  COMPLETATO: ${patientName} — ${saveData.newPdfSize} bytes`);

      return {
        reportId, status: "success", patientName, accessionNumber,
        examinationId: regenData.examinationId, resultsIds: regenData.resultsIds,
        newPdfSize: saveData.newPdfSize, backupFilePath: saveData.backupFilePath,
        webReportUpdated: saveData.webReportUpdated, message: "Rigenerato con successo",
      };
    } catch (error) {
      addLog(`  ERRORE ${patientName}: ${error}`);
      return { reportId, status: "error", patientName, accessionNumber, message: String(error) };
    }
  };

  // =====================================================================
  // SIGN SINGLE (unsigned)
  // =====================================================================
  const signSingle = async (report: any): Promise<RegenerateResult> => {
    try {
      addLog(`Firma ${report.patientName} (ExamId: ${report.examinationId})...`);

      const prepareUrl = `${getApiBaseUrl()}reports/unsigned/${report.examinationId}/prepare-pdf?resultIds=${encodeURIComponent(report.resultIds)}${useCurrentTemplate ? '&useCurrentTemplate=true' : ''}`;
      const prepareResponse = await fetch(prepareUrl, { headers: { Authorization: `Bearer ${token}` } });

      if (!prepareResponse.ok) {
        const errorData = await prepareResponse.json();
        throw new Error(errorData.error || "Errore nella preparazione PDF");
      }

      const prepareData = await prepareResponse.json();
      addLog(`  PDF generato`);

      let signatureDate: string | undefined;
      if (prepareData.reportDate) {
        const d = new Date(prepareData.reportDate);
        d.setHours(d.getHours() + 1);
        signatureDate = d.toISOString();
      }

      const signResult = await (window as any).nativeSign.signPdf({
        pdfBase64: prepareData.pdfBase64,
        companyId: prepareData.companyId || "",
        footerText: null,
        useRemote: null, otpCode: null, pin: null, userCN: null,
        bypassSignature: true,
        signedByName: prepareData.doctorName || "Medico",
        doctorName: prepareData.doctorName,
        signatureDate,
      });

      if (!signResult.signedPdfBase64) throw new Error("Decorazione PDF fallita");
      addLog(`  PDF decorato`);

      const saveResponse = await fetch(`${getApiBaseUrl()}reports/unsigned/save-signed`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          pdfBase64: signResult.signedPdfBase64,
          examinationId: prepareData.examinationId,
          resultIds: prepareData.resultIds,
          doctorCode: prepareData.doctorCode,
          companyId: prepareData.companyId,
          workareaIds: prepareData.workareaIds,
          applicantId: prepareData.applicantId,
          examinationMnemonicCodeFull: prepareData.examinationMnemonicCodeFull,
          patientId: prepareData.patientId,
        }),
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(errorData.error || "Errore nel salvataggio");
      }

      const saveData = await saveResponse.json();
      addLog(`  COMPLETATO: ${report.patientName} — DSR creato, ${saveData.newPdfSize} bytes`);

      return {
        reportId: saveData.dsrId || report.examinationId.toString(),
        status: "success", patientName: report.patientName,
        accessionNumber: report.externalAccessionNumber,
        examinationId: report.examinationId, resultsIds: report.resultIds,
        newPdfSize: saveData.newPdfSize, message: "Firmato con successo",
      };
    } catch (error) {
      addLog(`  ERRORE ${report.patientName}: ${error}`);
      return {
        reportId: report.examinationId?.toString() || "?",
        status: "error", patientName: report.patientName,
        accessionNumber: report.externalAccessionNumber, message: String(error),
      };
    }
  };

  // =====================================================================
  // PUBLISH SINGLE (to web)
  // =====================================================================
  const publishSingle = async (report: any): Promise<RegenerateResult> => {
    try {
      addLog(`Pubblicazione ${report.patientName} (${report.id})...`);

      const response = await fetch(`${getApiBaseUrl()}reports/${report.id}/publish-to-web`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Errore nella pubblicazione");
      }

      const data = await response.json();

      if (data.status === "already_published") {
        addLog(`  GIA' PUBBLICATO: ${report.patientName}`);
        return {
          reportId: report.id, status: "success", patientName: report.patientName,
          accessionNumber: report.externalAccessionNumber,
          message: "Già pubblicato", webReportUpdated: true,
        };
      }

      addLog(`  PUBBLICATO: ${report.patientName} — ${data.pdfSize} bytes`);
      return {
        reportId: report.id, status: "success", patientName: report.patientName,
        accessionNumber: report.externalAccessionNumber,
        examinationId: report.examinationId, resultsIds: report.resultsIds,
        newPdfSize: data.pdfSize, webReportUpdated: true,
        message: "Pubblicato online",
      };
    } catch (error) {
      addLog(`  ERRORE ${report.patientName}: ${error}`);
      return {
        reportId: report.id, status: "error", patientName: report.patientName,
        accessionNumber: report.externalAccessionNumber, message: String(error),
      };
    }
  };

  // =====================================================================
  // PROCESS SELECTED
  // =====================================================================
  const handleProcessSelected = async () => {
    const selected = searchResults.filter(r => r.selected);
    if (selected.length === 0) {
      setSearchMessage(mode === "regenerate"
        ? "Seleziona almeno un referto da rigenerare"
        : mode === "sign-unsigned"
        ? "Seleziona almeno un referto da firmare"
        : "Seleziona almeno un referto da pubblicare");
      setSearchFound(false);
      return;
    }

    const confirmMsg = mode === "regenerate"
      ? `Stai per rigenerare ${selected.length} refert${selected.length > 1 ? 'i' : 'o'}.\n\nATTENZIONE: I PDF rigenerati NON avranno firma digitale valida (solo bypass estetico).\n\nContinuare?`
      : mode === "sign-unsigned"
      ? `Stai per firmare ${selected.length} refert${selected.length > 1 ? 'i' : 'o'} non firmati.\n\nVerrà creato un record in DigitalSignedReports (ExaminationState=5) e aggiornato StateId a 8.\nLa firma sarà di tipo bypass (estetica, non digitale).\n\nContinuare?`
      : `Stai per pubblicare online ${selected.length} refert${selected.length > 1 ? 'i' : 'o'}.\n\nI PDF verranno copiati in WebReportsPdfFilesStream.\nLa notifica email verrà schedulata tra 1 ora.\n\nContinuare?`;

    if (!window.confirm(confirmMsg)) return;

    setRegenerating(true);
    setTotalToProcess(selected.length);
    setCurrentProgress(0);
    setRegenerateResults([]);
    const actionLabel = mode === "regenerate" ? "RIGENERAZIONE" : mode === "sign-unsigned" ? "FIRMA" : "PUBBLICAZIONE";
    addLog(`=== INIZIO ${actionLabel} DI ${selected.length} REFERTI ===`);

    const results: RegenerateResult[] = [];
    for (let i = 0; i < selected.length; i++) {
      const report = selected[i];
      setCurrentProgress(i + 1);
      const result = mode === "regenerate"
        ? await regenerateSingle(report.id, report.patientName, report.externalAccessionNumber)
        : mode === "sign-unsigned"
        ? await signSingle(report)
        : await publishSingle(report);
      results.push(result);
      setRegenerateResults([...results]);
    }

    const successCount = results.filter(r => r.status === "success").length;
    const errorCount = results.filter(r => r.status === "error").length;
    addLog(`=== COMPLETATO: ${successCount} successi, ${errorCount} errori ===`);
    setRegenerating(false);
    setShowResultsModal(true);
  };

  // =====================================================================
  // PREVIEW / TEST
  // =====================================================================
  const handlePreviewPdf = async (reportId: string, patientName: string) => {
    try {
      addLog(`Anteprima PDF originale: ${patientName}`);
      const response = await fetch(`${getApiBaseUrl()}reports/${reportId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("PDF non trovato");
      const blob = await response.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (error) {
      addLog(`Errore anteprima: ${error}`);
    }
  };

  const handleTestRegenerate = async (reportId: string, patientName: string) => {
    try {
      addLog(`TEST rigenerazione: ${patientName}`);
      const regenUrl = `${getApiBaseUrl()}reports/${reportId}/regenerate-pdf${useCurrentTemplate ? '?useCurrentTemplate=true' : ''}`;
      const regenResponse = await fetch(regenUrl, { headers: { Authorization: `Bearer ${token}` } });

      if (!regenResponse.ok) {
        const errorData = await regenResponse.json();
        throw new Error(errorData.error || "Errore");
      }

      const regenData = await regenResponse.json();
      addLog(`  RTF trovato, PDF rigenerato: ${regenData.pdfBase64.length} chars`);
      addLog(`  CompanyId: "${regenData.companyId}" - Medico: "${regenData.doctorName}"`);
      if (regenData.templateUsed) {
        addLog(`  Modello attuale: ${regenData.templateFound ? 'APPLICATO' : 'NON TROVATO (fallback RTF originale)'}`);
      }

      let signatureDate: string | undefined;
      if (regenData.originalSignDate) {
        const originalDate = new Date(regenData.originalSignDate);
        originalDate.setHours(originalDate.getHours() + 1);
        signatureDate = originalDate.toISOString();
        addLog(`  Data firma forzata: ${originalDate.toLocaleString()}`);
      }

      const signResult = await (window as any).nativeSign.signPdf({
        pdfBase64: regenData.pdfBase64,
        companyId: regenData.companyId || "",
        footerText: null,
        useRemote: null, otpCode: null, pin: null, userCN: null,
        bypassSignature: true,
        signedByName: regenData.doctorName || regenData.signingUser || "Medico",
        doctorName: regenData.doctorName,
        signatureDate,
      });

      const pdfBytes = Uint8Array.from(atob(signResult.signedPdfBase64), c => c.charCodeAt(0));
      window.open(URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' })), '_blank');
      addLog(`  TEST COMPLETATO — PDF aperto in nuova finestra`);
    } catch (error) {
      addLog(`  TEST FALLITO: ${error}`);
    }
  };

  const handleTestUnsigned = async (report: any) => {
    try {
      addLog(`TEST firma: ${report.patientName}`);
      const prepareUrl = `${getApiBaseUrl()}reports/unsigned/${report.examinationId}/prepare-pdf?resultIds=${encodeURIComponent(report.resultIds)}${useCurrentTemplate ? '&useCurrentTemplate=true' : ''}`;
      const prepareResponse = await fetch(prepareUrl, { headers: { Authorization: `Bearer ${token}` } });

      if (!prepareResponse.ok) {
        const errorData = await prepareResponse.json();
        throw new Error(errorData.error || "Errore");
      }

      const prepareData = await prepareResponse.json();
      addLog(`  PDF generato: ${prepareData.pdfBase64.length} chars`);
      addLog(`  CompanyId: "${prepareData.companyId}" - Medico: "${prepareData.doctorName}"`);

      let signatureDate: string | undefined;
      if (prepareData.reportDate) {
        const d = new Date(prepareData.reportDate);
        d.setHours(d.getHours() + 1);
        signatureDate = d.toISOString();
        addLog(`  Data firma forzata: ${d.toLocaleString()}`);
      }

      const signResult = await (window as any).nativeSign.signPdf({
        pdfBase64: prepareData.pdfBase64,
        companyId: prepareData.companyId || "",
        footerText: null,
        useRemote: null, otpCode: null, pin: null, userCN: null,
        bypassSignature: true,
        signedByName: prepareData.doctorName || "Medico",
        doctorName: prepareData.doctorName,
        signatureDate,
      });

      const pdfBytes = Uint8Array.from(atob(signResult.signedPdfBase64), c => c.charCodeAt(0));
      window.open(URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' })), '_blank');
      addLog(`  TEST COMPLETATO — PDF aperto in nuova finestra`);
    } catch (error) {
      addLog(`  TEST FALLITO: ${error}`);
    }
  };

  const viewPdfDigitalSigned = async (reportId: string) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}reports/${reportId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("PDF non trovato");
      window.open(URL.createObjectURL(await response.blob()), '_blank');
    } catch (error) {
      alert(`Errore: ${error}`);
    }
  };

  const viewPdfWebReport = async (examinationId: number, resultsIds: string) => {
    try {
      const response = await fetch(
        `${getApiBaseUrl()}reports/web-pdf?examinationId=${examinationId}&resultsIds=${encodeURIComponent(resultsIds)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error("PDF non trovato in WebReportsPdfFilesStream");
      window.open(URL.createObjectURL(await response.blob()), '_blank');
    } catch (error) {
      alert(`Errore: ${error}`);
    }
  };

  const handlePrintResults = () => {
    const printContent = resultsTableRef.current;
    if (!printContent) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const successCount = regenerateResults.filter(r => r.status === "success").length;
    const errorCount = regenerateResults.filter(r => r.status === "error").length;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Riepilogo Rigenerazione PDF</title>
      <style>body{font-family:Arial,sans-serif;margin:20px}h1{font-size:18px}
      .summary{margin-bottom:15px;font-size:14px}.success{color:green}.error{color:red}
      table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #ccc;padding:6px;text-align:left}
      th{background:#f0f0f0}.status-success{background:#d4edda}.status-error{background:#f8d7da}</style></head>
      <body><h1>Riepilogo Rigenerazione PDF Referti</h1>
      <div class="summary">Data: ${new Date().toLocaleString('it-IT')}<br>
      Totale: ${regenerateResults.length} | <span class="success">Successi: ${successCount}</span> | <span class="error">Errori: ${errorCount}</span></div>
      <table><thead><tr><th>Paziente</th><th>Accession</th><th>Esito</th><th>Size</th><th>WebReport</th><th>Note</th></tr></thead>
      <tbody>${regenerateResults.map(r => `<tr class="status-${r.status}">
        <td>${r.patientName || '-'}</td><td>${r.accessionNumber || '-'}</td>
        <td>${r.status === 'success' ? 'OK' : 'ERRORE'}</td>
        <td>${r.newPdfSize ? Math.round(r.newPdfSize / 1024) + ' KB' : '-'}</td>
        <td>${r.webReportUpdated ? 'Aggiornato' : 'Non trovato'}</td>
        <td>${r.message || ''}</td></tr>`).join('')}
      </tbody></table></body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  // =====================================================================
  // DERIVED
  // =====================================================================
  const selectedCount = searchResults.filter(r => r.selected).length;
  const isSearchEmpty = searchResults.length === 0;

  const actionLabel = mode === "regenerate" ? "Rigenera" : mode === "sign-unsigned" ? "Firma" : "Pubblica";
  const actionBtnLabel = regenerating
    ? `${mode === "regenerate" ? "Rigenerazione" : mode === "sign-unsigned" ? "Firma" : "Pubblicazione"} in corso... (${currentProgress}/${totalToProcess})`
    : selectedCount > 0
      ? `${actionLabel} ${selectedCount} refert${selectedCount !== 1 ? 'i' : 'o'} selezionat${selectedCount !== 1 ? 'i' : 'o'}`
      : `${actionLabel} selezionati`;

  // =====================================================================
  // RENDER
  // =====================================================================
  return (
    <div className="regenerate-pdf-page">

      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <div className="rp-header">
        <Button fillMode="outline" onClick={() => navigate("/")} style={{ flexShrink: 0 }}>
          ← Indietro
        </Button>
        <h2>{mode === "regenerate" ? "Rigenerazione PDF Referti" : mode === "sign-unsigned" ? "Firma Referti Non Firmati" : "Pubblicazione Online Referti"}</h2>
        <div className="rp-mode-tabs">
          <button className={`rp-mode-tab${mode === "regenerate" ? " active" : ""}`} onClick={() => switchMode("regenerate")}>
            Rigenera PDF
          </button>
          <button className={`rp-mode-tab${mode === "sign-unsigned" ? " active" : ""}`} onClick={() => switchMode("sign-unsigned")}>
            Firma Non Firmati
          </button>
          <button className={`rp-mode-tab${mode === "publish-web" ? " active" : ""}`} onClick={() => switchMode("publish-web")}>
            Pubblica Online
          </button>
        </div>
      </div>

      {/* ── BANNER ───────────────────────────────────────────────────── */}
      <div className={`rp-banner ${mode === "regenerate" ? "warning" : "info"}`}>
        {mode === "regenerate" ? (
          <><strong>Attenzione:</strong> i PDF rigenerati avranno solo firma estetica (bypass), non firma digitale valida.</>
        ) : mode === "sign-unsigned" ? (
          <><strong>Nota:</strong> verrà creato un nuovo record in DigitalSignedReports con ExaminationState=5 e StateId=8. Firma di tipo bypass (estetica).</>
        ) : (
          <><strong>Pubblicazione Online:</strong> copia i referti firmati (DigitalSignedReports) su WebReportsPdfFilesStream per renderli disponibili ai pazienti online.</>
        )}
      </div>

      {/* ── PANNELLO RICERCA ─────────────────────────────────────────── */}
      <div className="rp-search-panel">
        {/* Riga superiore: opzione template (non per publish-web) */}
        {mode !== "publish-web" && (
        <div className="rp-search-panel-top">
          <label className="rp-template-option">
            <input
              type="checkbox"
              checked={useCurrentTemplate}
              onChange={(e) => setUseCurrentTemplate(e.target.checked)}
            />
            Usa header/footer dal modello attuale del medico
            <small>(mantiene il body RTF originale)</small>
          </label>
        </div>
        )}

        {/* Filtri */}
        <div className="rp-filters">
          <div className="rp-filter-group">
            <label>Cognome</label>
            <Input value={lastName} onChange={(e) => setLastName(e.value || "")} style={{ width: 140 }} />
          </div>
          <div className="rp-filter-group">
            <label>Nome</label>
            <Input value={firstName} onChange={(e) => setFirstName(e.value || "")} style={{ width: 130 }} />
          </div>
          <div className="rp-filter-group">
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
              style={{ width: 240 }}
            />
          </div>
          <div className="rp-filter-group">
            <label>Esame</label>
            <ComboBox
              data={filteredExamNames}
              value={selectedExamName}
              onChange={(e: ComboBoxChangeEvent) => setSelectedExamName(e.value)}
              onFilterChange={handleExamNameFilterChange}
              placeholder="Seleziona esame..."
              filterable={true}
              style={{ width: 220 }}
            />
          </div>
          <div className="rp-filter-group">
            <label title="Data di firma del referto">Data da</label>
            <DatePicker value={dateFrom} onChange={(e) => setDateFrom(e.value)} format="dd/MM/yyyy" style={{ width: 130 }} />
          </div>
          <div className="rp-filter-group">
            <label title="Data di firma del referto">Data a</label>
            <DatePicker value={dateTo} onChange={(e) => setDateTo(e.value)} format="dd/MM/yyyy" style={{ width: 130 }} />
          </div>
          {mode === "sign-unsigned" && (
            <div className="rp-filter-group">
              <label>Tipo</label>
              <DropDownList
                data={UNSIGNED_FILTER_OPTIONS}
                textField="text"
                dataItemKey="value"
                value={UNSIGNED_FILTER_OPTIONS.find(o => o.value === filterType)}
                onChange={(e: DropDownListChangeEvent) => setFilterType(e.target.value?.value ?? "all")}
                style={{ width: 190 }}
              />
            </div>
          )}
          <div className="rp-filter-actions">
            <Button themeColor="primary" onClick={handleSearch} disabled={searching}>
              {searching ? <Loader size="small" /> : "Cerca"}
            </Button>
            <Button fillMode="outline" onClick={clearFilters}>Pulisci</Button>
          </div>
        </div>

        {/* Messaggio ricerca */}
        {searchMessage && (
          <div className={`rp-search-message ${searchFound ? "found" : searching ? "info" : "empty"}`}>
            {searchMessage}
          </div>
        )}
      </div>

      {/* ── GRIGLIA ──────────────────────────────────────────────────── */}
      {isSearchEmpty ? (
        <div className="rp-grid-section" style={{ minHeight: 160 }}>
          <div className="rp-grid-empty">
            <div className="rp-grid-empty-icon">🔍</div>
            <span>Usa i filtri sopra per cercare i referti</span>
          </div>
        </div>
      ) : (
        <div className="rp-grid-section" style={{ flex: 1 }}>
          <Grid
            data={orderBy(searchResults, sort)}
            style={{ height: "100%" }}
            sortable={true}
            sort={sort}
            onSortChange={(e: GridSortChangeEvent) => setSort(e.sort)}
            onRowClick={(e) => !regenerating && toggleSelection(e.dataItem.id)}
            rowRender={(row, props) => {
              const item = props.dataItem as SearchResult;
              return React.cloneElement(row, {
                className: `${row.props.className || ""} ${item.selected ? "row-selected" : ""}`,
              });
            }}
          >
            <GridColumn
              field="selected" title=" " width="50px" sortable={false}
              cell={(props) => (
                <td>
                  <input
                    type="checkbox"
                    checked={props.dataItem.selected || false}
                    onChange={() => toggleSelection(props.dataItem.id)}
                    style={{ accentColor: "#3b82f6", width: 15, height: 15 }}
                  />
                </td>
              )}
            />
            <GridColumn field="patientName" title="Paziente" width="200px" />
            <GridColumn
              field="birthDate" title="Data Nascita" width="110px"
              cell={(props) => (
                <td>{props.dataItem.birthDate ? new Date(props.dataItem.birthDate + 'T00:00:00').toLocaleDateString('it-IT') : '—'}</td>
              )}
            />
            <GridColumn field="externalAccessionNumber" title="Accession" width="120px" />
            {mode === "regenerate" || mode === "publish-web" ? (
              <GridColumn
                field="signedDate" title="Data Firma" width="150px"
                cell={(props) => <td>{new Date(props.dataItem.signedDate).toLocaleString('it-IT')}</td>}
              />
            ) : (
              <GridColumn
                field="examinationDate" title="Data Accettazione" width="150px"
                cell={(props) => (
                  <td>{props.dataItem.examinationDate ? new Date(props.dataItem.examinationDate).toLocaleString('it-IT') : '—'}</td>
                )}
              />
            )}
            <GridColumn field="doctorName" title="Medico" />
            {mode === "regenerate" || mode === "publish-web" ? (
              <GridColumn
                field="pdfSize" title="Size" width="80px"
                cell={(props) => <td>{Math.round(props.dataItem.pdfSize / 1024)} KB</td>}
              />
            ) : (
              <>
                <GridColumn field="examNames" title="Esami" width="170px" />
                <GridColumn
                  field="category" title="Tipo" width="130px" sortable={false}
                  cell={(props) => {
                    const cat = props.dataItem.category as string;
                    return (
                      <td>
                        <span className={`rp-category-badge ${cat === "saved-for-signing" ? "saved" : "unsigned"}`}>
                          {cat === "saved-for-signing" ? "Da Firmare" : "Non Firmato"}
                        </span>
                      </td>
                    );
                  }}
                />
              </>
            )}
            <GridColumn
              title="Azioni" width="120px" sortable={false}
              cell={(props) => (
                <td>
                  <div style={{ display: "flex", gap: 4 }}>
                    {(mode === "regenerate" || mode === "publish-web") && (
                      <Button size="small" fillMode="flat" onClick={(e) => { e.stopPropagation(); handlePreviewPdf(props.dataItem.id, props.dataItem.patientName); }}>
                        PDF
                      </Button>
                    )}
                    {mode !== "publish-web" && (
                    <Button size="small" fillMode="flat" themeColor="warning"
                      onClick={(e) => {
                        e.stopPropagation();
                        mode === "regenerate"
                          ? handleTestRegenerate(props.dataItem.id, props.dataItem.patientName)
                          : handleTestUnsigned(props.dataItem);
                      }}
                    >
                      Test
                    </Button>
                    )}
                  </div>
                </td>
              )}
            />
          </Grid>
        </div>
      )}

      {/* ── BARRA SELEZIONE + AZIONE ─────────────────────────────────── */}
      <div className="rp-action-bar">
        <div className="rp-action-bar-left">
          <Button fillMode="outline" size="small" onClick={selectAll} disabled={isSearchEmpty || regenerating}>
            Seleziona tutti
          </Button>
          <Button fillMode="outline" size="small" onClick={deselectAll} disabled={selectedCount === 0 || regenerating}>
            Deseleziona
          </Button>
          {!isSearchEmpty && (
            <span className="rp-selection-count">
              {selectedCount} selezionati su {searchResults.length}
            </span>
          )}
        </div>
        <div className="rp-action-bar-right">
          {regenerating && (
            <div className="rp-progress-inline">
              <Loader size="small" type="pulsing" />
              <span>Elaborazione <strong>{currentProgress}/{totalToProcess}</strong></span>
            </div>
          )}
          <Button
            themeColor={mode === "publish-web" ? "primary" : "error"}
            onClick={handleProcessSelected}
            disabled={regenerating || selectedCount === 0}
          >
            {actionBtnLabel}
          </Button>
        </div>
      </div>

      {/* ── LOG ──────────────────────────────────────────────────────── */}
      <div className="rp-log-section">
        <div className="rp-log-header">
          <span className="rp-log-title">LOG OPERAZIONI</span>
          <Button size="small" fillMode="flat" style={{ color: "#94a3b8" }} onClick={() => setLogMessages([])}>
            Pulisci
          </Button>
        </div>
        <div className="rp-log-body" ref={logBodyRef}>
          {logMessages.length === 0 ? (
            <span className="rp-log-empty">Nessuna operazione eseguita</span>
          ) : (
            logMessages.map((msg, i) => (
              <div key={i} className={`rp-log-line${
                msg.includes("ERRORE") ? " error" :
                msg.includes("COMPLETATO") ? " success" :
                msg.includes("===") ? " separator" : ""
              }`}>{msg}</div>
            ))
          )}
        </div>
      </div>

      {/* ── MODALE RISULTATI ─────────────────────────────────────────── */}
      {showResultsModal && (
        <Dialog
          title={mode === "regenerate" ? "Riepilogo Rigenerazione PDF" : mode === "sign-unsigned" ? "Riepilogo Firma Referti" : "Riepilogo Pubblicazione Online"}
          onClose={() => setShowResultsModal(false)}
          width={900}
        >
          <div ref={resultsTableRef} style={{ padding: "16px" }}>
            <div className="rp-results-summary">
              <div>
                <strong>Totale elaborati:</strong> {regenerateResults.length}
                {" · "}
                <span className="success-count">
                  ✓ Successi: {regenerateResults.filter(r => r.status === "success").length}
                </span>
                {" · "}
                <span className="error-count">
                  ✕ Errori: {regenerateResults.filter(r => r.status === "error").length}
                </span>
              </div>
              <Button themeColor="primary" fillMode="outline" size="small" onClick={handlePrintResults}>
                Stampa elenco
              </Button>
            </div>

            <div className="rp-results-table-wrap">
              <table className="rp-results-table">
                <thead>
                  <tr>
                    <th>Paziente</th>
                    <th>Accession</th>
                    <th style={{ textAlign: "center" }}>Esito</th>
                    <th style={{ textAlign: "right" }}>Size</th>
                    <th style={{ textAlign: "center" }}>WebReport</th>
                    <th style={{ textAlign: "center" }}>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {regenerateResults.map((r, idx) => (
                    <tr key={idx} className={`status-${r.status}`}>
                      <td>{r.patientName || "—"}</td>
                      <td>{r.accessionNumber || "—"}</td>
                      <td style={{ textAlign: "center" }}>
                        {r.status === "success"
                          ? <span className="badge-ok">OK</span>
                          : <span className="badge-err" title={r.message}>ERRORE</span>
                        }
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {r.newPdfSize ? `${Math.round(r.newPdfSize / 1024)} KB` : "—"}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {r.webReportUpdated
                          ? <span className="web-updated">Aggiornato</span>
                          : <span className="web-missing">Non trovato</span>
                        }
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {r.status === "success" && (
                          <div className="rp-pdf-actions">
                            <Button size="small" fillMode="flat" onClick={() => viewPdfDigitalSigned(r.reportId)} title="PDF da DigitalSignedReports">
                              DSR
                            </Button>
                            {r.webReportUpdated && r.examinationId && r.resultsIds && (
                              <Button size="small" fillMode="flat" themeColor="info" onClick={() => viewPdfWebReport(r.examinationId!, r.resultsIds!)} title="PDF da WebReportsPdfFilesStream">
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
