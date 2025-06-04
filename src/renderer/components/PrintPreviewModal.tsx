import React from 'react';
import { PDFViewer } from '@progress/kendo-react-pdf-viewer';
import { Dialog, DialogActionsBar } from '@progress/kendo-react-dialogs';
import { Button } from '@progress/kendo-react-buttons';

interface PrintPreviewModalProps {
  pdfBase64: string;     // <--- base64 puro, senza prefix data:
  onClose: () => void;
}

const PrintPreviewModal: React.FC<PrintPreviewModalProps> = ({ pdfBase64, onClose }) => {
  const handlePrint = () => {
    window.setTimeout(() => window.print(), 400);
    onClose();
  };

  return (
    <Dialog title="Anteprima di Stampa" onClose={onClose} width={900} height={700}>
      <div style={{ height: 600, minWidth: 700, margin: '-20px -24px 0 -24px', background: '#fafafa' }}>
        {pdfBase64 && (
          <PDFViewer
            data={pdfBase64}
            style={{ height: '100%', width: '100%' }}
          />
        )}
      </div>
      <DialogActionsBar>
        <Button themeColor="primary" onClick={handlePrint}>Stampa</Button>
        <Button onClick={onClose}>Chiudi</Button>
      </DialogActionsBar>
    </Dialog>
  );
};

export default PrintPreviewModal;
