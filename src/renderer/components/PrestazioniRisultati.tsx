import React, { useEffect, useState, useRef } from "react";
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
} from "../utility/urlLib";
import { url_getPatientReport } from "../utility/urlLib";
import { url_DeletePatientPdfReport } from "../utility/urlLib";

import {
  setSelectedExamId,
  addExamToSelectedMoreExams,
  addMultipleExamsToSelectedMoreExams,
} from "../store/examinationSlice";

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
  const selectedExaminationId = useSelector(
    (state: RootState) => state.exam.selectedExaminationId
  );
  const selectedDoctorCode = useSelector(
    (state: RootState) => state.exam.selectedDoctorCode
  );
  const registrations = useSelector((state: RootState) => state.registrations);
  const units = useSelector((state: RootState) => state.filters.units);
  const sectors = useSelector((state: RootState) => state.filters.sectors);
  const token = useSelector((state: RootState) => state.auth.token);

  // Parametri di fetch (null => non usati)
  const includeScheduled = null;
  const showTitlesAlso = null;
  const allResults = null;

  const [selectedUniqueRefs, setSelectedUniqueRefs] = useState<string[]>([]);

  // Sorting
  const [sort, setSort] = useState<SortDescriptor[]>([]);

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
      const response = await fetch(`${url_examResults}?${queryParams.toString()}`, {
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

        setResultsData(data);

        // Inizializza la selezione dei RefUnici in base a isLinkedResult
        const initiallyLinked = data
          .filter((item: any) => item.isLinkedResult)
          .map((item: any) => item.examId);
        setSelectedUniqueRefs(initiallyLinked);
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
  // fetchSingleReport (aggiungiamo readOnly come 3° arg)
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
          `${url_GetPatientRTFHtmlResult}?${queryParams.toString()}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (response.ok) {
          const htmlContent = await response.text();
          // Passiamo readOnly
          navigate("/editor", { state: { htmlContent, readOnly, openedByOtherDoctor } });
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
          `${url_singleReportHTML}?${queryParams.toString()}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (response.ok) {
          const htmlContent = await response.text();
          // Passiamo readOnly
          navigate("/editor", { state: { htmlContent, readOnly } });
        } else {
          console.error("Failed to fetch report template");
        }
      } catch (error) {
        console.error("Error fetching report template:", error);
      }
    }
  };

  // -------------------------------------------------
  // fetchMoreReports (aggiungiamo readOnly come 3° arg)
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
          `${url_GetPatientRTFHtmlResult}?${queryParams.toString()}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (response.ok) {
          const htmlContent = await response.text();
          navigate("/editor", { state: { htmlContent, readOnly, openedByOtherDoctor } });
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
          `${url_linkedReportTemplatesHTML}?${queryParams.toString()}`,
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
          const htmlContent = await response.text();
          navigate("/editor", { state: { htmlContent, readOnly } });
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
            `${url_getPatientReport}?${queryParams.toString()}`,
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

const handleIconClick = (subExamTypeId: number, exam: any) => {
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
        const response = await fetch(url_insertPdfAttachment, {
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
        `${url_DeletePatientPdfReport}?${queryParams.toString()}`,
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
    if (exam.insertDate != null) {
      return;
    }

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
    return (
      <td style={{ textAlign: "center" }}>
        <input
          type="checkbox"
          checked={checked}
          disabled={isWorked}
          onChange={() => handleUniqueRefChange(record)}
        />
      </td>
    );
  };

  // -------------------------------------------------
  // statusCell
  // -------------------------------------------------
  const statusCell = (props: any) => {
	//console.log("[DEBUG] statusCell dataItem =>", props.dataItem);
    const { examResultStateId, resultInsertDate, subExamTypeId } = props.dataItem;
    const icon = subExamTypeId === 4 ? editToolsIcon : uploadIcon;

    let statusText: string | number = examResultStateId;
    let cellStyle: React.CSSProperties = {
      textAlign: "center",
      cursor: "pointer",
    };

	//console.log("examResultStateId:", examResultStateId, 
	//			" resultInsertDate:", resultInsertDate,
	//			" subExamTypeId:", subExamTypeId);

	if (examResultStateId < 5 && resultInsertDate === null) {
      statusText = "Da Refertare";
      cellStyle.backgroundColor = "lightblue";
    } else if (examResultStateId === 5 && resultInsertDate != null) {
      statusText = "Da Terminare";
      cellStyle.backgroundColor = "orange";
    } else if (examResultStateId === 6 && resultInsertDate != null) {
      statusText = "Bozza";
      cellStyle.backgroundColor = "lightgreen";
    } else if (examResultStateId === 8 && resultInsertDate != null) {
      statusText = "Refertato";
      cellStyle.backgroundColor = "green";
      cellStyle.color = "white";
    }

    return (
      <td
        style={cellStyle}
        onClick={() => handleIconClick(subExamTypeId, props.dataItem)}
      >
        {statusText}
        <span style={{ marginLeft: "16px" }}>
          <SvgIcon icon={icon} style={{ width: "16px", height: "16px" }} />
        </span>
      </td>
    );
  };

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
        <Grid data={resultsData} style={{ height: "100%" }}>
          <Column
            field="examBriefName"
            title={labels.prestazioniRisultati.codice}
            width="100px"
          />
          <Column
            field="examName"
            title={labels.prestazioniRisultati.nome}
            width="200px"
          />
          <Column
            field="subExamName"
            title={labels.prestazioniRisultati.descParametro}
            width="200px"
          />
          <Column
            field="examinationExamWithdrawalDate"
            title={labels.prestazioniRisultati.dataRitiro}
            width="120px"
            cell={(props) => (
              <td>{dateFormatter(props.dataItem.examinationExamWithdrawalDate)}</td>
            )}
          />
          <Column
            field="status"
            title={labels.prestazioniRisultati.stato}
            width="120px"
            cell={statusCell}
          />
          <Column
            field="doctorCode"
            title={labels.prestazioniRisultati.medicoEsecutore}
            width="150px"
          />
          <Column
            field="uniqueRef"
            title={labels.prestazioniRisultati.refUnico}
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
