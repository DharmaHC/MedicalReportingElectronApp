// PreviousResultModal.tsx
import React, {useRef, useCallback} from "react";
import { Dialog, DialogActionsBar } from "@progress/kendo-react-dialogs";
import { Button } from "@progress/kendo-react-buttons";
import { imageIcon, checkIcon, copyIcon } from "@progress/kendo-svg-icons";

interface PreviousResultModalProps {
  accNum: string;
  onOpenImages: (accNum: string) => void;
  onClose: () => void;
  htmlReport: string;
  signedPdf?: string;
  pdfError?: string | null;
  title: string;
  reportingDoctor?: string;
  patientFirstName?: string;
  patientLastName?: string;
}
    const PreviousResultModal: React.FC<PreviousResultModalProps> = ({
      accNum,
      onOpenImages,
      onClose,
      htmlReport,
      signedPdf,
      pdfError,
      title,
      reportingDoctor,
      patientFirstName,
      patientLastName,
    }) => {
        const handleDownloadPdf = () => {
    if (!signedPdf) return;
    const link = document.createElement("a");
    link.href = `data:application/pdf;base64,${signedPdf}`;
    link.download = "signed_report.pdf";
    link.click();
  };

const htmlRef = useRef<HTMLDivElement>(null);

/** Strip negative margin-left values injected by RTF \li-N indentation */
const sanitizeHtml = (html: string): string =>
  html.replace(/margin-left:\s*-[0-9.]+\s*(px|pt|cm|mm|in|em)\s*;?/gi, "");

/** Select all body text skipping the exam-name heading and leading blank lines */
const handleSelectText = useCallback(() => {
  const container = htmlRef.current;
  if (!container) return;

  // Collect all <p> elements inside the rendered HTML
  const paragraphs = Array.from(container.querySelectorAll("p"));
  if (paragraphs.length === 0) return;

  // Find first paragraph with real content after the exam-name line.
  // Pattern: first non-empty <p> = exam name → skip it + any following empty <p>s
  let startIdx = 0;
  // Skip to first non-empty paragraph (exam name)
  while (startIdx < paragraphs.length && !paragraphs[startIdx].textContent?.trim()) {
    startIdx++;
  }
  // Skip the exam-name paragraph itself
  if (startIdx < paragraphs.length) startIdx++;
  // Skip any subsequent empty paragraphs
  while (startIdx < paragraphs.length && !paragraphs[startIdx].textContent?.trim()) {
    startIdx++;
  }

  if (startIdx >= paragraphs.length) {
    // Fallback: select everything
    startIdx = 0;
  }

  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.setStartBefore(paragraphs[startIdx]);
  range.setEndAfter(paragraphs[paragraphs.length - 1]);
  sel.removeAllRanges();
  sel.addRange(range);
}, []);

const handleViewPdf = () => {
    if (!signedPdf) return;
    const bytes = atob(signedPdf);
    const buffer = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      buffer[i] = bytes.charCodeAt(i);
    }
    const blob = new Blob([buffer], { type: "application/pdf" });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  };

return (
    <Dialog title={title} onClose={onClose}>
      {reportingDoctor && (
        <div style={{ marginBottom: 8 }}>
          <strong>Medico refertatore:</strong> {reportingDoctor}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <strong>Acc. Numero:</strong> {accNum}
        <span style={{ marginLeft: 18 }}>
          <strong>Paziente:</strong> {patientLastName} {patientFirstName}
        </span>
        </div>

      {htmlReport ? (
        <div
          ref={htmlRef}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(htmlReport) }}
          style={{ height: 300, overflowY: "auto", marginBottom: 12 }}
          onContextMenu={(e) => {
            e.preventDefault();
            window.electron?.ipcRenderer?.send('show-context-menu');
          }}
        />
      ) : (
        <div style={{ marginBottom: 12 }}>
          Nessun testo disponibile per questo esito.
        </div>
      )}

      {/* Gestione loading / errore / successo PDF */}
      {pdfError ? (
        <div style={{ marginBottom: 12, color: "#b91c1c", textAlign: "center" }}>
          {pdfError}
        </div>
      ) : signedPdf === undefined ? (
        <div style={{ marginBottom: 12, textAlign: "center" }}>
          <span className="k-icon k-i-loading" style={{ fontSize: "2em", marginBottom: 6, display: "block" }} />
          Caricamento PDF...
        </div>
      ) : signedPdf ? (
        <div style={{ marginBottom: 12 }}>
          <Button onClick={handleDownloadPdf} style={{ marginRight: 8 }}>
            Scarica PDF Firmato
          </Button>
          <Button onClick={handleViewPdf}>Visualizza Referto</Button>
        </div>
      ) : (
        <div style={{ marginBottom: 12, color: "#b91c1c", textAlign: "center" }}>
          Nessun PDF firmato disponibile.
        </div>
      )}

      <DialogActionsBar>
        <Button svgIcon={imageIcon} onClick={() => onOpenImages(accNum)}>
          Apri Immagini
        </Button>

        {htmlReport && (
          <Button svgIcon={copyIcon} onClick={handleSelectText}>
            Seleziona Testo
          </Button>
        )}

        <Button svgIcon={checkIcon} onClick={onClose}>
          Chiudi
        </Button>
      </DialogActionsBar>
    </Dialog>
  );

};

export default PreviousResultModal;
