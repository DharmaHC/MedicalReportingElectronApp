/**
 * BulkSignAuthDialog.tsx
 * Dialog per autenticazione firma remota (PIN + OTP)
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Dialog, DialogActionsBar } from '@progress/kendo-react-dialogs';
import { Input, NumericTextBox } from '@progress/kendo-react-inputs';
import { Button } from '@progress/kendo-react-buttons';
import { Loader } from '@progress/kendo-react-indicators';
import { unlockIcon, eyeIcon } from '@progress/kendo-svg-icons';
import { SvgIcon } from '@progress/kendo-react-common';

import { RootState, AppDispatch } from '../store';
import {
  closeAuthDialog,
  updateSession,
  setErrorMessage,
  startSigning,
  finishSigning,
  selectSelectedReports
} from '../store/bulkSignSlice';
import { getOriginalApiBaseUrl } from '../utility/urlLib';

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

  // Auth state per precompilare e per token/apiBaseUrl
  const {
    token,
    doctorCode,
    remoteSignUsername,
    hasRemoteSignPin
  } = useSelector((state: RootState) => state.auth);

  // Provider selezionato
  const selectedProvider = availableProviders.find(p => p.id === selectedProviderId);

  // Determina se è Namirial (sessione max 3 minuti)
  const isNamirial = selectedProviderId?.toUpperCase() === 'NAMIRIAL';

  // Stato locale form - precompila username con remoteSignUsername
  const [username, setUsername] = useState(remoteSignUsername || '');
  const [pin, setPin] = useState('');
  const [otp, setOtp] = useState('');
  const [sessionMinutes, setSessionMinutes] = useState(isNamirial ? 3 : 45);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(false);

  // Stato per supporto On-Premises Namirial
  const [endpointInfo, setEndpointInfo] = useState<{
    isOnPremise: boolean;
    hasSaaS: boolean;
    hasOnPremise: boolean;
    baseUrl: string;
  } | null>(null);
  const [isSwitchingEndpoint, setIsSwitchingEndpoint] = useState(false);

  // Carica info endpoint Namirial all'apertura se Namirial è selezionato
  useEffect(() => {
    const loadEndpointInfo = async () => {
      if (!isNamirial) {
        setEndpointInfo(null);
        return;
      }

      try {
        const result = await (window as any).remoteSign?.getNamirialEndpointInfo();
        if (result?.success) {
          setEndpointInfo({
            isOnPremise: result.isOnPremise || false,
            hasSaaS: result.hasSaaS || false,
            hasOnPremise: result.hasOnPremise || false,
            baseUrl: result.baseUrl || ''
          });
        }
      } catch (error) {
        console.error('Errore caricamento info endpoint Namirial:', error);
      }
    };

    loadEndpointInfo();
  }, [isNamirial]);

  // Aggiorna username quando cambia remoteSignUsername
  useEffect(() => {
    if (remoteSignUsername && !username) {
      setUsername(remoteSignUsername);
    }
  }, [remoteSignUsername]);

  // Aggiorna durata sessione se cambia provider
  useEffect(() => {
    setSessionMinutes(isNamirial ? 3 : 45);
  }, [isNamirial]);

  // Carica PIN salvato dal backend (se presente)
  useEffect(() => {
    const loadSavedCredentials = async () => {
      if (!token || !isNamirial) return;
      if (!hasRemoteSignPin) return;

      setIsLoadingCredentials(true);
      try {
        const result = await (window as any).remoteSign?.getStoredCredentials({
          token,
          apiBaseUrl: getOriginalApiBaseUrl()
        });

        if (result?.success && result.pin && hasRemoteSignPin) {
          setPin(result.pin);
        }
      } catch (error) {
        console.error('Errore caricamento credenziali salvate:', error);
      } finally {
        setIsLoadingCredentials(false);
      }
    };

    loadSavedCredentials();
  }, [token, isNamirial, hasRemoteSignPin]);

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
    // OTP è opzionale per firma automatica (es. credenziali demo DEMO/foo123)

    setIsAuthenticating(true);
    setLocalError(null);

    // Determina se è firma automatica (senza OTP)
    const isAutomaticSign = !otp.trim();

    try {
      // Chiama IPC per autenticazione
      // Per Namirial SWS: username=codice dispositivo, password=PIN, otp=codice OTP (opzionale)
      const result = await (window as any).remoteSign?.authenticate({
        providerId: selectedProviderId,
        username: username.trim(),
        pin: pin.trim(),
        otp: otp.trim() || undefined,  // undefined se vuoto (firma automatica)
        sessionMinutes: isNamirial ? 3 : sessionMinutes,  // Namirial max 3 minuti
        isAutomatic: isAutomaticSign  // true se senza OTP
      });

      if (result?.success) {
        // Aggiorna sessione nello store
        dispatch(updateSession({
          active: true,
          providerId: selectedProviderId,
          expiresAt: result.expiresAt,
          remainingMinutes: isNamirial ? 3 : sessionMinutes,
          signedByCN: result.signedBy || username
        }));

        // Chiudi dialog
        dispatch(closeAuthDialog());

        // Avvia firma automaticamente
        dispatch(startSigning());

        // Prepara i report per la firma
        const reportsForSigning = selectedReports.map(r => ({
          digitalReportId: r.digitalReportId,
          examinationId: r.examinationId,
          linkedResultIds: r.linkedResultIds || [],
          patientLastName: r.patientLastName,
          patientFirstName: r.patientFirstName,
          companyId: r.companyId,
          doctorCode: r.doctorCode || doctorCode
        }));

        // Chiama IPC per avviare firma batch con tutti i parametri necessari
        await (window as any).remoteSign?.startBulkSign({
          reports: reportsForSigning,
          providerId: selectedProviderId,
          token,
          apiBaseUrl: getOriginalApiBaseUrl(),
          signedByName: result.signedBy || username
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
    isNamirial,
    token,
    doctorCode,
    dispatch
  ]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isAuthenticating) {
      handleAuthenticate();
    }
  }, [isAuthenticating, handleAuthenticate]);

  // Handler per cambio endpoint Namirial (SaaS <-> On-Premises)
  const handleEndpointChange = useCallback(async (useOnPremise: boolean) => {
    if (isSwitchingEndpoint) return;

    setIsSwitchingEndpoint(true);
    setLocalError(null);

    try {
      const result = await (window as any).remoteSign?.switchNamirialEndpoint({ useOnPremise });
      if (result?.success) {
        setEndpointInfo({
          isOnPremise: result.isOnPremise || false,
          hasSaaS: result.hasSaaS || false,
          hasOnPremise: result.hasOnPremise || false,
          baseUrl: result.baseUrl || ''
        });
      } else {
        setLocalError(result?.error || 'Errore cambio endpoint');
      }
    } catch (error: any) {
      console.error('Errore switch endpoint:', error);
      setLocalError(error.message || 'Errore cambio endpoint');
    } finally {
      setIsSwitchingEndpoint(false);
    }
  }, [isSwitchingEndpoint]);

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
          {isNamirial ? (
            <><br /><strong>Nota:</strong> La sessione Namirial dura massimo 3 minuti.</>
          ) : (
            <> La sessione permette di firmare pi&ugrave; referti senza reinserire OTP.</>
          )}
        </div>

        {/* Selezione Endpoint Namirial (SaaS vs On-Premises) */}
        {isNamirial && endpointInfo && endpointInfo.hasSaaS && endpointInfo.hasOnPremise && (
          <div className="auth-form-group endpoint-selector">
            <label>Endpoint Server</label>
            <div className="endpoint-options">
              <label className={`endpoint-option ${!endpointInfo.isOnPremise ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="endpoint"
                  checked={!endpointInfo.isOnPremise}
                  onChange={() => handleEndpointChange(false)}
                  disabled={isAuthenticating || isSwitchingEndpoint}
                />
                <span className="endpoint-label">
                  <strong>SaaS</strong>
                  <small>Namirial Cloud (richiede mTLS)</small>
                </span>
              </label>
              <label className={`endpoint-option ${endpointInfo.isOnPremise ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="endpoint"
                  checked={endpointInfo.isOnPremise}
                  onChange={() => handleEndpointChange(true)}
                  disabled={isAuthenticating || isSwitchingEndpoint}
                />
                <span className="endpoint-label">
                  <strong>On-Premises</strong>
                  <small>Server locale/privato</small>
                </span>
              </label>
            </div>
            {isSwitchingEndpoint && (
              <small style={{ color: '#666' }}>Cambio endpoint in corso...</small>
            )}
            <small className="endpoint-url">
              Server: {endpointInfo.baseUrl}
            </small>
          </div>
        )}

        {/* Username / Codice Dispositivo */}
        <div className="auth-form-group">
          <label htmlFor="auth-username">
            {isNamirial ? 'Codice Dispositivo (RHI...)' : 'Username Certificato'}
          </label>
          <Input
            id="auth-username"
            value={username}
            onChange={(e) => setUsername(e.value as string)}
            placeholder={isNamirial ? 'es. RHIP26011648243800' : 'Username del certificato remoto'}
            disabled={isAuthenticating}
            autoFocus={!username}
          />
          {isNamirial && (
            <small>Il codice RHI del tuo certificato Namirial</small>
          )}
        </div>

        {/* PIN */}
        <div className="auth-form-group">
          <label htmlFor="auth-pin">
            {isNamirial ? 'PIN / Password' : 'PIN'} {hasRemoteSignPin && isNamirial ? '(salvato)' : ''}
          </label>
          <div className="input-with-icon">
            <Input
              id="auth-pin"
              type={showPin ? 'text' : 'password'}
              value={pin}
              onChange={(e) => setPin(e.value as string)}
              placeholder={hasRemoteSignPin && isNamirial ? '(caricato automaticamente)' : 'PIN del certificato'}
              disabled={isAuthenticating || isLoadingCredentials}
              autoFocus={!!username && !pin}
              style={{ flex: 1 }}
            />
            <Button
              fillMode="flat"
              onClick={() => setShowPin(!showPin)}
              title={showPin ? 'Nascondi' : 'Mostra'}
              disabled={isAuthenticating}
              style={{ minWidth: 40 }}
            >
              <SvgIcon icon={eyeIcon} />
            </Button>
          </div>
          {isNamirial && (
            <small>La password del dispositivo RHI</small>
          )}
        </div>

        {/* OTP */}
        <div className="auth-form-group">
          <label htmlFor="auth-otp">OTP (codice SMS/App) - <em>opzionale</em></label>
          <Input
            id="auth-otp"
            value={otp}
            onChange={(e) => setOtp(e.value as string)}
            placeholder="Lascia vuoto per firma automatica"
            maxLength={8}
            disabled={isAuthenticating}
          />
          <small>
            {isNamirial
              ? "Codice OTP dall'app Namirial Sign o ricevuto via SMS. Lascia vuoto per firma automatica (es. credenziali DEMO)"
              : "Il codice OTP ti è stato inviato via SMS o è disponibile nell'app"
            }
          </small>
        </div>

        {/* Durata sessione - nascosto per Namirial (fisso 3 min) */}
        {!isNamirial && (
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
        )}

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
          disabled={isAuthenticating || !username || !pin}
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
