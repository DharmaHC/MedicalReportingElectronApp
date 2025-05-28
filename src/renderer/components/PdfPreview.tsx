import React from "react";
import { Button } from "@progress/kendo-react-buttons";
import "./PdfPreview.css";

interface PdfPreviewProps {
  pdfUrl: string;
  onClose: () => void;
}

const PdfPreview: React.FC<PdfPreviewProps> = ({ pdfUrl, onClose }) => {
  return (
    <div className="pdf-preview-overlay">
      <div className="pdf-preview-container">
        <div className="pdf-preview-header">
          <Button className="close-button" icon="close" onClick={onClose}>
            Chiudi Anteprima
          </Button>
        </div>
        <iframe
          src={pdfUrl}
          style={{ width: "100%", height: "100%" }}
          frameBorder="0"
          title="Anteprima PDF"
        />
      </div>
    </div>
  );
};

export default PdfPreview;
