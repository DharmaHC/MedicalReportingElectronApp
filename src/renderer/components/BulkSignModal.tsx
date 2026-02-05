/**
 * BulkSignModal.tsx
 * Modale principale per la firma remota massiva dei referti.
 */

import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Dialog, DialogActionsBar } from '@progress/kendo-react-dialogs';
import { Grid, GridColumn, GridCellProps } from '@progress/kendo-react-grid';
import { Button } from '@progress/kendo-react-buttons';
import { ProgressBar } from '@progress/kendo-react-progressbars';
import { DropDownList, DropDownListChangeEvent } from '@progress/kendo-react-dropdowns';
import { DatePicker, DatePickerChangeEvent } from '@progress/kendo-react-dateinputs';
import { Input, InputChangeEvent, Checkbox, CheckboxChangeEvent } from '@progress/kendo-react-inputs';
import { Notification, NotificationGroup } from '@progress/kendo-react-notification';
import { Loader } from '@progress/kendo-react-indicators';
import { Tooltip } from '@progress/kendo-react-tooltip';
import {
  pencilIcon,
  checkIcon,
  xCircleIcon,
  clockIcon,
  filterIcon,
  eyeIcon
} from '@progress/kendo-svg-icons';
import { SvgIcon } from '@progress/kendo-react-common';

import { RootState, AppDispatch } from '../store';
import {
  closeModal,
  openAuthDialog,
  fetchReportsToSign,
  fetchAvailableProviders,
  setSelectedProvider,
  setFilters,
  toggleReportSelection,
  selectAllReports,
  deselectAllReports,
  updateSession,
  startSigning,
  updateSignProgress,
  updateReportSignStatus,
  finishSigning,
  setErrorMessage,
  clearMessages,
  ReportToSign,
  SignProvider
} from '../store/bulkSignSlice';
import BulkSignAuthDialog from './BulkSignAuthDialog';
import { getApiBaseUrl, getOriginalApiBaseUrl } from '../utility/urlLib';
import './BulkSignModal.css';

// Opzioni per filtro stato
const STATUS_OPTIONS = [
  { text: 'Tutti', value: 'all' },
  { text: 'Bozze', value: 'draft' },
  { text: 'Da Firmare', value: 'toSign' },
  { text: 'Firmati', value: 'signed' }
];

// Funzione per ottenere date di default (ultimi 15 giorni)
const getDefaultDateRange = () => {
  const today = new Date();
  const fifteenDaysAgo = new Date(today);
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
  return {
    dateFrom: fifteenDaysAgo.toISOString().split('T')[0],
    dateTo: today.toISOString().split('T')[0]
  };
};

/**
 * Componente principale della modale firma massiva
 */
const BulkSignModal: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();

  // Selettori Redux
  const {
    isModalOpen,
    isAuthDialogOpen,
    reports,
    isLoadingReports,
    loadError,
    availableProviders,
    selectedProviderId,
    session,
    isSigningInProgress,
    signProgress,
    filters,
    errorMessage,
    successMessage
  } = useSelector((state: RootState) => state.bulkSign);

  const {
    userName,  // Username applicazione (codice fiscale) - usato per lookup utente nel DB
    doctorCode,
    token,
    signatureType,
    remoteSignUsername,
    remoteSignProvider,
    hasRemoteSignPassword,
    hasRemoteSignPin
  } = useSelector((state: RootState) => state.auth);

  // State per anteprima PDF
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPdfBase64, setPreviewPdfBase64] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewReportInfo, setPreviewReportInfo] = useState<{ patientName: string; examNames: string[] } | null>(null);

  // Conteggi
  const selectedCount = useMemo(() => reports.filter(r => r.selected).length, [reports]);
  const totalCount = reports.length;
  const signedCount = useMemo(() => reports.filter(r => r.signStatus === 'signed').length, [reports]);

  // Provider selezionato
  const selectedProvider = useMemo(
    () => availableProviders.find(p => p.id === selectedProviderId),
    [availableProviders, selectedProviderId]
  );

  // =========================================================================
  // EFFECTS
  // =========================================================================

  // Carica provider all'apertura
  useEffect(() => {
    if (isModalOpen && availableProviders.length === 0) {
      dispatch(fetchAvailableProviders());
    }
  }, [isModalOpen, availableProviders.length, dispatch]);

  // Imposta date di default (ultimi 15 giorni) quando la modal si apre per la prima volta
  useEffect(() => {
    if (isModalOpen && !filters.dateFrom && !filters.dateTo) {
      const { dateFrom, dateTo } = getDefaultDateRange();
      dispatch(setFilters({ dateFrom, dateTo }));
    }
  }, [isModalOpen, filters.dateFrom, filters.dateTo, dispatch]);

  // Carica referti quando cambia filtro o modal si apre
  useEffect(() => {
    if (isModalOpen && doctorCode && token) {
      dispatch(fetchReportsToSign({ doctorCode, token }));
    }
  }, [isModalOpen, doctorCode, token, filters, dispatch]);

  // Polling stato sessione
  useEffect(() => {
    if (!session.active || !selectedProviderId) return;

    const interval = setInterval(async () => {
      try {
        const status = await (window as any).remoteSign?.getSessionStatus({
          providerId: selectedProviderId
        });
        if (status) {
          dispatch(updateSession({
            active: status.active,
            remainingMinutes: status.remainingMinutes || 0,
            expiresAt: status.expiresAt,
            signedByCN: status.signedBy
          }));
        }
      } catch (e) {
        console.error('Errore polling sessione:', e);
      }
    }, 30000); // Ogni 30 secondi

    return () => clearInterval(interval);
  }, [session.active, selectedProviderId, dispatch]);

  // Listener eventi IPC per progresso firma
  useEffect(() => {
    if (!isModalOpen) return;

    const remoteSign = (window as any).remoteSign;
    if (!remoteSign) return;

    // Listener progresso
    remoteSign.onProgress?.((progress: any) => {
      dispatch(updateSignProgress({
        completed: progress.completed || 0,
        failed: progress.failed || 0,
        currentPatient: progress.currentPatient || null
      }));
    });

    // Listener singolo referto completato
    remoteSign.onReportCompleted?.((result: any) => {
      dispatch(updateReportSignStatus({
        examinationId: result.examinationId,
        status: result.success ? 'signed' : 'error',
        errorMessage: result.error
      }));
    });

    // Listener completamento batch
    remoteSign.onCompleted?.((result: any) => {
      dispatch(finishSigning({
        successCount: result.successful || 0,
        failCount: result.failed || 0
      }));
    });

    return () => {
      remoteSign.removeAllListeners?.();
    };
  }, [isModalOpen, dispatch]);

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleClose = useCallback(() => {
    if (!isSigningInProgress) {
      dispatch(closeModal());
    }
  }, [isSigningInProgress, dispatch]);

  const handleProviderChange = useCallback((e: DropDownListChangeEvent) => {
    dispatch(setSelectedProvider(e.target.value?.id));
  }, [dispatch]);

  const handleDateFromChange = useCallback((e: DatePickerChangeEvent) => {
    dispatch(setFilters({ dateFrom: e.value?.toISOString() || null }));
  }, [dispatch]);

  const handleDateToChange = useCallback((e: DatePickerChangeEvent) => {
    dispatch(setFilters({ dateTo: e.value?.toISOString() || null }));
  }, [dispatch]);

  const handlePatientNameChange = useCallback((e: InputChangeEvent) => {
    dispatch(setFilters({ patientName: e.value as string }));
  }, [dispatch]);

  const handleStatusChange = useCallback((e: DropDownListChangeEvent) => {
    dispatch(setFilters({ status: e.target.value?.value }));
  }, [dispatch]);

  const handleSelectAll = useCallback(() => {
    dispatch(selectAllReports());
  }, [dispatch]);

  const handleDeselectAll = useCallback(() => {
    dispatch(deselectAllReports());
  }, [dispatch]);

  const handleRowClick = useCallback((e: any) => {
    if (e.dataItem && !isSigningInProgress) {
      dispatch(toggleReportSelection(e.dataItem.examinationId));
    }
  }, [isSigningInProgress, dispatch]);

  const handleStartSign = useCallback(async () => {
    if (!selectedProviderId) {
      dispatch(setErrorMessage('Seleziona un provider di firma'));
      return;
    }

    if (selectedCount === 0) {
      dispatch(setErrorMessage('Seleziona almeno un referto da firmare'));
      return;
    }

    // Se sessione non attiva, gestisci autenticazione
    if (!session.active) {
      // Verifica se il provider è Namirial (richiede password + PIN separati)
      const isNamirial = selectedProviderId?.toUpperCase() === 'NAMIRIAL';

      // Per Namirial: serve sia password che PIN
      // Per altri provider: basta la password (che può essere usata come PIN)
      const hasCompleteCredentials = isNamirial
        ? (hasRemoteSignPassword && hasRemoteSignPin && remoteSignUsername)
        : (hasRemoteSignPassword && remoteSignUsername);

      // FIRMA AUTOMATICA: se l'utente ha configurato firma automatica con credenziali complete
      if (signatureType === 'automatic' && hasCompleteCredentials) {
        console.log(`[BulkSign] Firma automatica ${isNamirial ? 'Namirial' : selectedProviderId} - recupero credenziali dal database...`);

        try {
          // Recupera le credenziali decriptate dal backend
          // NOTA: Usa getOriginalApiBaseUrl() perché la chiamata IPC va al main process
          // che non passa per il proxy Vite (richiede URL completo con protocollo)
          // Passa userName (codice fiscale) per identificare l'utente nel DB, non remoteSignUsername
          const credentialsResult = await (window as any).remoteSign?.getStoredCredentials({
            token,
            apiBaseUrl: getOriginalApiBaseUrl(),
            username: userName  // Codice fiscale, NON username Namirial
          });

          if (!credentialsResult?.success) {
            dispatch(setErrorMessage('Impossibile recuperare le credenziali salvate. Riconfigurale nelle impostazioni.'));
            return;
          }

          // Per Namirial: verifica che ci siano sia password che PIN
          if (isNamirial && (!credentialsResult.password || !credentialsResult.pin)) {
            dispatch(setErrorMessage('Credenziali Namirial incomplete. Configura password e PIN nelle impostazioni.'));
            return;
          }

          // Per altri provider: basta la password (usata come PIN)
          if (!isNamirial && !credentialsResult.password) {
            dispatch(setErrorMessage('Password non configurata. Riconfigurale nelle impostazioni.'));
            return;
          }

          // Autentica automaticamente senza OTP
          // Per Namirial: invia password e PIN separati
          // Per altri provider: usa password come PIN
          const authResult = await (window as any).remoteSign?.authenticate({
            providerId: selectedProviderId,
            username: remoteSignUsername,
            password: isNamirial ? credentialsResult.password : undefined,  // Solo per Namirial
            pin: isNamirial ? credentialsResult.pin : credentialsResult.password,  // PIN (o password per altri)
            otp: '', // Nessun OTP per firma automatica
            sessionMinutes: 45,
            isAutomatic: true // Flag per indicare firma automatica (senza OTP)
          });

          if (!authResult?.success) {
            dispatch(setErrorMessage(authResult?.error || 'Autenticazione automatica fallita'));
            return;
          }

          // Aggiorna sessione nello store
          dispatch(updateSession({
            active: true,
            providerId: selectedProviderId,
            expiresAt: authResult.expiresAt,
            remainingMinutes: 45,
            signedByCN: authResult.signedBy || remoteSignUsername
          }));

          console.log('[BulkSign] Sessione automatica creata, avvio firma...');
        } catch (error: any) {
          console.error('[BulkSign] Errore firma automatica:', error);
          dispatch(setErrorMessage(error.message || 'Errore nella firma automatica'));
          return;
        }
      } else {
        // FIRMA CON OTP: apri dialog autenticazione
        dispatch(openAuthDialog());
        return;
      }
    }

    // Avvia firma
    dispatch(startSigning());
    dispatch(clearMessages());

    try {
      const selectedReports = reports.filter(r => r.selected);

      // Mappa i report con i parametri necessari per la firma (nuovo flusso con digitalReportId)
      const reportsForSigning = selectedReports.map(r => ({
        digitalReportId: r.digitalReportId,  // GUID da DigitalSignedReports
        examinationId: r.examinationId,
        linkedResultIds: r.linkedResultIds || [],
        patientLastName: r.patientLastName,
        patientFirstName: r.patientFirstName,
        companyId: r.companyId,
        doctorCode: r.doctorCode || doctorCode
      }));

      // NOTA: Usa getOriginalApiBaseUrl() per le chiamate IPC al main process
      await (window as any).remoteSign?.startBulkSign({
        reports: reportsForSigning,
        providerId: selectedProviderId,
        token,
        apiBaseUrl: getOriginalApiBaseUrl(),
        signedByName: session.signedByCN || 'Firma Digitale'  // Nome firmatario per dicitura
      });
    } catch (error: any) {
      dispatch(setErrorMessage(error.message || 'Errore avvio firma'));
      dispatch(finishSigning({ successCount: 0, failCount: selectedCount }));
    }
  }, [
    selectedProviderId,
    selectedCount,
    session.active,
    session.signedByCN,
    reports,
    dispatch,
    token,
    doctorCode,
    signatureType,
    hasRemoteSignPassword,
    hasRemoteSignPin,
    remoteSignUsername
  ]);

  // =========================================================================
  // ANTEPRIMA PDF
  // =========================================================================

  /**
   * Carica l'anteprima del PDF con la dicitura firma applicata
   */
  const handlePreviewPdf = useCallback(async (report: ReportToSign) => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewPdfBase64(null);
    setPreviewReportInfo({
      patientName: `${report.patientLastName} ${report.patientFirstName}`,
      examNames: report.examNames || []
    });

    try {
      // 1. Recupera il PDF non firmato dall'API
      const pdfUrl = `${getApiBaseUrl()}ExamResults/GetUnsignedPdf/${report.digitalReportId}`;
      console.log('[Preview] Fetching unsigned PDF from:', pdfUrl);

      const response = await fetch(pdfUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Errore recupero PDF: ${response.status}`);
      }

      const result = await response.json();
      let pdfBase64 = result.pdfBase64;

      if (!pdfBase64) {
        throw new Error('PDF non disponibile');
      }

      // 2. Aggiungi la dicitura firma al PDF usando il servizio IPC
      const signedByName = session.signedByCN || 'Firma Digitale';
      console.log('[Preview] Adding signature notice:', signedByName);

      const noticeResult = await (window as any).nativeSign?.addSignatureNotice({
        pdfBase64: pdfBase64,
        signedByName: signedByName
      });

      if (noticeResult?.pdfWithNoticeBase64) {
        pdfBase64 = noticeResult.pdfWithNoticeBase64;
      }

      console.log('[Preview] PDF ready for preview');
      setPreviewPdfBase64(pdfBase64);

    } catch (error: any) {
      console.error('[Preview] Error:', error);
      setPreviewError(error.message || 'Errore caricamento anteprima');
    } finally {
      setPreviewLoading(false);
    }
  }, [token, session.signedByCN]);

  /**
   * Chiude la modale anteprima
   */
  const handleClosePreview = useCallback(() => {
    setPreviewOpen(false);
    setPreviewPdfBase64(null);
    setPreviewError(null);
    setPreviewReportInfo(null);
  }, []);

  // =========================================================================
  // CELL RENDERERS
  // =========================================================================

  // Checkbox selezione
  const SelectionCell = useCallback((props: GridCellProps) => {
    const item = props.dataItem as ReportToSign;
    const disabled = isSigningInProgress || item.signStatus === 'signed';

    return (
      <td>
        <Checkbox
          checked={item.selected}
          disabled={disabled}
          onChange={() => dispatch(toggleReportSelection(item.examinationId))}
        />
      </td>
    );
  }, [isSigningInProgress, dispatch]);

  // Data formattata (usa printDate dalla nuova API)
  const DateCell = useCallback((props: GridCellProps) => {
    const item = props.dataItem as ReportToSign;
    const date = item.printDate
      ? new Date(item.printDate).toLocaleDateString('it-IT')
      : '-';
    return <td>{date}</td>;
  }, []);

  // Codice esame/accettazione (con indicatore per referti composti e pulsante anteprima)
  const ExamCodeCell = useCallback((props: GridCellProps) => {
    const item = props.dataItem as ReportToSign;
    const isComposite = item.linkedResultIds && item.linkedResultIds.length > 1;
    const examCount = item.linkedResultIds?.length || 1;

    // Tooltip con nomi esami
    const tooltipContent = isComposite && item.examNames && item.examNames.length > 0
      ? `Referto composto (${examCount} esami):\n${item.examNames.map((name, i) => `• ${name}`).join('\n')}`
      : item.examinationMnemonicCodeFull;

    return (
      <td className="exam-cell">
        <div className="exam-cell-content">
          {isComposite && (
            <span
              className="composite-indicator"
              title={tooltipContent}
            >
              📋
            </span>
          )}
          <span
            className={isComposite ? 'exam-name-composite' : ''}
            title={tooltipContent}
          >
            {item.examinationMnemonicCodeFull}
          </span>
          <button
            className="preview-btn"
            onClick={(e) => {
              e.stopPropagation();
              handlePreviewPdf(item);
            }}
            title="Anteprima PDF con dicitura firma"
          >
            <SvgIcon icon={eyeIcon} size="small" />
          </button>
        </div>
      </td>
    );
  }, [handlePreviewPdf]);

  // Medico refertante
  const DoctorCell = useCallback((props: GridCellProps) => {
    const item = props.dataItem as ReportToSign;
    return <td title={item.doctorCode}>{item.doctorDisplayName}</td>;
  }, []);

  // Stato firma
  const SignStatusCell = useCallback((props: GridCellProps) => {
    const item = props.dataItem as ReportToSign;

    let icon = null;
    let text = '-';
    let className = 'sign-status';

    switch (item.signStatus) {
      case 'pending':
        text = '-';
        className += ' status-pending';
        break;
      case 'signing':
        text = 'In corso...';
        className += ' status-signing';
        icon = <Loader size="small" type="pulsing" />;
        break;
      case 'signed':
        text = 'Firmato';
        className += ' status-signed';
        icon = <SvgIcon icon={checkIcon} style={{ color: '#22c55e' }} />;
        break;
      case 'error':
        text = 'Errore';
        className += ' status-error';
        icon = <SvgIcon icon={xCircleIcon} style={{ color: '#ef4444' }} />;
        break;
    }

    return (
      <td>
        <span className={className} title={item.errorMessage}>
          {icon} {text}
        </span>
      </td>
    );
  }, []);

  // Stato referto nel DB (6=Bozza, 7=Da Firmare, 8=Firmato)
  const StateCell = useCallback((props: GridCellProps) => {
    const item = props.dataItem as ReportToSign;

    let text = '';
    let className = 'examination-state';

    switch (item.examinationState) {
      case 6:
        text = 'Bozza';
        className += ' state-draft';
        break;
      case 7:
        text = 'Da Firmare';
        className += ' state-to-sign';
        break;
      case 8:
        text = 'Firmato';
        className += ' state-signed';
        break;
      default:
        text = `Stato ${item.examinationState}`;
    }

    return (
      <td>
        <span className={className}>{text}</span>
      </td>
    );
  }, []);

  // =========================================================================
  // RENDER
  // =========================================================================

  if (!isModalOpen) return null;

  const progressPercent = signProgress.total > 0
    ? ((signProgress.completed + signProgress.failed) / signProgress.total) * 100
    : 0;

  return (
    <>
      <Dialog
        title="Firma Remota Massiva"
        onClose={handleClose}
        width={1100}
        height={750}
        className="bulk-sign-dialog"
      >
        {/* Header: Provider e Sessione */}
        <div className="bulk-sign-header">
          <div className="provider-section">
            <label>Provider Firma:</label>
            <DropDownList
              data={availableProviders.filter(p => p.enabled && p.configured)}
              textField="name"
              dataItemKey="id"
              value={selectedProvider}
              onChange={handleProviderChange}
              disabled={isSigningInProgress}
              style={{ width: 220 }}
            />
          </div>

          <div className="session-section">
            {session.active ? (
              <div className="session-active">
                <SvgIcon icon={clockIcon} />
                <span className="session-info">
                  <strong>{session.signedByCN}</strong>
                  <span className="session-time">
                    {session.remainingMinutes} min rimanenti
                  </span>
                </span>
              </div>
            ) : (
              <div className="session-inactive">
                <span>Nessuna sessione attiva</span>
              </div>
            )}
          </div>
        </div>

        {/* Filtri */}
        <div className="bulk-sign-filters">
          <div className="filter-group">
            <label>Da:</label>
            <DatePicker
              value={filters.dateFrom ? new Date(filters.dateFrom) : null}
              onChange={handleDateFromChange}
              format="dd/MM/yyyy"
              disabled={isSigningInProgress}
            />
          </div>

          <div className="filter-group">
            <label>A:</label>
            <DatePicker
              value={filters.dateTo ? new Date(filters.dateTo) : null}
              onChange={handleDateToChange}
              format="dd/MM/yyyy"
              disabled={isSigningInProgress}
            />
          </div>

          <div className="filter-group">
            <label>Paziente:</label>
            <Input
              value={filters.patientName}
              onChange={handlePatientNameChange}
              placeholder="Cerca..."
              disabled={isSigningInProgress}
              style={{ width: 180 }}
            />
          </div>

          <div className="filter-group">
            <label>Stato:</label>
            <DropDownList
              data={STATUS_OPTIONS}
              textField="text"
              dataItemKey="value"
              value={STATUS_OPTIONS.find(s => s.value === filters.status)}
              onChange={handleStatusChange}
              disabled={isSigningInProgress}
              style={{ width: 130 }}
            />
          </div>
        </div>

        {/* Griglia Referti */}
        <div className="bulk-sign-grid">
          {isLoadingReports ? (
            <div className="loading-container">
              <Loader size="large" type="infinite-spinner" />
              <span>Caricamento referti...</span>
            </div>
          ) : loadError ? (
            <div className="error-container">
              <span className="error-message">{loadError}</span>
            </div>
          ) : (
            <Grid
              data={reports}
              style={{ height: 380 }}
              onRowClick={handleRowClick}
              rowRender={(row, props) => {
                const item = props.dataItem as ReportToSign;
                return React.cloneElement(row, {
                  className: `${row.props.className || ''} ${item.selected ? 'row-selected' : ''}`
                });
              }}
            >
              <GridColumn
                field="selected"
                title=" "
                width={50}
                cell={SelectionCell}
              />
              <GridColumn
                field="patientLastName"
                title="Cognome"
                width={140}
              />
              <GridColumn
                field="patientFirstName"
                title="Nome"
                width={120}
              />
              <GridColumn
                field="examinationMnemonicCodeFull"
                title="Codice Esame"
                width={200}
                cell={ExamCodeCell}
              />
              <GridColumn
                field="printDate"
                title="Data Salvataggio"
                width={130}
                cell={DateCell}
              />
              <GridColumn
                field="examinationState"
                title="Stato"
                width={100}
                cell={StateCell}
              />
              <GridColumn
                field="doctorDisplayName"
                title="Medico"
                width={150}
                cell={DoctorCell}
              />
              <GridColumn
                field="signStatus"
                title="Firma"
                width={120}
                cell={SignStatusCell}
              />
            </Grid>
          )}
        </div>

        {/* Barra Selezione */}
        <div className="bulk-sign-selection-bar">
          <div className="selection-actions">
            <Button
              onClick={handleSelectAll}
              disabled={isSigningInProgress || totalCount === 0}
            >
              Seleziona tutti
            </Button>
            <Button
              onClick={handleDeselectAll}
              disabled={isSigningInProgress || selectedCount === 0}
            >
              Deseleziona
            </Button>
          </div>
          <div className="selection-info">
            <span className="selection-count">
              {selectedCount} selezionati su {totalCount}
            </span>
            {signedCount > 0 && (
              <span className="signed-count">
                ({signedCount} firmati)
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {isSigningInProgress && (
          <div className="bulk-sign-progress">
            <ProgressBar value={progressPercent} />
            <div className="progress-info">
              <span>
                Firmando: <strong>{signProgress.currentPatient || '...'}</strong>
              </span>
              <span>
                {signProgress.completed + signProgress.failed}/{signProgress.total}
                {signProgress.failed > 0 && (
                  <span className="failed-count"> ({signProgress.failed} errori)</span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <DialogActionsBar>
          <Button
            onClick={handleClose}
            disabled={isSigningInProgress}
          >
            Chiudi
          </Button>
          <Button
            themeColor="primary"
            onClick={handleStartSign}
            disabled={
              selectedCount === 0 ||
              isSigningInProgress ||
              !selectedProviderId
            }
            svgIcon={pencilIcon}
          >
            {session.active
              ? `Firma ${selectedCount} Referti`
              : signatureType === 'automatic' && hasRemoteSignPassword && (selectedProviderId?.toUpperCase() !== 'NAMIRIAL' || hasRemoteSignPin)
                ? `Firma Automatica ${selectedCount} Referti`
                : 'Avvia Sessione e Firma'}
          </Button>
        </DialogActionsBar>
      </Dialog>

      {/* Notifiche */}
      <NotificationGroup
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 10001
        }}
      >
        {errorMessage && (
          <Notification
            type={{ style: 'error', icon: true }}
            closable
            onClose={() => dispatch(clearMessages())}
          >
            {errorMessage}
          </Notification>
        )}
        {successMessage && (
          <Notification
            type={{ style: 'success', icon: true }}
            closable
            onClose={() => dispatch(clearMessages())}
          >
            {successMessage}
          </Notification>
        )}
      </NotificationGroup>

      {/* Dialog Autenticazione */}
      {isAuthDialogOpen && <BulkSignAuthDialog />}

      {/* Dialog Anteprima PDF */}
      {previewOpen && (
        <Dialog
          title={
            <span>
              Anteprima PDF - {previewReportInfo?.patientName || 'Referto'}
              {previewReportInfo?.examNames && previewReportInfo.examNames.length > 1 && (
                <span className="preview-exam-count">
                  ({previewReportInfo.examNames.length} esami)
                </span>
              )}
            </span>
          }
          onClose={handleClosePreview}
          width={900}
          height={700}
          className="pdf-preview-dialog"
        >
          <div className="pdf-preview-content">
            {previewLoading && (
              <div className="preview-loading">
                <Loader size="large" type="infinite-spinner" />
                <p>Caricamento anteprima...</p>
              </div>
            )}

            {previewError && (
              <div className="preview-error">
                <SvgIcon icon={xCircleIcon} size="xlarge" style={{ color: '#ef4444' }} />
                <p>{previewError}</p>
                <Button onClick={handleClosePreview}>Chiudi</Button>
              </div>
            )}

            {previewPdfBase64 && !previewLoading && !previewError && (
              <>
                {/* Info esami se referto composto */}
                {previewReportInfo?.examNames && previewReportInfo.examNames.length > 0 && (
                  <div className="preview-exam-list">
                    <strong>Esami inclusi:</strong>
                    <ul>
                      {previewReportInfo.examNames.map((name, idx) => (
                        <li key={idx}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Visualizzatore PDF */}
                <iframe
                  src={`data:application/pdf;base64,${previewPdfBase64}`}
                  className="pdf-viewer"
                  title="Anteprima PDF"
                />
              </>
            )}
          </div>

          <DialogActionsBar>
            <Button onClick={handleClosePreview}>
              Chiudi
            </Button>
          </DialogActionsBar>
        </Dialog>
      )}
    </>
  );
};

export default BulkSignModal;
