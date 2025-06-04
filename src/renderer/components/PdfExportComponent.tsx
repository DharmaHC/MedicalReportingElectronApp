import React, { useRef } from 'react';
import { PDFExport } from '@progress/kendo-react-pdf';

const PdfExportComponent = () => {
  const pdfExportComponent = useRef<PDFExport>(null);

  const handleExport = () => {
    if (pdfExportComponent.current) {
      pdfExportComponent.current.save();
    }
  };

  return (
    <div>
      <button onClick={handleExport}>Stampa PDF</button>
      <PDFExport
        ref={pdfExportComponent}
        paperSize="A4"
        margin="1cm"
        fileName="referto.pdf"
        author="Nome Autore"
        title="Titolo Referto"
      >
        <div>
          {/* Contenuto da esportare */}
          <h1>Referto Medico</h1>
          <p>Dettagli del referto...</p>
        </div>
      </PDFExport>
    </div>
  );
};

export default PdfExportComponent;
