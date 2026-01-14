/**
 * BulkSignAuthDialog.tsx
 * Dialog per autenticazione firma remota (PIN + OTP)
 */

import React, { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Dialog, DialogActionsBar } from '@progress/kendo-react-dialogs';
import { Input, NumericTextBox } from '@progress/kendo-react-inputs';
import { Button } from '@progress/kendo-react-buttons';
import { Loader } from '@progress/kendo-react-indicators';
import { lockIcon, unlockIcon } from '@progress/kendo-svg-icons';

import { RootState, AppDispatch } from '../store';
import {
  closeAuthDialog,
  updateSession,
  setErrorMessage,
  startSigning,
  finishSigning,
  selectSelectedReports
} from '../store/bulkSignSlice';

/**
 * Dialog di autenticazione per firma remota
 */
const BulkSignAuthDialog: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();

  // Stato Redux
  const { selectedProviderId, availableProviders } = useSelector(
    (state: RootState) => state.bulkSign
  );
  const selectedReports = useSelector(selectSelectedReports);

  // Provider selezionato
  const selectedProvider = availableProviders.find(p => p.id === selectedProviderId);

  // Stato locale form
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [otp, setOtp] = useState('');
  const [sessionMinutes, setSessionMinutes] = useState(45);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleClose = useCallback(() => {
    if (!isAuthenticating) {
      dispatch(closeAuthDialog());
    }
  }, [isAuthenticating, dispatch]);

  const handleAuthenticate = useCallback(async () => {
    // Validazione
    if (!username.trim()) {
      setLocalError('Username obbligatorio');
      return;
    }
    if (!pin.trim()) {
      setLocalError('PIN obbligatorio');
      return;
    }
    if (!otp.trim()) {
      setLocalError('OTP obbligatorio');
      return;
    }

    setIsAuthenticating(true);
    setLocalError(null);

    try {
      // Chiama IPC per autenticazione
      const result = await (window as any).remoteSign?.authenticate({
        providerId: selectedProviderId,
        username: username.trim(),
        pin: pin.trim(),
        otp: otp.trim(),
        sessionMinutes
      });

      if (result?.success) {
        // Aggiorna sessione nello store
        dispatch(updateSession({
          active: true,
          providerId: selectedProviderId,
          expiresAt: result.expiresAt,
          remainingMinutes: sessionMinutes,
          signedByCN: result.signedBy || username
        }));

        // Chiudi dialog
        dispatch(closeAuthDialog());

        // Avvia firma automaticamente
        dispatch(startSigning());

        // Chiama IPC per avviare firma batch
        await (window as any).remoteSign?.startBulkSign({
          reports: selectedReports,
          providerId: selectedProviderId
        });
      } else {
        setLocalError(result?.error || 'Autenticazione fallita');
      }
    } catch (error: any) {
      console.error('Errore autenticazione:', error);
      setLocalError(error.message || 'Errore di connessione');
    } finally {
      setIsAuthenticating(false);
    }
  }, [
    username,
    pin,
    otp,
    sessionMinutes,
    selectedProviderId,
    selectedReports,
    dispatch
  ]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isAuthenticating) {
      handleAuthenticate();
    }
  }, [isAuthenticating, handleAuthenticate]);

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <Dialog
      title={`Autenticazione ${selectedProvider?.name || 'Firma Remota'}`}
      onClose={handleClose}
      width={420}
      className="bulk-sign-auth-dialog"
    >
      <div className="auth-form" onKeyDown={handleKeyDown}>
        {/* Info */}
        <div className="auth-info">
          Inserisci le credenziali per avviare una sessione di firma.
          La sessione permette di firmare pi&ugrave; referti senza reinserire OTP.
        </div>

        {/* Username */}
        <div className="auth-form-group">
          <label htmlFor="auth-username">Username / User ID</label>
          <Input
            id="auth-username"
            value={username}
            onChange={(e) => setUsername(e.value as string)}
            placeholder="Inserisci username"
            disabled={isAuthenticating}
            autoFocus
          />
        </div>

        {/* PIN */}
        <div className="auth-form-group">
          <label htmlFor="auth-pin">PIN</label>
          <Input
            id="auth-pin"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.value as string)}
            placeholder="Inserisci PIN"
            disabled={isAuthenticating}
          />
        </div>

        {/* OTP */}
        <div className="auth-form-group">
          <label htmlFor="auth-otp">OTP (codice SMS/App)</label>
          <Input
            id="auth-otp"
            value={otp}
            onChange={(e) => setOtp(e.value as string)}
            placeholder="Codice OTP"
            maxLength={8}
            disabled={isAuthenticating}
          />
          <small>
            Il codice OTP ti &egrave; stato inviato via SMS o &egrave; disponibile nell'app
          </small>
        </div>

        {/* Durata sessione */}
        <div className="auth-form-group">
          <label htmlFor="auth-duration">Durata sessione (minuti)</label>
          <NumericTextBox
            id="auth-duration"
            value={sessionMinutes}
            onChange={(e) => setSessionMinutes(e.value || 45)}
            min={15}
            max={60}
            step={5}
            disabled={isAuthenticating}
            style={{ width: 120 }}
          />
          <small>
            La sessione permette di firmare senza reinserire OTP per il tempo indicato
          </small>
        </div>

        {/* Errore */}
        {localError && (
          <div className="auth-error">
            {localError}
          </div>
        )}
      </div>

      <DialogActionsBar>
        <Button
          onClick={handleClose}
          disabled={isAuthenticating}
        >
          Annulla
        </Button>
        <Button
          themeColor="primary"
          onClick={handleAuthenticate}
          disabled={isAuthenticating || !username || !pin || !otp}
          svgIcon={isAuthenticating ? undefined : unlockIcon}
        >
          {isAuthenticating ? (
            <>
              <Loader size="small" type="pulsing" />
              <span style={{ marginLeft: 8 }}>Autenticazione...</span>
            </>
          ) : (
            'Accedi e Firma'
          )}
        </Button>
      </DialogActionsBar>
    </Dialog>
  );
};

export default BulkSignAuthDialog;
