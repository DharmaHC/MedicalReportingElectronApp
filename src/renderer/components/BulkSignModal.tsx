/**
 * BulkSignModal.tsx
 * Modale principale per la firma remota massiva dei referti.
 */

import React, { useEffect, useCallback, useMemo } from 'react';
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
import {
  pencilIcon,
  checkIcon,
  xCircleIcon,
  clockIcon,
  filterIcon
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
import './BulkSignModal.css';

// Opzioni per filtro stato
const STATUS_OPTIONS = [
  { text: 'Tutti', value: 'all' },
  { text: 'Bozze', value: 'draft' },
  { text: 'Da Firmare', value: 'toSign' }
];

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

  const { doctorCode, token } = useSelector((state: RootState) => state.auth);

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

    // Se sessione non attiva, apri dialog autenticazione
    if (!session.active) {
      dispatch(openAuthDialog());
      return;
    }

    // Avvia firma
    dispatch(startSigning());
    dispatch(clearMessages());

    try {
      const selectedReports = reports.filter(r => r.selected);
      await (window as any).remoteSign?.startBulkSign({
        reports: selectedReports,
        providerId: selectedProviderId
      });
    } catch (error: any) {
      dispatch(setErrorMessage(error.message || 'Errore avvio firma'));
      dispatch(finishSigning({ successCount: 0, failCount: selectedCount }));
    }
  }, [selectedProviderId, selectedCount, session.active, reports, dispatch]);

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

  // Data formattata
  const DateCell = useCallback((props: GridCellProps) => {
    const item = props.dataItem as ReportToSign;
    const date = item.examinationDate
      ? new Date(item.examinationDate).toLocaleDateString('it-IT')
      : '-';
    return <td>{date}</td>;
  }, []);

  // Stato referto
  const StateCell = useCallback((props: GridCellProps) => {
    const item = props.dataItem as ReportToSign;
    const stateText = item.examResultStateId === 6 ? 'Bozza' : 'Da Firmare';
    const stateClass = item.examResultStateId === 6 ? 'state-draft' : 'state-to-sign';

    return (
      <td>
        <span className={`report-state ${stateClass}`}>{stateText}</span>
      </td>
    );
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
                width={150}
              />
              <GridColumn
                field="patientFirstName"
                title="Nome"
                width={130}
              />
              <GridColumn
                field="examName"
                title="Esame"
                width={200}
              />
              <GridColumn
                field="examinationDate"
                title="Data"
                width={100}
                cell={DateCell}
              />
              <GridColumn
                field="examResultStateId"
                title="Stato"
                width={110}
                cell={StateCell}
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
    </>
  );
};

export default BulkSignModal;
