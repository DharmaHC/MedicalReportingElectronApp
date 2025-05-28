// PreviousResultModal.tsx
import React from "react";
import { Dialog, DialogActionsBar } from "@progress/kendo-react-dialogs";
import { Button } from "@progress/kendo-react-buttons";
import { imageIcon, checkIcon } from "@progress/kendo-svg-icons";

export interface PreviousResultModalProps {
  /** Il codice di accesso (Accession Number) da passare al viewer */
  accNum: string;
  /** Chiusura del modal */
  onClose: () => void;
  /** Callback che riceve l'accNum per aprire le immagini */
  onOpenImages: (accNum: string) => void;
  htmlReport?: string;
  pdfError?: string | null;
  title?: string;
  signedPdf?: string;
  reportingDoctor?: string;
}

const PreviousResultModal: React.FC<PreviousResultModalProps> = ({
  accNum,
  onClose,
  onOpenImages,
  htmlReport,
  pdfError,
  signedPdf,
  reportingDoctor,
  title,
}) => {
  const handleDownloadPdf = () => {
    if (!signedPdf) return;
    const link = document.createElement("a");
    link.href = `data:application/pdf;base64,${signedPdf}`;
    link.download = "signed_report.pdf";
    link.click();
  };

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
      </div>

      {htmlReport ? (
        <div
          dangerouslySetInnerHTML={{ __html: htmlReport }}
          style={{ height: 300, overflowY: "auto", marginBottom: 12 }}
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

        <Button svgIcon={checkIcon} onClick={onClose}>
          Chiudi
        </Button>
      </DialogActionsBar>
    </Dialog>
  );

};

export default PreviousResultModal;
