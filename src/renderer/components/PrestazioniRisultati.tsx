import React, { useEffect, useState, useRef, useMemo } from "react";
import { Grid, GridColumn as Column } from "@progress/kendo-react-grid";
import moment from "moment";
import { Button } from "@progress/kendo-react-buttons";
import { Dialog, DialogActionsBar } from "@progress/kendo-react-dialogs";
import { useNavigate } from "react-router-dom";
import { SvgIcon } from "@progress/kendo-react-common";
import { uploadIcon, editToolsIcon } from "@progress/kendo-svg-icons";
// Indicatori di stato
import { Loader } from '@progress/kendo-react-indicators';
import labels from "../utility/label";
import "./PrestazioniRisultati.css";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store";
import {
  url_examResults,
  url_singleReportHTML,
  url_linkedReportTemplatesHTML,
  url_insertPdfAttachment,
  url_GetPatientRTFHtmlResult,
  url_getPatientReport,
  url_DeletePatientPdfReport,
  url_getPrescriptionTemplate,
  url_getExistingPrescription,
} from "../utility/urlLib";

import {
  setSelectedExamId,
  addExamToSelectedMoreExams,
  addMultipleExamsToSelectedMoreExams,
} from "../store/examinationSlice";

import {
  setPrescriptionContent,
  setCurrentExamResultId,
  setCurrentExaminationId,
  setIsEditingPrescription,
  setHasExistingPrescription,
  setExistingPrescriptionId,
  setCreatedBy,
  setLastModified,
  setIsReadOnly,
  setExamDescription,
  setLinkedExams,
} from "../store/prescriptionSlice";

// [MODIFICA] Import per il sorting built-in
import { orderBy, SortDescriptor } from "@progress/kendo-data-query";
import { GridSortChangeEvent } from "@progress/kendo-react-grid";

const dateFormatter = (date: string) => moment(date).format("DD/MM/YYYY");

const PrestazioniRisultati = () => {
  // -------------------------------------------------
  // Stati e store
  // -------------------------------------------------
  const [loadingExamResults, setLoadingExamResults] = useState(false);
  const [resultsData, setResultsData] = useState<any[]>([]);
  const [visible, setVisible] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);
  const [uploadedPdf, setUploadedPdf] = useState<File | null>(null);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [selectedExamForPdf, setSelectedExamForPdf] = useState<any>(null);
  const [pdfOptionsVisible, setPdfOptionsVisible] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [isFileSelected, setIsFileSelected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shouldFetchPdf, setShouldFetchPdf] = useState(false);
  const [existingPdfBase64, setExistingPdfBase64] = useState<string | null>(null);
  const [pdfPreviewVisible, setPdfPreviewVisible] = useState<boolean>(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  // Valori dal Redux store
  const doctorCode = useSelector((state: RootState) => state.auth.doctorCode);
  const selectedExaminationId = useSelector((state: RootState) => state.exam.selectedExaminationId);
  const selectedPatientId = useSelector((state: RootState) => state.exam.selectedPatientId);
  const selectedDoctorCode = useSelector((state: RootState) => state.exam.selectedDoctorCode);
  const registrations = useSelector((state: RootState) => state.registrations);
  const units = useSelector((state: RootState) => state.filters.units);
  const sectors = useSelector((state: RootState) => state.filters.sectors);
  const token = useSelector((state: RootState) => state.auth.token);
  const isTechnician = useSelector((state: RootState) => state.auth.isTechnician);
  const technicianCode = useSelector((state: RootState) => state.auth.technicianCode || state.auth.userName);

  // Parametri di fetch (null => non usati)
  const includeScheduled = null;
  const showTitlesAlso = null;
  const allResults = null;

  const [selectedUniqueRefs, setSelectedUniqueRefs] = useState<string[]>([]);

  // Sorting
  const [sort, setSort] = useState<SortDescriptor[]>([]);

  // Track which exams have existing prescriptions
  const [examsWithPrescriptions, setExamsWithPrescriptions] = useState<Set<number>>(new Set());

  // -------------------------------------------------
  // useEffect: carica esami se selectedExaminationId valido
  // -------------------------------------------------
  useEffect(() => {
    if (
      selectedExaminationId &&
      selectedExaminationId !== "" &&
      registrations.length > 0
    ) {
      console.log(
        "Invocazione di fetchExamResults con ID:",
        selectedExaminationId,
        "e doctorCode:",
        doctorCode
      );
      setResultsData([]);
      fetchExamResults();
    } else {
      setResultsData([]);
    }
  }, [selectedExaminationId, selectedDoctorCode, registrations]);

  // -------------------------------------------------
  // checkExistingPrescriptions
  // -------------------------------------------------
  const checkExistingPrescriptions = async (data: any[]) => {
    const examResultIds = data.map((item: any) => item.examResultId);
    const prescriptionsSet = new Set<number>();

    // Verifica per ogni esame se esiste una prescrizione
    const prescriptionChecks = examResultIds.map(async (examResultId: number) => {
      try {
        const response = await fetch(
          `${url_getExistingPrescription()}?examResultId=${examResultId}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          if (data.exists) {
            prescriptionsSet.add(examResultId);
          }
        }
      } catch (error) {
        // Errore di rete, ignora
      }
    });

    await Promise.all(prescriptionChecks);
    setExamsWithPrescriptions(prescriptionsSet);
  };

  // -------------------------------------------------
  // fetchExamResults
  // -------------------------------------------------
  const fetchExamResults = async () => {
    if (!selectedExaminationId) return;

    setLoadingExamResults(true);

    const clinicDepartmentIds = Object.keys(units)
      .filter((key) => units[key])
      .map((key) => key.trim())
      .join(",");

    const workareaIds = Object.keys(sectors)
      .filter((key) => sectors[key])
      .map((key) => key.trim())
      .join(",");

    const queryParams = new URLSearchParams();
    queryParams.append("examinationId", selectedExaminationId);
    if (clinicDepartmentIds)
      queryParams.append("clinicDepartmentIds", clinicDepartmentIds);
    if (selectedDoctorCode)
      queryParams.append("doctorCode", selectedDoctorCode.trim());
    if (workareaIds) queryParams.append("workareaIds", workareaIds);
    if (includeScheduled !== null && includeScheduled !== undefined)
      queryParams.append("includeScheduled", String(includeScheduled));
    if (showTitlesAlso !== null && showTitlesAlso !== undefined)
      queryParams.append("showTitlesAlso", String(showTitlesAlso));
    if (allResults !== null && allResults !== undefined)
      queryParams.append("allResults", String(allResults));

    try {
      const response = await fetch(`${url_examResults()}?${queryParams.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        let data = await response.json();

        // Aggiunta logica per "isLinkedResult"
        data = data.map((item: any) => ({
          ...item,
          isLinkedResult:
            (item.linkedResults && item.linkedResults.trim() !== "") ||
            (item.examResultStateId < 6 &&
              (item.linkedResults == null ||
                item.linkedResults.trim() === ""))
        }));

        // Filtra i record in stato "refertato" (id=8) per i tecnici
        if (isTechnician) {
          data = data.filter((item: any) => item.examResultStateId !== 8);
        }

        setResultsData(data);

        // Inizializza la selezione dei RefUnici in base a isLinkedResult
        const initiallyLinked = data
          .filter((item: any) => item.isLinkedResult)
          .map((item: any) => item.examId);
        setSelectedUniqueRefs(initiallyLinked);

        // Verifica quali esami hanno prescrizioni esistenti
        checkExistingPrescriptions(data);
      } else {
        console.error("Failed to fetch exam results");
      }
    } catch (error) {
      console.error("Error fetching exam results:", error);
    } finally {
      setLoadingExamResults(false);
    }
  };

  // -------------------------------------------------
  // fetchSingleReport (aggiungiamo readOnly come 3Â° arg)
  // -------------------------------------------------
  const fetchSingleReport = async (doctorCode: string, exam: any, readOnly: boolean, openedByOtherDoctor: boolean) => {
    // Seleziona l'esame
    dispatch(setSelectedExamId(exam.examId));
    dispatch(addExamToSelectedMoreExams(exam));

    // Se l'esame ha già un result (examResultStateId in [5,6,8]) e c'è un'immagine/stream...
    if (
      (exam.examResultStateId === 5 ||
        exam.examResultStateId === 6 ||
        exam.examResultStateId === 8) &&
      (exam.imageResult != null || exam.streamResultId != null)
    ) {
      const queryParams = new URLSearchParams({
        examResultId: exam.examResultId.toString(),
      });
      try {
        const response = await fetch(
          `${url_GetPatientRTFHtmlResult()}?${queryParams.toString()}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          // Passiamo readOnly e requiresRtfEditor
          navigate("/editor", { state: { htmlContent: data.html, readOnly, openedByOtherDoctor, requiresRtfEditor: data.requiresRtfEditor } });
        } else {
          console.error("Failed to fetch existing report");
        }
      } catch (error) {
        console.error("Error fetching existing report:", error);
      }
    } else {
      // Altrimenti fetch del template
      const queryParams = new URLSearchParams({
        examinationId: selectedExaminationId || "",
        subExamId: exam.subExamId.toString(),
        examVersion: exam.examVersion.toString(),
        examId: exam.examId.toString(),
        doctorCode: doctorCode.trim(),
      });
      try {
        const response = await fetch(
          `${url_singleReportHTML()}?${queryParams.toString()}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          navigate("/editor", { state: { htmlContent: data.html, readOnly, requiresRtfEditor: data.requiresRtfEditor } });
        } else {
          console.error("Failed to fetch report template");
        }
      } catch (error) {
        console.error("Error fetching report template:", error);
      }
    }
  };

  // -------------------------------------------------
  // fetchMoreReports (aggiungiamo readOnly come 3Â° arg)
  // -------------------------------------------------
  const fetchMoreReports = async (
    examIds: string[],
    doctorCode: string,
    readOnly: boolean,
    openedByOtherDoctor: boolean) => {
    const selectedExams = resultsData.filter((item) =>
      examIds.includes(item.examId)
    );

    if (selectedExams.length === 0) {
      console.error("No exams found for the given IDs");
      return;
    }

    // Selezioniamo il primo
    dispatch(setSelectedExamId(selectedExams[0].examId));
    dispatch(addMultipleExamsToSelectedMoreExams(selectedExams));

    // Controlla se tutti hanno un result
    const allExamsHaveResult = selectedExams.every(
      (exam: any) =>
        (exam.examResultStateId === 5 ||
          exam.examResultStateId === 6 ||
          exam.examResultStateId === 8) &&
        (exam.imageResult != null || exam.streamResultId != null)
    );

    if (allExamsHaveResult) {
      // Carica la RTF esistente del primo
      const exam = selectedExams[0];
      const queryParams = new URLSearchParams({
        examResultId: exam.examResultId.toString(),
      });
      try {
        const response = await fetch(
          `${url_GetPatientRTFHtmlResult()}?${queryParams.toString()}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          navigate("/editor", { state: { htmlContent: data.html, readOnly, openedByOtherDoctor, requiresRtfEditor: data.requiresRtfEditor } });
        } else {
          console.error("Failed to fetch existing reports");
        }
      } catch (error) {
        console.error("Error fetching existing reports:", error);
      }
    } else {
      // Fai la POST a url_linkedReportTemplatesHTML
      const payload = selectedExams.map((exam: any) => ({
        examId: exam.examId,
        examVersion: exam.examVersion,
        subExamId: exam.subExamId,
        examResultId: exam.examResultId,
      }));

      const queryParams = new URLSearchParams({
        doctorCode: doctorCode.trim(),
        examinationId: selectedExaminationId || "",
      });

      try {
        const response = await fetch(
          `${url_linkedReportTemplatesHTML()}?${queryParams.toString()}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          }
        );

        if (response.ok) {
          const data = await response.json();
          navigate("/editor", { state: { htmlContent: data.html, readOnly, requiresRtfEditor: data.requiresRtfEditor } });
        } else {
          console.error("Failed to fetch report templates");
        }
      } catch (error) {
        console.error("Error fetching report templates:", error);
      }
    }
  };

  // -------------------------------------------------
  // useEffect per fetch PDF se stiamo caricando un allegato
  // -------------------------------------------------
  useEffect(() => {
    if (shouldFetchPdf && selectedExamForPdf) {
      setShouldFetchPdf(false);

      const fetchPatientReport = async () => {
        const queryParams = new URLSearchParams({
          examResultId: selectedExamForPdf.examResultId.toString(),
        });

        try {
          const response = await fetch(
            `${url_getPatientReport()}?${queryParams.toString()}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (response.ok) {
            const base64Pdf = await response.text();
            setExistingPdfBase64(base64Pdf);
            setPdfOptionsVisible(true);
            setVisible(false);
          } else if (response.status === 404) {
            setVisible(true);
            setPdfOptionsVisible(false);
          } else {
            console.error(
              "Failed to fetch patient report. Status:",
              response.status
            );
          }
        } catch (error) {
          console.error("Error fetching patient report:", error);
        }
      };

      fetchPatientReport();
    }
  }, [shouldFetchPdf, selectedExamForPdf, token]);

  // -------------------------------------------------
  // handleViewPdf
  // -------------------------------------------------
  const handleViewPdf = () => {
    if (!existingPdfBase64) {
      console.error("Nessun PDF disponibile per la visualizzazione");
      return;
    }

    const byteCharacters = atob(existingPdfBase64);
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "application/pdf" });
    const pdfUrl = URL.createObjectURL(blob);

    setPdfOptionsVisible(false);
    setPdfPreviewUrl(pdfUrl);
    setPdfPreviewVisible(true);
  };

  // -------------------------------------------------
  // handlePrescriptionClick - Gestione prescrizioni
  // -------------------------------------------------
  const handlePrescriptionClick = async (exam: any) => {
    try {
      const { examId, examVersion, subExamId, examResultId } = exam;
      const userCode = technicianCode || doctorCode;

      if (!userCode) {
        console.error("User code not available");
        return;
      }

      // Raccogli tutti gli esami flaggati come "Prescr. Unica" per i tecnici
      let linkedExamsData: Array<{ examResultId: number; examId: number; examName: string; subExamName: string | null }> = [];
      if (isTechnician && selectedUniqueRefs.includes(examId)) {
        // Include l'esame corrente e tutti gli altri flaggati
        linkedExamsData = resultsData
          .filter((item: any) => selectedUniqueRefs.includes(item.examId))
          .map((item: any) => ({
            examResultId: item.examResultId,
            examId: item.examId,
            examName: item.examName,
            subExamName: item.subExamName
          }));
      } else {
        // Se non è un tecnico o non è flaggato, solo l'esame corrente
        linkedExamsData = [{
          examResultId: exam.examResultId,
          examId: exam.examId,
          examName: exam.examName,
          subExamName: exam.subExamName
        }];
      }

      // Passa la lista degli esami collegati allo store
      dispatch(setLinkedExams(linkedExamsData));

      // 1. Verifica se esiste già una prescrizione
      try {
        const existingResponse = await fetch(
          `${url_getExistingPrescription()}?examResultId=${examResultId}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (existingResponse.ok) {
          const data = await existingResponse.json();

          // Verifica se la prescrizione esiste tramite il flag
          if (data.exists) {
            // Prescrizione esistente trovata
            const { htmlContent, prescriptionId, createdBy, lastModified } = data;

            console.log('=== PRESCRIZIONE ESISTENTE CARICATA ===');
            console.log('HTML Content length:', htmlContent?.length || 0);
            console.log('HTML Content preview:', htmlContent?.substring(0, 100));

            dispatch(setPrescriptionContent(htmlContent));
            dispatch(setCurrentExamResultId(examResultId));
            dispatch(setCurrentExaminationId(Number(selectedExaminationId)));
            dispatch(setHasExistingPrescription(true));
            dispatch(setExistingPrescriptionId(prescriptionId));
            dispatch(setCreatedBy(createdBy));
            dispatch(setLastModified(lastModified));

            // Descrizione esame
            if (linkedExamsData.length > 1) {
              dispatch(setExamDescription(`Prescrizione Unica per ${linkedExamsData.length} Esami`));
            } else {
              dispatch(setExamDescription(exam.examName));
            }

            // Verifica se il tecnico può modificare (solo se creata da lui)
            const isReadOnly =
              createdBy &&
              createdBy.trim().toUpperCase() !== userCode.trim().toUpperCase();
            dispatch(setIsReadOnly(isReadOnly));

            // Aggiungi l'esame al set di quelli con prescrizione
            setExamsWithPrescriptions(prev => new Set(prev).add(examResultId));

            dispatch(setIsEditingPrescription(true));
            return;
          } else {
            // Prescrizione non esistente, procedi con il template
            console.log("No existing prescription:", data.message);
          }
        }
      } catch (error) {
        // Errore di rete, procedi con il template
        console.log("Error fetching prescription, fetching template:", error);
      }

      // 2. Carica template prescrizione (o documento vuoto)
      const templateResponse = await fetch(
        `${url_getPrescriptionTemplate()}?` +
          `technicianCode=${encodeURIComponent(userCode)}&` +
          `examId=${examId}&` +
          `examVersion=${examVersion}&` +
          `subExamId=${subExamId}&` +
          `examinationId=${selectedExaminationId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (templateResponse.ok) {
        const data = await templateResponse.json();
        const { htmlContent } = data;

        console.log('=== TEMPLATE PRESCRIZIONE CARICATO ===');
        console.log('HTML Content length:', htmlContent?.length || 0);
        console.log('HTML Content preview:', htmlContent?.substring(0, 100));

        dispatch(setPrescriptionContent(htmlContent));
        dispatch(setCurrentExamResultId(examResultId));
        dispatch(setCurrentExaminationId(Number(selectedExaminationId)));
        dispatch(setHasExistingPrescription(false));
        dispatch(setExistingPrescriptionId(null));
        dispatch(setCreatedBy(null));
        dispatch(setLastModified(null));
        dispatch(setIsReadOnly(false));

        // Descrizione esame
        if (linkedExamsData.length > 1) {
          dispatch(setExamDescription(`Prescrizione Unica per ${linkedExamsData.length} Esami`));
        } else {
          dispatch(setExamDescription(exam.examName));
        }

        dispatch(setIsEditingPrescription(true));
      } else {
        console.error("Failed to fetch prescription template");
      }
    } catch (error) {
      console.error("Error handling prescription click:", error);
    }
  };

const handleIconClick = (subExamTypeId: number, exam: any) => {

    // 1. [CONTROLLO DI SICUREZZA] Verifica che la combinazione esista nella lista caricata
    const isValidCombination = registrations.some(
      (reg) => 
        reg.examinationId === Number(selectedExaminationId) && 
        reg.patientId === Number(selectedPatientId)
    );

    if (!isValidCombination) {
      // Questo blocco non dovrebbe mai essere raggiunto dati i controlli precedenti,
      // ma agisce come un'importante rete di sicurezza.
      console.error("Tentativo di accesso all'editor con dati incoerenti:", {
        selectedExaminationId,
        selectedPatientId,
      });
      alert(
        "Errore di coerenza dei dati. Impossibile aprire l'editor. Si prega di riavviare la ricerca manualmente e segnalare il problema all'assistenza tecnica."
      );
      return;
    }

  if (subExamTypeId === 5) {
    setSelectedExamForPdf(exam);
    setShouldFetchPdf(true);
    return;
  }

  const doctorCodeResult = (exam.doctorCode ?? "").trim();
  const doctorCodeUser = (doctorCode ?? "").trim();
  const openedByOtherDoctor = doctorCodeResult && doctorCodeUser && (doctorCodeResult !== doctorCodeUser);

  const isRefertato = exam.examResultStateId === 8;
  let examResultInsertDate = moment(exam.resultInsertDate, "YYYY-MM-DD");
  let examResultModifyDate = moment(exam.resultInsertDate, "YYYY-MM-DD");

  if (exam.lastModifyDate) {
    const lastMod = moment(exam.lastModifyDate, "YYYY-MM-DD");
    if (lastMod.isAfter(examResultInsertDate)) {
      examResultModifyDate = lastMod;
    }
  }

  const oggi = moment().startOf("day");
  const olderThanToday = examResultModifyDate.isBefore(oggi);

  let readOnly = false;
  if (openedByOtherDoctor) {
    readOnly = true;
  } else {
    readOnly = isRefertato && olderThanToday;
  }

  const insertDate = exam.resultInsertDate;
  const isLinked =
    exam.isLinkedResult === true ||
    (exam.linkedResults && exam.linkedResults.trim() !== "");
  const isRefUnicoSelected = selectedUniqueRefs.includes(exam.examId);

  if (insertDate != null) {
    if (isLinked) {
      let linkedExamResultIds: string[] = [];
      if (exam.linkedResults && exam.linkedResults.trim() !== "") {
        linkedExamResultIds = exam.linkedResults
          .split(",")
          .map((id: string) => id.trim());
      }

      const linkedExamIds = resultsData
        .filter((item: any) =>
          linkedExamResultIds.includes(item.examResultId.toString())
        )
        .map((item: any) => item.examId);

      if (linkedExamIds.length > 1) {
        dispatch(setSelectedExamId(exam.examId));
        dispatch(
          addMultipleExamsToSelectedMoreExams(
            resultsData.filter((item: any) =>
              linkedExamIds.includes(item.examId)
            )
          )
        );
        if (doctorCode && doctorCode.trim() !== "") {
          fetchMoreReports(linkedExamIds, doctorCode, readOnly, openedByOtherDoctor);
        } else {
          console.error("Doctor code is null or empty");
        }
      } else {
        dispatch(setSelectedExamId(exam.examId));
        if (doctorCode && doctorCode.trim() !== "") {
          fetchSingleReport(doctorCode, exam, readOnly, openedByOtherDoctor);
        } else {
          console.error("Doctor code is null or empty");
        }
      }
    } else {
      dispatch(setSelectedExamId(exam.examId));
      if (doctorCode && doctorCode.trim() !== "") {
        fetchSingleReport(doctorCode, exam, readOnly, openedByOtherDoctor);
      } else {
        console.error("Doctor code is null or empty");
      }
    }
  } else {
    if (isRefUnicoSelected) {
      const selectedAndNotWorked = selectedUniqueRefs.filter((id) => {
        const record = resultsData.find((r: any) => r.examId === id);
        return record && record.resultInsertDate == null;
      });

      if (selectedAndNotWorked.length > 1) {
        dispatch(setSelectedExamId(exam.examId));
        const selectedExams = resultsData.filter(
          (item: any) =>
            selectedAndNotWorked.includes(item.examId) &&
            item.subExamTypeId === 4
        );
        dispatch(addMultipleExamsToSelectedMoreExams(selectedExams));
        if (doctorCode && doctorCode.trim() !== "") {
          fetchMoreReports(selectedAndNotWorked, doctorCode, readOnly, openedByOtherDoctor);
        } else {
          console.error("Doctor code is null or empty");
        }
      } else {
        dispatch(setSelectedExamId(exam.examId));
        if (doctorCode && doctorCode.trim() !== "") {
          fetchSingleReport(doctorCode, exam, readOnly, openedByOtherDoctor);
        } else {
          console.error("Doctor code is null or empty");
        }
      }
    } else {
      dispatch(setSelectedExamId(exam.examId));
      if (doctorCode && doctorCode.trim() !== "") {
        fetchSingleReport(doctorCode, exam, readOnly, openedByOtherDoctor);
      } else {
        console.error("Doctor code is null or empty");
      }
    }
  }
};



  // -------------------------------------------------
  // handleClose => chiude dialog
  // -------------------------------------------------
  const handleClose = () => {
    setVisible(false);
  };

  // -------------------------------------------------
  // uploadPdfAttachment
  // -------------------------------------------------
  const uploadPdfAttachment = async (exam: any) => {
    if (!pdfFile) {
      console.error("Nessun PDF caricato");
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(pdfFile);
    reader.onload = async () => {
      const base64Pdf = reader.result?.toString().split(",")[1];

      const body = {
        pdfBase64: base64Pdf,
        examinationId: Number(selectedExaminationId),
        examId: exam.examId,
        examVersion: 0,
        subExamId: 0,
        examResultId: exam.examResultId,
        doctorCode: exam.doctorCode.trim(),
      };

      try {
        const response = await fetch(url_insertPdfAttachment(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });

        if (response.ok) {
          console.log("PDF allegato caricato con successo");
        } else {
          const errorData = await response.json();
          console.error(
            "Errore durante il caricamento dell'allegato PDF:",
            errorData
          );
        }
      } catch (error) {
        console.error("Errore durante il caricamento del PDF:", error);
      }
    };
  };

  // -------------------------------------------------
  // handleFileUpload
  // -------------------------------------------------
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.type === "application/pdf") {
        setPdfFile(file);
        setIsFileSelected(true);
      } else {
        console.error("Non è un file PDF valido");
      }
    }
  };

  // -------------------------------------------------
  // handleSignPdfExternally
  // -------------------------------------------------
  const handleSignPdfExternally = () => {
    if (!pdfFile) {
      console.error("Nessun PDF caricato");
      return;
    }

    const externalSignUrl = `https://example-sign-service.com/sign?fileName=${pdfFile.name}`;
    const signWindow = window.open(externalSignUrl, "_blank");
    const checkIfClosed = setInterval(() => {
      if (signWindow && signWindow.closed) {
        clearInterval(checkIfClosed);
        const signedPdfUrl = `https://example-sign-service.com/signed/${pdfFile.name}`;
        setSignedPdfUrl(signedPdfUrl);
      }
    }, 1000);
  };

  // -------------------------------------------------
  // handleDeletePdf
  // -------------------------------------------------
  const handleDeletePdf = async () => {
    if (!selectedExamForPdf) return;
    const queryParams = new URLSearchParams({
      examResultId: selectedExamForPdf.examResultId.toString(),
    });

    try {
      const response = await fetch(
        `${url_DeletePatientPdfReport()}?${queryParams.toString()}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        console.log("PDF eliminato con successo");
        setDeleteConfirmVisible(false);
        setPdfOptionsVisible(false);
        fetchExamResults();
      } else {
        console.error(
          "Errore durante l'eliminazione del PDF. Stato:",
          response.status
        );
      }
    } catch (error) {
      console.error("Errore durante l'eliminazione del PDF:", error);
    }
  };

  // -------------------------------------------------
  // handleUniqueRefChange
  // -------------------------------------------------
  const handleUniqueRefChange = (exam: any) => {
    // Bloccato se l'esame è già stato refertato (logica esistente per i referti)
    if (exam.resultInsertDate != null) {
      return;
    }

    // Per i tecnici: blocca se l'esame ha già una prescrizione associata
    if (isTechnician && examsWithPrescriptions.has(exam.examResultId)) {
      // Non permettere di deselezionare se ha già una prescrizione
      if (selectedUniqueRefs.includes(exam.examId)) {
        return;
      }
    }

    // Toggle della selezione
    if (selectedUniqueRefs.includes(exam.examId)) {
      setSelectedUniqueRefs((prevRefs) =>
        prevRefs.filter((id) => id !== exam.examId)
      );
    } else {
      setSelectedUniqueRefs((prevRefs) => [...prevRefs, exam.examId]);
    }
  };

  // -------------------------------------------------
  // refUnicoCell
  // -------------------------------------------------
  const refUnicoCell = (props: any) => {
    const record = props.dataItem;
    const isWorked = record.resultInsertDate != null;
    const checked = selectedUniqueRefs.includes(record.examId);

    // Per i tecnici: disabilita anche se ha una prescrizione e è già checked
    const hasPrescription = isTechnician && examsWithPrescriptions.has(record.examResultId);
    const isDisabled = isWorked || (hasPrescription && checked);

    return (
      <td style={{ textAlign: "center" }}>
        <input
          type="checkbox"
          checked={checked}
          disabled={isDisabled}
          onChange={() => handleUniqueRefChange(record)}
        />
      </td>
    );
  };

  // -------------------------------------------------
  // statusCell
  // -------------------------------------------------
  const statusCell = (props: any) => {
    const { examResultStateId, resultInsertDate, subExamTypeId, examResultId } = props.dataItem;
    const icon = subExamTypeId === 4 ? editToolsIcon : uploadIcon;

    // Mappa degli stati
    const stateDescriptions: Record<number, string> = {
      1: "Da Refertare",
      2: "In Accettazione",
      3: "Accettato",
      4: "In Esecuzione",
      5: "Da Firmare",
      6: "Bozza",
      7: "Da Firmare",
      8: "Refertato",
      9: "Annullato",
    };

    let statusText: string = stateDescriptions[examResultStateId] || `Stato ${examResultStateId}`;
    let cellStyle: React.CSSProperties = {
      textAlign: "center",
      cursor: "pointer",
    };

    if (examResultStateId < 5 && resultInsertDate === null) {
      statusText = "Da Refertare";
      cellStyle.backgroundColor = "lightblue";
    } else if (examResultStateId === 5 && resultInsertDate != null) {
      statusText = "Da Firmare";
      cellStyle.backgroundColor = "#ffb74d";
    } else if (examResultStateId === 6 && resultInsertDate != null) {
      statusText = "Bozza";
      cellStyle.backgroundColor = "lightgreen";
    } else if (examResultStateId === 7 && resultInsertDate != null) {
      statusText = "Da Firmare";
      cellStyle.backgroundColor = "#ffb74d";
    } else if (examResultStateId === 8 && resultInsertDate != null) {
      statusText = "Refertato";
      cellStyle.backgroundColor = "green";
      cellStyle.color = "white";
    }

    // Determina se mostrare i pulsanti
    const showPrescriptionButton = (isTechnician || doctorCode);
    const showReportButton = !isTechnician && (doctorCode !== null && doctorCode !== undefined);

    // Verifica se esiste una prescrizione
    const hasPrescription = examsWithPrescriptions.has(examResultId);

    // Per i tecnici, il <td> ha text-align: left
    if (isTechnician) {
      return (
        <td style={{ ...cellStyle, textAlign: "left" }}>
          <div style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
            {/* Pulsante Prescrizione - visibile a Tecnici */}
            {showPrescriptionButton && (
              <span
                style={{
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  backgroundColor: hasPrescription ? "#e8f5e9" : "#e3f2fd",
                  border: hasPrescription ? "1px solid #4CAF50" : "1px solid #2196F3"
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrescriptionClick(props.dataItem);
                }}
                title="Prescrizione"
              >
                <SvgIcon icon={editToolsIcon} style={{ width: "16px", height: "16px", color: hasPrescription ? "#4CAF50" : "#2196F3" }} />
                <span style={{ fontSize: "12px", color: hasPrescription ? "#4CAF50" : "#2196F3", fontWeight: "500" }}>Prescrizione</span>
              </span>
            )}
          </div>
        </td>
      );
    }

    // Per i medici, mostra solo stato e pulsante referto
    return (
      <td
        style={{ ...cellStyle, display: "flex", alignItems: "center", gap: "8px", justifyContent: "space-between" }}
        onClick={() => {
          if (showReportButton) {
            handleIconClick(subExamTypeId, props.dataItem);
          }
        }}
        title={showReportButton ? "Apri editor referto" : ""}
      >
        <span>{statusText}</span>
        <div style={{ display: "flex", gap: "4px" }}>
          {/* Pulsante Referto - solo medici */}
          {showReportButton && (
            <span style={{ pointerEvents: "none" }}>
              <SvgIcon icon={icon} style={{ width: "16px", height: "16px", color: "#4CAF50" }} />
            </span>
          )}
        </div>
      </td>
    );
  };

  // -------------------------------------------------
  // prescriptionCell - Colonna separata per prescrizioni (solo medici)
  // -------------------------------------------------
  const prescriptionCell = (props: any) => {
    const { examResultId } = props.dataItem;
    const hasPrescription = examsWithPrescriptions.has(examResultId);

    // Mostra il pulsante solo se esiste una prescrizione
    if (!hasPrescription) {
      return <td style={{ textAlign: "center" }}></td>;
    }

    return (
      <td style={{ textAlign: "center" }}>
        <span
          style={{
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "2px 6px",
            borderRadius: "3px",
            backgroundColor: "#e8f5e9",
            border: "1px solid #4CAF50"
          }}
          onClick={(e) => {
            e.stopPropagation();
            handlePrescriptionClick(props.dataItem);
          }}
          title="Visualizza Prescrizione"
        >
          <SvgIcon icon={editToolsIcon} style={{ width: "16px", height: "16px", color: "#4CAF50" }} />
          <span style={{ fontSize: "12px", color: "#4CAF50", fontWeight: "500" }}>Prescrizione</span>
        </span>
      </td>
    );
  };

  // -------------------------------------------------
  // Memoizza i dati ordinati per evitare duplicazioni
  // -------------------------------------------------
  const sortedResultsData = useMemo(() => {
    return orderBy(resultsData, sort);
  }, [resultsData, sort]);

  // -------------------------------------------------
  // RENDER
  // -------------------------------------------------
  return (
    <div className="prestazioni-risultati">
      {loadingExamResults ? (
        <div style={{ textAlign: "center", marginTop: "40px" }}>
          <Loader size="large" type="infinite-spinner" />
        </div>
      ) : resultsData.length === 0 ? (
        <div className="no-records">Nessun dato disponibile</div>
      ) : (
        <Grid
          data={sortedResultsData}
          dataItemKey="examResultId"
          style={{ height: "100%" }}
          sortable={true}
          sort={sort}
          onSortChange={(e: GridSortChangeEvent) => {
            setSort(e.sort);
          }}
        >
          {/* <Column
            field="examBriefName"
            title={labels.prestazioniRisultati.codice}
            width="100px"
          /> */}
          <Column
            field="examName"
            title={labels.prestazioniRisultati.nome}
            width="350px"
          />
          <Column
            field="examinationExamWithdrawalDate"
            title={labels.prestazioniRisultati.dataRitiro}
            width="120px"
            cell={(props) => (
              <td>{dateFormatter(props.dataItem.examinationExamWithdrawalDate)}</td>
            )}
          />
          {!isTechnician && (
            <Column
              field="status"
              title={labels.prestazioniRisultati.stato}
              width="120px"
              cell={statusCell}
            />
          )}
          {isTechnician && (
            <Column
              field="prescription"
              title="Prescrizione"
              width="200px"
              cell={statusCell}
            />
          )}
          {!isTechnician && (
            <Column
              field="doctorPrescription"
              title="Prescrizione"
              width="150px"
              cell={prescriptionCell}
            />
          )}
          <Column
            field="doctorCode"
            title={labels.prestazioniRisultati.medicoEsecutore}
            width="150px"
          />
          <Column
            field="uniqueRef"
            title={isTechnician ? "Prescr. Unica" : labels.prestazioniRisultati.refUnico}
            width="100px"
            cell={refUnicoCell}
          />
          <Column
            field="clinicDepartmentId"
            title={labels.prestazioniRisultati.unitaOperativa}
            width="150px"
          />
        </Grid>
      )}

      {pdfOptionsVisible && (
        <Dialog title={"Opzioni PDF"} onClose={() => setPdfOptionsVisible(false)}>
          <p>Un PDF esiste già per questo esame:</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Button onClick={() => setDeleteConfirmVisible(true)}>
              Cancella PDF Esistente
            </Button>
            <Button
              onClick={() => {
                setPdfOptionsVisible(false);
                setVisible(true);
              }}
            >
              Sostituisci PDF Esistente
            </Button>
            <Button onClick={handleViewPdf}>Visualizza PDF Esistente</Button>
          </div>
          <DialogActionsBar>
            <Button onClick={() => setPdfOptionsVisible(false)}>Annulla</Button>
          </DialogActionsBar>
        </Dialog>
      )}

      {visible && (
        <Dialog title={"Carica File"} onClose={handleClose}>
          {!isFileSelected ? (
            <>
              <input type="file" onChange={handleFileUpload} />
              <DialogActionsBar>
                <Button onClick={handleClose}>
                  {labels.prestazioniRisultati.cancella}
                </Button>
              </DialogActionsBar>
            </>
          ) : (
            <>
              <p>Sicuro di voler caricare questo PDF?</p>
              <DialogActionsBar>
                <Button
                  onClick={() => {
                    setIsFileSelected(false);
                    setPdfFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                >
                  No
                </Button>
                <Button
                  onClick={() => {
                    uploadPdfAttachment(selectedExamForPdf);
                    setIsFileSelected(false);
                    setVisible(false);
                  }}
                >
                  Sì
                </Button>
              </DialogActionsBar>
            </>
          )}
        </Dialog>
      )}

      <div className="buttons-pdf">
        {pdfFile && (
          <div style={{ marginTop: "20px" }}>
            <Button className="primary-button" onClick={handleSignPdfExternally}>
              Firma PDF Esternamente
            </Button>
          </div>
        )}

        {signedPdfUrl && (
          <div style={{ marginTop: "20px" }}>
            <Button onClick={() => window.open(signedPdfUrl, "_blank")}>
              Scarica PDF Firmato
            </Button>
          </div>
        )}

        {pdfPreviewVisible && pdfPreviewUrl && (
          <div className="pdf-preview-overlay">
            <div className="pdf-preview-container">
              <div className="pdf-preview-header">
                <Button
                  className="close-button"
                  icon="close"
                  onClick={() => {
                    URL.revokeObjectURL(pdfPreviewUrl);
                    setPdfPreviewUrl(null);
                    setPdfPreviewVisible(false);
                  }}
                >
                  Chiudi Anteprima
                </Button>
              </div>
              <iframe
                src={pdfPreviewUrl}
                style={{ width: "100%", height: "100%" }}
                frameBorder="0"
                title="Anteprima PDF"
              />
            </div>
          </div>
        )}

        {deleteConfirmVisible && (
          <Dialog
            title={"Conferma Eliminazione"}
            onClose={() => setDeleteConfirmVisible(false)}
          >
            <p>Sicuro di eliminare il PDF esistente?</p>
            <DialogActionsBar>
              <Button onClick={() => setDeleteConfirmVisible(false)}>No</Button>
              <Button onClick={handleDeletePdf}>Si</Button>
            </DialogActionsBar>
          </Dialog>
        )}
      </div>
    </div>
  );
};

export default PrestazioniRisultati;
