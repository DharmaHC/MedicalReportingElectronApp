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
    userName,
    doctorCode,
    remoteSignUsername,
    hasRemoteSignPassword,
    hasRemoteSignPin,
    signatureType
  } = useSelector((state: RootState) => state.auth);
  const codCertRHI = useSelector((state: RootState) => (state.auth as any).codCertRHI as string | null);
  const hasRhiPin = useSelector((state: RootState) => (state.auth as any).hasRhiPin as boolean);

  // Determina modalità di firma basata su signatureType (fonte: DB)
  // signatureType='otp' → usa RHI (codCertRHI + pinRHI), richiede OTP
  // signatureType='automatic' → usa AHI (remoteSignUsername + password/pin), senza OTP
  // Fallback: se signatureType non è impostato, determina dalla presenza dei dati
  const hasCompleteAHI = Boolean(remoteSignUsername) && (hasRemoteSignPassword || hasRemoteSignPin);
  const hasCompleteRHI = Boolean(codCertRHI) && hasRhiPin;
  const useRHIMode = signatureType === 'otp'
    ? hasCompleteRHI   // signatureType=otp → usa RHI se completo
    : signatureType === 'automatic'
      ? false          // signatureType=automatic → usa sempre AHI
      : !hasCompleteAHI && hasCompleteRHI;  // fallback: RHI solo se AHI incompleto

  // Provider selezionato
  const selectedProvider = availableProviders.find(p => p.id === selectedProviderId);

  // Determina se è Namirial (sessione max 3 minuti)
  const isNamirial = selectedProviderId?.toUpperCase() === 'NAMIRIAL';

  // Stato locale form - precompila username: RHI se disponibile, altrimenti AHI
  const [username, setUsername] = useState(useRHIMode ? (codCertRHI || '') : (remoteSignUsername || ''));
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

  // Aggiorna username quando cambiano le credenziali configurate
  useEffect(() => {
    if (!username) {
      if (useRHIMode && codCertRHI) {
        setUsername(codCertRHI);
      } else if (remoteSignUsername) {
        setUsername(remoteSignUsername);
      }
    }
  }, [remoteSignUsername, codCertRHI, useRHIMode]);

  // Aggiorna durata sessione se cambia provider
  useEffect(() => {
    setSessionMinutes(isNamirial ? 3 : 45);
  }, [isNamirial]);

  // Focus sul campo OTP in modalità RHI (dopo che il dialog è montato e i campi precompilati)
  useEffect(() => {
    if (useRHIMode) {
      setTimeout(() => {
        const otpInput = document.getElementById('auth-otp');
        if (otpInput) {
          (otpInput as HTMLInputElement).focus();
        }
      }, 150);
    }
  }, [useRHIMode]);

  // Carica credenziali salvate dal backend (password e/o PIN)
  useEffect(() => {
    const loadSavedCredentials = async () => {
      if (!token || !isNamirial) return;
      // Serve almeno una credenziale salvata (AHI password/pin oppure RHI pin)
      if (!hasRemoteSignPassword && !hasRemoteSignPin && !hasRhiPin) return;

      setIsLoadingCredentials(true);
      try {
        const result = await (window as any).remoteSign?.getStoredCredentials({
          token,
          apiBaseUrl: getOriginalApiBaseUrl(),
          username: userName  // Codice fiscale per lookup nel DB
        });

        if (result?.success) {
          if (useRHIMode) {
            // Modalità RHI: usa pinRHI come PIN
            if (result.pinRHI) {
              setPin(result.pinRHI);
            }
          } else {
            // Modalità AHI: PIN separato o password come PIN
            if (result.pin && hasRemoteSignPin) {
              setPin(result.pin);
            } else if (result.password && hasRemoteSignPassword && !hasRemoteSignPin) {
              setPin(result.password);
            }
          }
        }
      } catch (error) {
        console.error('Errore caricamento credenziali salvate:', error);
      } finally {
        setIsLoadingCredentials(false);
      }
    };

    loadSavedCredentials();
  }, [token, isNamirial, hasRemoteSignPassword, hasRemoteSignPin, hasRhiPin, useRHIMode]);

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
    if (useRHIMode && !otp.trim()) {
      setLocalError('OTP obbligatorio per la firma RHI');
      return;
    }

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
        {/* Warning se nessuna configurazione completa per la modalità selezionata */}
        {isNamirial && (
          (signatureType === 'otp' && !hasCompleteRHI) ? (
            <div className="auth-error">
              Configurazione RHI incompleta. Verificare che codice dispositivo RHI e PIN siano configurati nelle impostazioni del profilo.
            </div>
          ) : (signatureType === 'automatic' && !hasCompleteAHI) ? (
            <div className="auth-error">
              Configurazione AHI incompleta. Verificare che codice dispositivo AHI e password siano configurati nelle impostazioni del profilo.
            </div>
          ) : (!signatureType && !hasCompleteAHI && !hasCompleteRHI) ? (
            <div className="auth-error">
              Firma remota non configurata. Configurare le credenziali AHI (firma automatica) o RHI (firma con OTP) nelle impostazioni del profilo.
            </div>
          ) : null
        )}

        {/* Info */}
        <div className="auth-info">
          {useRHIMode ? (
            <>Firma con OTP (dispositivo RHI). Inserisci il codice OTP per avviare una sessione di 3 minuti.</>
          ) : isNamirial ? (
            <>Firma automatica (dispositivo AHI). La sessione Namirial dura massimo 3 minuti.</>
          ) : (
            <>Inserisci le credenziali per avviare una sessione di firma.</>
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
            {isNamirial
              ? (useRHIMode ? 'Codice Dispositivo RHI' : 'Codice Dispositivo AHI')
              : 'Username Certificato'}
          </label>
          <Input
            id="auth-username"
            value={username}
            onChange={(e) => setUsername(e.value as string)}
            placeholder={isNamirial
              ? (useRHIMode ? 'es. RHIP26011648243800' : 'es. AHI7789383744609')
              : 'Username del certificato remoto'}
            disabled={isAuthenticating}
            autoFocus={!username && !useRHIMode}
          />
          {isNamirial && (
            <small>{useRHIMode
              ? 'Il codice RHI del tuo certificato Namirial (firma con OTP)'
              : 'Il codice AHI del tuo certificato Namirial (firma automatica)'
            }</small>
          )}
        </div>

        {/* PIN */}
        <div className="auth-form-group">
          <label htmlFor="auth-pin">
            {isNamirial ? 'PIN' : 'PIN'} {((useRHIMode && hasRhiPin) || (!useRHIMode && (hasRemoteSignPin || hasRemoteSignPassword))) && isNamirial ? '(salvato)' : ''}
          </label>
          <div className="input-with-icon">
            <Input
              id="auth-pin"
              type={showPin ? 'text' : 'password'}
              value={pin}
              onChange={(e) => setPin(e.value as string)}
              placeholder={isLoadingCredentials ? '(caricamento...)' : 'PIN del certificato'}
              disabled={isAuthenticating || isLoadingCredentials}
              autoFocus={!!username && !pin && !useRHIMode}
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
            <small>{useRHIMode ? 'Il PIN del dispositivo RHI' : 'La password del dispositivo AHI'}</small>
          )}
        </div>

        {/* OTP */}
        <div className="auth-form-group">
          <label htmlFor="auth-otp">
            OTP (codice SMS/App){useRHIMode ? ' - obbligatorio' : ' - opzionale'}
          </label>
          <Input
            id="auth-otp"
            value={otp}
            onChange={(e) => setOtp(e.value as string)}
            placeholder={useRHIMode ? 'Inserisci il codice OTP' : 'Lascia vuoto per firma automatica'}
            maxLength={8}
            disabled={isAuthenticating}
            autoFocus={useRHIMode}
          />
          <small>
            {useRHIMode
              ? "Codice OTP dall'app Namirial Sign o ricevuto via SMS. Obbligatorio per la firma RHI."
              : isNamirial
                ? "Codice OTP dall'app Namirial Sign o ricevuto via SMS. Lascia vuoto per firma automatica."
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
