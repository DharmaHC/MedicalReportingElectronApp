/**
 * SignProvidersConfigModal.tsx
 * Modale per la configurazione e amministrazione dei provider di firma remota.
 * Accessibile solo agli utenti admin.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Dialog, DialogActionsBar } from '@progress/kendo-react-dialogs';
import { TabStrip, TabStripTab, TabStripSelectEventArguments } from '@progress/kendo-react-layout';
import { Button } from '@progress/kendo-react-buttons';
import { Input, TextArea } from '@progress/kendo-react-inputs';
import { DropDownList } from '@progress/kendo-react-dropdowns';
import { Loader } from '@progress/kendo-react-indicators';
import { Notification, NotificationGroup } from '@progress/kendo-react-notification';
import { Grid, GridColumn } from '@progress/kendo-react-grid';
import {
  gearIcon,
  checkIcon,
  xCircleIcon,
  eyeIcon,
  trashIcon,
  plusIcon,
  arrowRotateCwIcon
} from '@progress/kendo-svg-icons';
import { SvgIcon } from '@progress/kendo-react-common';
import { RootState } from '../store';
import {
  setSignatureType,
  setRemoteSignUsername,
  setRemoteSignProvider,
  setHasRemoteSignPassword,
  setHasRemoteSignPin
} from '../store/authSlice';
import { getApiBaseUrl } from '../utility/urlLib';
import './SignProvidersConfigModal.css';

// ============================================================================
// INTERFACES
// ============================================================================

interface SignProvidersConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface OpenApiCertificate {
  id: string;
  certificateType: string;
  state: string;
  certificateLink?: string;
  certificateOwner: {
    owner: string;
    customReference?: string;
  };
  createdAt: string;
  expireAt: string;
}

interface OpenApiSignature {
  id: string;
  documentName: string;
  signedAt: string;
  signedBy: string;
  status: string;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// OPENAPI TAB COMPONENT
// ============================================================================

const OpenApiTab: React.FC = () => {
  // State per configurazione
  const [config, setConfig] = useState({
    baseUrl: 'https://test.esignature.openapi.com',
    apiKey: '',
    token: '',  // Token OAuth2 generato manualmente
    certificateType: 'EU-QES_otp'
  });

  // State per operazioni
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // State per dati
  const [certificates, setCertificates] = useState<OpenApiCertificate[]>([]);
  const [signatures, setSignatures] = useState<OpenApiSignature[]>([]);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  // State per form di test firma
  const [testSignForm, setTestSignForm] = useState({
    otp: '',
    testDocument: ''
  });

  // State per form registrazione certificato
  const [certForm, setCertForm] = useState({
    certificateOwner: '',  // Nome e cognome del titolare
    customReference: ''    // Riferimento personalizzato (opzionale)
  });
  const [showCertForm, setShowCertForm] = useState(false);

  // Carica configurazione all'avvio
  useEffect(() => {
    console.log('[OpenApiTab] useEffect - loading config');
    console.log('[OpenApiTab] window.remoteSignAdmin available:', !!(window as any).remoteSignAdmin);
    loadConfig();
  }, []);

  const loadConfig = async () => {
    console.log('[OpenApiTab] loadConfig CALLED');
    try {
      console.log('[OpenApiTab] Calling getOpenApiConfig...');
      const result = await (window as any).remoteSignAdmin?.getOpenApiConfig();
      console.log('[OpenApiTab] getOpenApiConfig result:', result);
      if (result?.success && result.config) {
        setConfig({
          baseUrl: result.config.baseUrl || 'https://test.esignature.openapi.com',
          apiKey: result.config.apiKey || '',
          token: result.config.token || '',
          certificateType: result.config.certificateType || 'EU-QES_otp'
        });
      }
    } catch (e: any) {
      console.error('[OpenApiTab] Errore caricamento config:', e);
    }
  };

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  // =========================================================================
  // API HANDLERS
  // =========================================================================

  /**
   * GET /certificates - Lista certificati
   */
  const handleGetCertificates = useCallback(async () => {
    console.log('[OpenApiTab] handleGetCertificates CALLED');
    console.log('[OpenApiTab] window.remoteSignAdmin:', (window as any).remoteSignAdmin);
    console.log('[OpenApiTab] openApiGetCertificates fn:', (window as any).remoteSignAdmin?.openApiGetCertificates);

    setLoading(true);
    setError(null);
    try {
      console.log('[OpenApiTab] Calling openApiGetCertificates...');
      const result = await (window as any).remoteSignAdmin?.openApiGetCertificates();
      console.log('[OpenApiTab] Result:', result);

      if (result?.success) {
        // L'API restituisce { data: { data: [...], success, message, error } }
        const certs = result.data?.data || result.data || [];
        setCertificates(Array.isArray(certs) ? certs : []);
        showSuccess(`Trovati ${Array.isArray(certs) ? certs.length : 0} certificati`);
      } else {
        showError(result?.error || 'Errore recupero certificati');
      }
    } catch (e: any) {
      console.error('[OpenApiTab] Error:', e);
      showError(e.message || 'Errore chiamata API');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * POST /certificates/namirial-automatic - Acquista certificato automatico
   */
  const handleRegisterCertificate = useCallback(async () => {
    console.log('[OpenApiTab] handleRegisterCertificate CALLED');
    console.log('[OpenApiTab] certForm:', certForm);

    // Validazione - solo certificateOwner è obbligatorio
    if (!certForm.certificateOwner || certForm.certificateOwner.trim().length < 3) {
      showError('Inserire nome e cognome del titolare del certificato');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      console.log('[OpenApiTab] Calling openApiRegisterCertificate with params...');
      const result = await (window as any).remoteSignAdmin?.openApiRegisterCertificate({
        certificateOwner: certForm.certificateOwner.trim(),
        ...(certForm.customReference && { customReference: certForm.customReference.trim() })
      });
      console.log('[OpenApiTab] Register result:', result);

      if (result?.success) {
        // Mostra il link per la procedura di identificazione se presente
        const certLink = result.data?.data?.certificateLink;
        if (certLink) {
          showSuccess(`Certificato acquistato! Completa la procedura: ${certLink}`);
        } else {
          showSuccess('Certificato acquistato con successo! Riceverai email con le istruzioni.');
        }
        setShowCertForm(false);
        setCertForm({ certificateOwner: '', customReference: '' });
        handleGetCertificates(); // Ricarica lista
      } else {
        // Mostra errore con dettagli se disponibili
        let errorMsg = result?.error || 'Errore acquisto certificato';
        if (result?.details) {
          console.error('[OpenApiTab] Registration failed - Details:', result.details);
          // Aggiungi suggerimenti per errori comuni
          if (result.details.errorCode === 110) {
            errorMsg += '\n\nSuggerimento: L\'errore 110 "Invalid certificate" potrebbe indicare:\n' +
              '- Il token non ha i permessi per creare certificati\n' +
              '- L\'ambiente di test non supporta questa operazione\n' +
              '- Contattare OpenAPI per verificare i permessi del token';
          }
        }
        showError(errorMsg);
      }
    } catch (e: any) {
      console.error('[OpenApiTab] Register error:', e);
      showError(e.message || 'Errore chiamata API');
    } finally {
      setLoading(false);
    }
  }, [certForm, handleGetCertificates]);

  /**
   * GET /signatures - Storico firme
   */
  const handleGetSignatures = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await (window as any).remoteSignAdmin?.openApiGetSignatures();
      if (result?.success) {
        setSignatures(result.data || []);
        showSuccess(`Trovate ${result.data?.length || 0} firme`);
      } else {
        showError(result?.error || 'Errore recupero firme');
      }
    } catch (e: any) {
      showError(e.message || 'Errore chiamata API');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * DELETE /signatures - Elimina firma
   */
  const handleDeleteSignature = useCallback(async (signatureId: string) => {
    if (!window.confirm(`Sei sicuro di voler eliminare la firma ${signatureId}?`)) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await (window as any).remoteSignAdmin?.openApiDeleteSignature({ signatureId });
      if (result?.success) {
        showSuccess('Firma eliminata con successo');
        handleGetSignatures(); // Ricarica lista
      } else {
        showError(result?.error || 'Errore eliminazione firma');
      }
    } catch (e: any) {
      showError(e.message || 'Errore chiamata API');
    } finally {
      setLoading(false);
    }
  }, [handleGetSignatures]);

  /**
   * POST /verify - Verifica documento firmato
   */
  const handleVerifyDocument = useCallback(async () => {
    // Per ora usiamo un input file
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.p7m';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setLoading(true);
      setError(null);
      try {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const base64 = (ev.target?.result as string).split(',')[1];
          const result = await (window as any).remoteSignAdmin?.openApiVerifyDocument({
            documentBase64: base64,
            documentName: file.name
          });
          if (result?.success) {
            setVerifyResult(result.data);
            showSuccess('Verifica completata');
          } else {
            showError(result?.error || 'Errore verifica documento');
          }
          setLoading(false);
        };
        reader.readAsDataURL(file);
      } catch (e: any) {
        showError(e.message || 'Errore chiamata API');
        setLoading(false);
      }
    };
    input.click();
  }, []);

  /**
   * POST /EU-QES_otp - Test firma con OTP
   */
  const handleTestSignOtp = useCallback(async () => {
    if (!testSignForm.otp) {
      showError('Inserire OTP');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await (window as any).remoteSignAdmin?.openApiTestSignOtp({
        otp: testSignForm.otp
      });
      if (result?.success) {
        showSuccess('Test firma OTP completato con successo');
        setTestSignForm({ ...testSignForm, otp: '' });
      } else {
        showError(result?.error || 'Errore test firma OTP');
      }
    } catch (e: any) {
      showError(e.message || 'Errore chiamata API');
    } finally {
      setLoading(false);
    }
  }, [testSignForm]);

  /**
   * POST /EU-QES_automatic - Test firma automatica
   */
  const handleTestSignAutomatic = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await (window as any).remoteSignAdmin?.openApiTestSignAutomatic();
      if (result?.success) {
        showSuccess('Test firma automatica completato con successo');
      } else {
        showError(result?.error || 'Errore test firma automatica');
      }
    } catch (e: any) {
      showError(e.message || 'Errore chiamata API');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * POST /EU-QES_eseal - Test e-seal
   */
  const handleTestEseal = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await (window as any).remoteSignAdmin?.openApiTestEseal();
      if (result?.success) {
        showSuccess('Test e-seal completato con successo');
      } else {
        showError(result?.error || 'Errore test e-seal');
      }
    } catch (e: any) {
      showError(e.message || 'Errore chiamata API');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * POST /EU-SES - Test firma semplice
   */
  const handleTestSes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await (window as any).remoteSignAdmin?.openApiTestSes();
      if (result?.success) {
        showSuccess('Test firma semplice completato con successo');
      } else {
        showError(result?.error || 'Errore test firma semplice');
      }
    } catch (e: any) {
      showError(e.message || 'Errore chiamata API');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Salva configurazione
   */
  const handleSaveConfig = useCallback(async () => {
    setLoading(true);
    try {
      const result = await (window as any).remoteSignAdmin?.saveOpenApiConfig(config);
      if (result?.success) {
        showSuccess('Configurazione salvata');
      } else {
        showError(result?.error || 'Errore salvataggio');
      }
    } catch (e: any) {
      showError(e.message || 'Errore salvataggio');
    } finally {
      setLoading(false);
    }
  }, [config]);

  // =========================================================================
  // RENDER
  // =========================================================================

  const certificateTypes = [
    { value: 'EU-QES_otp', label: 'QES con OTP' },
    { value: 'EU-QES_automatic', label: 'QES Automatica' },
    { value: 'EU-QES_eseal', label: 'QES E-Seal' },
    { value: 'EU-SES', label: 'SES (Firma Semplice)' }
  ];

  return (
    <div className="openapi-tab">
      {/* Notifications */}
      <NotificationGroup style={{ position: 'fixed', top: 70, right: 20, zIndex: 10001 }}>
        {error && (
          <Notification type={{ style: 'error', icon: true }} closable onClose={() => setError(null)}>
            {error}
          </Notification>
        )}
        {success && (
          <Notification type={{ style: 'success', icon: true }} closable onClose={() => setSuccess(null)}>
            {success}
          </Notification>
        )}
      </NotificationGroup>

      {/* Loading overlay */}
      {loading && (
        <div className="loading-overlay">
          <Loader size="large" type="infinite-spinner" />
        </div>
      )}

      {/* Configurazione */}
      <section className="config-section">
        <h3><SvgIcon icon={gearIcon} /> Configurazione OpenAPI</h3>
        <div className="config-grid">
          <div className="config-field">
            <label>Base URL</label>
            <Input
              value={config.baseUrl}
              onChange={(e) => setConfig({ ...config, baseUrl: e.value || '' })}
              placeholder="https://test.esignature.openapi.com"
            />
          </div>
          <div className="config-field">
            <label>API Key (opzionale)</label>
            <Input
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.value || '' })}
              placeholder="Inserisci API Key"
              type="password"
            />
          </div>
          <div className="config-field">
            <label>Token OAuth2 (prioritario)</label>
            <Input
              value={config.token}
              onChange={(e) => setConfig({ ...config, token: e.value || '' })}
              placeholder="Token generato dalla console OpenAPI"
              type="password"
            />
          </div>
          <div className="config-field">
            <label>Tipo Certificato Default</label>
            <DropDownList
              data={certificateTypes}
              textField="label"
              dataItemKey="value"
              value={certificateTypes.find(t => t.value === config.certificateType)}
              onChange={(e) => setConfig({ ...config, certificateType: e.value?.value || 'EU-QES_otp' })}
            />
          </div>
          <div className="config-field config-actions">
            <Button
              svgIcon={checkIcon}
              onClick={handleSaveConfig}
              themeColor="primary"
            >
              Salva Configurazione
            </Button>
          </div>
        </div>
      </section>

      {/* Gestione Certificati */}
      <section className="admin-section">
        <h3>Gestione Certificati</h3>
        <div className="action-buttons">
          <Button svgIcon={arrowRotateCwIcon} onClick={handleGetCertificates}>
            Carica Certificati
          </Button>
          <Button
            svgIcon={plusIcon}
            onClick={() => setShowCertForm(!showCertForm)}
            themeColor={showCertForm ? 'base' : 'primary'}
          >
            {showCertForm ? 'Annulla' : 'Registra Nuovo Certificato'}
          </Button>
        </div>

        {/* Form registrazione certificato */}
        {showCertForm && (
          <div className="cert-registration-form">
            <h4>Acquisto Certificato Namirial Automatico (per firme massive)</h4>
            <div className="cert-form-grid">
              <div className="cert-form-field">
                <label>Nome e Cognome Titolare *</label>
                <Input
                  value={certForm.certificateOwner}
                  onChange={(e) => setCertForm({ ...certForm, certificateOwner: e.value || '' })}
                  placeholder="Mario Rossi"
                />
              </div>
              <div className="cert-form-field">
                <label>Riferimento Personalizzato (opzionale)</label>
                <Input
                  value={certForm.customReference}
                  onChange={(e) => setCertForm({ ...certForm, customReference: e.value || '' })}
                  placeholder="Rif. interno #123"
                />
              </div>
              <div className="cert-form-field cert-form-actions">
                <Button onClick={handleRegisterCertificate} themeColor="primary" svgIcon={checkIcon}>
                  Acquista Certificato
                </Button>
              </div>
            </div>
            <p className="cert-form-note">
              * Il certificato e valido 3 anni. Dopo l'acquisto riceverai un link per la procedura di identificazione.
              Una volta completata, riceverai via email un PDF con le credenziali (password via SMS).
            </p>
          </div>
        )}

        {certificates.length > 0 && (
          <Grid data={certificates} style={{ maxHeight: 200 }}>
            <GridColumn field="certificateOwner.owner" title="Titolare" width={180}
              cell={(props) => <td>{props.dataItem.certificateOwner?.owner || '-'}</td>} />
            <GridColumn field="certificateType" title="Tipo" width={140} />
            <GridColumn field="state" title="Stato" width={80} />
            <GridColumn field="createdAt" title="Creato" width={100}
              cell={(props) => <td>{props.dataItem.createdAt?.split(' ')[0] || '-'}</td>} />
            <GridColumn field="expireAt" title="Scadenza" width={100}
              cell={(props) => <td>{props.dataItem.expireAt?.split(' ')[0] || '-'}</td>} />
          </Grid>
        )}
      </section>

      {/* Storico Firme */}
      <section className="admin-section">
        <h3>Storico Firme</h3>
        <div className="action-buttons">
          <Button svgIcon={arrowRotateCwIcon} onClick={handleGetSignatures}>
            Carica Storico Firme
          </Button>
        </div>
        {signatures.length > 0 && (
          <Grid data={signatures} style={{ maxHeight: 200 }}>
            <GridColumn field="documentName" title="Documento" width={200} />
            <GridColumn field="signedBy" title="Firmato Da" width={150} />
            <GridColumn field="signedAt" title="Data" width={120} />
            <GridColumn field="status" title="Stato" width={80} />
            <GridColumn
              title="Azioni"
              width={80}
              cell={(props) => (
                <td>
                  <Button
                    svgIcon={trashIcon}
                    fillMode="flat"
                    size="small"
                    onClick={() => handleDeleteSignature(props.dataItem.id)}
                    title="Elimina"
                  />
                </td>
              )}
            />
          </Grid>
        )}
      </section>

      {/* Verifica Documenti */}
      <section className="admin-section">
        <h3>Verifica Documento Firmato</h3>
        <div className="action-buttons">
          <Button svgIcon={eyeIcon} onClick={handleVerifyDocument}>
            Seleziona e Verifica Documento
          </Button>
        </div>
        {verifyResult && (
          <div className="verify-result">
            <pre>{JSON.stringify(verifyResult, null, 2)}</pre>
          </div>
        )}
      </section>

      {/* Test Firma */}
      <section className="admin-section">
        <h3>Test Firma</h3>
        <div className="test-sign-grid">
          <div className="test-sign-row">
            <Input
              value={testSignForm.otp}
              onChange={(e) => setTestSignForm({ ...testSignForm, otp: e.value || '' })}
              placeholder="Inserisci OTP"
              style={{ width: 150 }}
            />
            <Button onClick={handleTestSignOtp} themeColor="primary">
              Test Firma OTP
            </Button>
          </div>
          <div className="test-sign-row">
            <Button onClick={handleTestSignAutomatic}>
              Test Firma Automatica
            </Button>
            <Button onClick={handleTestEseal}>
              Test E-Seal
            </Button>
            <Button onClick={handleTestSes}>
              Test Firma Semplice (SES)
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// PLACEHOLDER TABS FOR OTHER PROVIDERS
// ============================================================================

const ArubaTab: React.FC = () => (
  <div className="provider-tab-placeholder">
    <h3>Aruba ARSS</h3>
    <p>Configurazione Aruba Remote Sign Service - Coming soon</p>
  </div>
);

const InfoCertTab: React.FC = () => (
  <div className="provider-tab-placeholder">
    <h3>InfoCert GoSign</h3>
    <p>Configurazione InfoCert GoSign - Coming soon</p>
  </div>
);

// ============================================================================
// NAMIRIAL TAB COMPONENT - Configurazione credenziali utente
// ============================================================================

const NamirialTab: React.FC = () => {
  const dispatch = useDispatch();

  // Ottieni dati utente loggato dallo store Redux
  const {
    userName,
    token,
    signatureType: currentSignatureType,
    remoteSignUsername: currentUsername,
    remoteSignProvider: currentProvider,
    hasRemoteSignPassword: currentHasPassword,
    hasRemoteSignPin: currentHasPin
  } = useSelector((state: RootState) => state.auth);

  // State locale per il form
  // Namirial SWS richiede: username (codice dispositivo RHI), password (=PIN), OTP
  const [formData, setFormData] = useState({
    username: currentUsername || '',
    pin: '',           // In SWS "password" = PIN del dispositivo
    confirmPin: '',
    signatureType: currentSignatureType || 'otp'
  });

  // State per configurazione endpoint (SaaS vs On-Premises)
  const [endpointInfo, setEndpointInfo] = useState<{
    isOnPremise: boolean;
    baseUrl: string;
    hasSaaS: boolean;
    hasOnPremise: boolean;
  } | null>(null);
  const [savingEndpoint, setSavingEndpoint] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  // Aggiorna form quando cambiano i valori dallo store
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      username: currentUsername || '',
      signatureType: currentSignatureType || 'otp'
    }));
  }, [currentUsername, currentSignatureType]);

  // Carica informazioni endpoint Namirial
  useEffect(() => {
    loadEndpointInfo();
  }, []);

  const loadEndpointInfo = async () => {
    try {
      const result = await (window as any).remoteSign?.getNamirialEndpointInfo();
      console.log('[NamirialTab] Endpoint info:', result);
      if (result?.success) {
        setEndpointInfo({
          isOnPremise: result.isOnPremise || false,
          baseUrl: result.baseUrl || '',
          hasSaaS: result.hasSaaS || false,
          hasOnPremise: result.hasOnPremise || false
        });
      }
    } catch (e) {
      console.error('[NamirialTab] Errore caricamento endpoint info:', e);
    }
  };

  /**
   * Gestisce il cambio endpoint (SaaS <-> On-Premises) e salva la configurazione
   */
  const handleEndpointChange = async (useOnPremise: boolean) => {
    setSavingEndpoint(true);
    try {
      // 1. Cambia endpoint nel provider (runtime)
      const switchResult = await (window as any).remoteSign?.switchNamirialEndpoint({ useOnPremise });
      if (!switchResult?.success) {
        throw new Error(switchResult?.error || 'Errore cambio endpoint');
      }

      // 2. Salva la configurazione nel file sign-settings.json
      const saveResult = await (window as any).remoteSign?.saveNamirialEndpointConfig({ useOnPremise });
      if (!saveResult?.success) {
        console.warn('[NamirialTab] Attenzione: endpoint cambiato ma configurazione non salvata:', saveResult?.error);
      }

      // 3. Aggiorna lo stato locale
      setEndpointInfo({
        isOnPremise: switchResult.isOnPremise || false,
        baseUrl: switchResult.baseUrl || '',
        hasSaaS: switchResult.hasSaaS || false,
        hasOnPremise: switchResult.hasOnPremise || false
      });

      showSuccessMsg(`Endpoint cambiato a: ${useOnPremise ? 'On-Premises' : 'SaaS Cloud'}`);
    } catch (e: any) {
      console.error('[NamirialTab] Errore cambio endpoint:', e);
      showErrorMsg(e.message || 'Errore cambio endpoint');
    } finally {
      setSavingEndpoint(false);
    }
  };

  const showErrorMsg = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  };

  const showSuccessMsg = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  /**
   * Salva le credenziali Namirial nel database
   * Namirial SWS richiede: username (codice dispositivo RHI), password=PIN
   */
  const handleSaveCredentials = async () => {
    // Validazione
    if (!formData.username || formData.username.trim().length < 3) {
      showErrorMsg('Inserire un codice dispositivo valido (almeno 3 caratteri)');
      return;
    }

    // Se sta inserendo un nuovo PIN, verifica che corrispondano
    if (formData.pin && formData.pin !== formData.confirmPin) {
      showErrorMsg('I PIN non corrispondono');
      return;
    }

    // Se firma automatica, PIN obbligatorio (se non gia salvato)
    if (formData.signatureType === 'automatic') {
      if (!formData.pin && !currentHasPin) {
        showErrorMsg('Per la firma automatica e obbligatorio inserire il PIN');
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const apiUrl = `${getApiBaseUrl()}Account/manage/signature-preferences`;

      const requestBody: any = {
        userName: userName,
        signatureType: formData.signatureType,
        remoteSignUsername: formData.username.trim(),
        remoteSignProvider: 'NAMIRIAL'
      };

      // Per Namirial SWS, il PIN è la "password" - lo salviamo in entrambi i campi per compatibilità
      if (formData.pin) {
        requestBody.remoteSignPin = formData.pin;
        requestBody.remoteSignPassword = formData.pin;  // SWS usa "password" = PIN
      }

      console.log('[NamirialTab] Saving credentials to:', apiUrl);
      console.log('[NamirialTab] Request body:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Errore salvataggio: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('[NamirialTab] Save result:', result);
      console.log('[NamirialTab] signatureType inviato:', formData.signatureType);
      console.log('[NamirialTab] signatureType restituito:', result.signatureType);

      // Aggiorna lo store Redux
      // Normalizza signatureType a lowercase per compatibilità con il backend C#
      const savedSignatureType = (result.signatureType?.toLowerCase() || formData.signatureType) as 'otp' | 'automatic';
      console.log('[NamirialTab] signatureType normalizzato:', savedSignatureType);

      dispatch(setSignatureType(savedSignatureType));
      dispatch(setRemoteSignUsername(formData.username.trim()));
      dispatch(setRemoteSignProvider('NAMIRIAL'));
      dispatch(setHasRemoteSignPassword(result.hasPassword === true));
      dispatch(setHasRemoteSignPin(result.hasPin === true));

      // Pulisci campo PIN
      setFormData(prev => ({ ...prev, pin: '', confirmPin: '' }));

      showSuccessMsg('Credenziali Namirial salvate con successo!');

    } catch (e: any) {
      console.error('[NamirialTab] Save error:', e);
      showErrorMsg(e.message || 'Errore durante il salvataggio');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Testa la connessione con le credenziali salvate
   */
  const handleTestConnection = async () => {
    if (!currentUsername || !currentHasPin) {
      showErrorMsg('Prima salva le credenziali (codice dispositivo e PIN), poi testa la connessione');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Prima recupera le credenziali salvate dal backend
      console.log('[NamirialTab] Recupero credenziali dal backend...');
      const storedCreds = await (window as any).remoteSign?.getStoredCredentials({
        token: token,
        apiBaseUrl: getApiBaseUrl()
      });

      if (!storedCreds?.success) {
        throw new Error('Impossibile recuperare le credenziali salvate');
      }

      if (!storedCreds.pin) {
        throw new Error('Credenziali incomplete: manca il PIN');
      }

      console.log('[NamirialTab] Credenziali recuperate, test autenticazione...');

      // 2. Chiama endpoint per testare autenticazione Namirial (firma automatica senza OTP)
      const result = await (window as any).remoteSign?.authenticate({
        providerId: 'NAMIRIAL',
        username: currentUsername,
        pin: storedCreds.pin,            // PIN = password per SWS
        otp: '',
        sessionMinutes: 3,
        isAutomatic: true
      });

      if (result?.success) {
        showSuccessMsg(`Connessione riuscita! Firmato da: ${result.signedBy}`);
        // Chiudi subito la sessione di test
        await (window as any).remoteSign?.closeSession({ providerId: 'NAMIRIAL' });
      } else {
        showErrorMsg(result?.error || 'Test connessione fallito');
      }
    } catch (e: any) {
      console.error('[NamirialTab] Test error:', e);
      showErrorMsg(e.message || 'Errore test connessione');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Elimina le credenziali salvate
   */
  const handleClearCredentials = async () => {
    if (!window.confirm('Sei sicuro di voler eliminare le credenziali salvate?')) {
      return;
    }

    setLoading(true);
    try {
      const apiUrl = `${getApiBaseUrl()}Account/manage/signature-preferences`;

      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userName: userName,
          signatureType: 'otp',
          remoteSignUsername: null,
          remoteSignPassword: null,
          remoteSignPin: null,
          remoteSignProvider: null
        })
      });

      if (!response.ok) {
        throw new Error('Errore durante la cancellazione');
      }

      // Aggiorna lo store Redux
      dispatch(setSignatureType(null));
      dispatch(setRemoteSignUsername(null));
      dispatch(setRemoteSignProvider(null));
      dispatch(setHasRemoteSignPassword(false));
      dispatch(setHasRemoteSignPin(false));

      // Pulisci form
      setFormData({
        username: '',
        pin: '',
        confirmPin: '',
        signatureType: 'otp'
      });

      showSuccessMsg('Credenziali eliminate');
    } catch (e: any) {
      showErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const signatureTypeOptions = [
    { value: 'otp', label: 'Con OTP (richiede codice ad ogni firma)' },
    { value: 'automatic', label: 'Automatica (senza OTP - firma massiva)' }
  ];

  return (
    <div className="namirial-tab">
      {/* Notifications */}
      <NotificationGroup style={{ position: 'fixed', top: 70, right: 20, zIndex: 10001 }}>
        {error && (
          <Notification type={{ style: 'error', icon: true }} closable onClose={() => setError(null)}>
            {error}
          </Notification>
        )}
        {success && (
          <Notification type={{ style: 'success', icon: true }} closable onClose={() => setSuccess(null)}>
            {success}
          </Notification>
        )}
      </NotificationGroup>

      {/* Loading overlay */}
      {loading && (
        <div className="loading-overlay">
          <Loader size="large" type="infinite-spinner" />
        </div>
      )}

      {/* Info utente */}
      <section className="config-section">
        <h3><SvgIcon icon={gearIcon} /> Credenziali Namirial per: {userName}</h3>
        <p className="config-info">
          Configura le tue credenziali Namirial per la firma digitale remota.
          Le credenziali sono personali e salvate in modo sicuro (password criptata).
        </p>
      </section>

      {/* Stato attuale */}
      {currentProvider === 'NAMIRIAL' && currentUsername && (
        <section className="status-section">
          <div className="status-badge status-configured">
            <SvgIcon icon={checkIcon} />
            <span>Configurato: {currentUsername}</span>
            <span className="status-type">
              ({currentSignatureType === 'automatic' ? 'Firma Automatica' : 'Con OTP'})
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
            PIN/Password: {currentHasPin ? '✓ Salvato' : '✗ Non configurato'}
          </div>
        </section>
      )}

      {/* Configurazione Endpoint (SaaS vs On-Premises) */}
      {endpointInfo && (endpointInfo.hasSaaS || endpointInfo.hasOnPremise) && (
        <section className="config-section endpoint-config-section">
          <h4>Endpoint Server SWS</h4>
          <p className="config-info" style={{ marginBottom: 12 }}>
            Seleziona il server Namirial SWS da utilizzare per la firma remota.
          </p>

          <div className="endpoint-toggle-container">
            <div className="endpoint-options">
              {endpointInfo.hasSaaS && (
                <label className={`endpoint-option ${!endpointInfo.isOnPremise ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="namirial-endpoint"
                    checked={!endpointInfo.isOnPremise}
                    onChange={() => handleEndpointChange(false)}
                    disabled={savingEndpoint || loading}
                  />
                  <div className="endpoint-option-content">
                    <strong>SaaS Cloud</strong>
                    <small>Server Namirial in cloud (richiede certificato mTLS)</small>
                  </div>
                </label>
              )}

              {endpointInfo.hasOnPremise && (
                <label className={`endpoint-option ${endpointInfo.isOnPremise ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="namirial-endpoint"
                    checked={endpointInfo.isOnPremise}
                    onChange={() => handleEndpointChange(true)}
                    disabled={savingEndpoint || loading}
                  />
                  <div className="endpoint-option-content">
                    <strong>On-Premises</strong>
                    <small>Server locale/privato (connessione diretta)</small>
                  </div>
                </label>
              )}
            </div>

            {savingEndpoint && (
              <div style={{ marginTop: 8 }}>
                <Loader size="small" type="infinite-spinner" />
                <span style={{ marginLeft: 8, fontSize: 12 }}>Salvataggio...</span>
              </div>
            )}

            <div className="endpoint-current-url" style={{ marginTop: 12, fontSize: 11, color: '#666' }}>
              URL attivo: <code style={{ backgroundColor: '#f5f5f5', padding: '2px 6px', borderRadius: 3 }}>
                {endpointInfo.baseUrl}
              </code>
            </div>
          </div>
        </section>
      )}

      {/* Form Credenziali */}
      <section className="config-section">
        <h4>Configurazione Credenziali</h4>
        <div className="namirial-form-grid">
          <div className="form-field">
            <label>Codice Dispositivo (RHI...) *</label>
            <Input
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.value || '' })}
              placeholder="Es: RHIP26011648243800"
              disabled={loading}
            />
            <small>Il codice RHI del tuo certificato Namirial (ricevuto via email)</small>
          </div>

          <div className="form-field">
            <label>Tipo di Firma *</label>
            <DropDownList
              data={signatureTypeOptions}
              textField="label"
              dataItemKey="value"
              value={signatureTypeOptions.find(t => t.value === formData.signatureType)}
              onChange={(e) => setFormData({ ...formData, signatureType: e.value?.value || 'otp' })}
              disabled={loading}
            />
            <small>
              {formData.signatureType === 'automatic'
                ? 'La firma automatica non richiede OTP ma necessita PIN salvato'
                : 'Verra richiesto un codice OTP per ogni sessione di firma'}
            </small>
          </div>

          <div className="form-field">
            <label>
              PIN / Password {formData.signatureType === 'automatic' && !currentHasPin ? '*' : '(opzionale)'}
            </label>
            <div className="password-input-wrapper">
              <Input
                type={showPin ? 'text' : 'password'}
                value={formData.pin}
                onChange={(e) => setFormData({ ...formData, pin: e.value || '' })}
                placeholder={currentHasPin ? '(PIN gia salvato)' : 'Inserisci PIN'}
                disabled={loading}
              />
              <Button
                fillMode="flat"
                svgIcon={eyeIcon}
                onClick={() => setShowPin(!showPin)}
                title={showPin ? 'Nascondi' : 'Mostra'}
              />
            </div>
            <small>
              {currentHasPin
                ? 'Lascia vuoto per mantenere il PIN esistente'
                : 'La password del dispositivo RHI (ricevuta via email)'}
            </small>
          </div>

          {formData.pin && (
            <div className="form-field">
              <label>Conferma PIN *</label>
              <Input
                type={showPin ? 'text' : 'password'}
                value={formData.confirmPin}
                onChange={(e) => setFormData({ ...formData, confirmPin: e.value || '' })}
                placeholder="Ripeti PIN"
                disabled={loading}
              />
            </div>
          )}
        </div>

        {/* Azioni */}
        <div className="form-actions">
          <Button
            themeColor="primary"
            svgIcon={checkIcon}
            onClick={handleSaveCredentials}
            disabled={loading || !formData.username}
          >
            Salva Credenziali
          </Button>

          {currentHasPin && (
            <Button
              onClick={handleTestConnection}
              disabled={loading}
            >
              Testa Connessione
            </Button>
          )}

          {currentUsername && (
            <Button
              svgIcon={trashIcon}
              onClick={handleClearCredentials}
              disabled={loading}
              fillMode="outline"
            >
              Elimina Credenziali
            </Button>
          )}
        </div>
      </section>

      {/* Informazioni */}
      <section className="info-section">
        <h4>Informazioni sulle Credenziali Namirial SWS</h4>
        <ul>
          <li><strong>Codice Dispositivo:</strong> Il codice RHI del tuo certificato (es. RHIP26011648243800), ricevuto via email.</li>
          <li><strong>PIN/Password:</strong> La password del dispositivo RHI, ricevuta via email al momento dell'attivazione.</li>
          <li><strong>OTP:</strong> Codice temporaneo generato dall'app Namirial Sign o ricevuto via SMS.</li>
          <li><strong>Firma con OTP:</strong> Ogni sessione richiede OTP. La sessione dura massimo 3 minuti.</li>
          <li><strong>Firma Automatica:</strong> Il PIN viene salvato criptato. Non richiede OTP (solo per certificati AHI).</li>
          <li><strong>Sicurezza:</strong> Tutte le credenziali sono criptate con AES-256 e non vengono mai trasmesse in chiaro.</li>
        </ul>
      </section>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const SignProvidersConfigModal: React.FC<SignProvidersConfigModalProps> = ({
  isOpen,
  onClose
}) => {
  const [selectedTab, setSelectedTab] = useState(0);

  const handleTabSelect = (e: TabStripSelectEventArguments) => {
    setSelectedTab(e.selected);
  };

  if (!isOpen) return null;

  return (
    <Dialog
      title="Configurazione Provider Firma Remota"
      onClose={onClose}
      width={950}
      height={700}
      className="sign-providers-config-modal"
    >
      <TabStrip selected={selectedTab} onSelect={handleTabSelect}>
        <TabStripTab title="OpenAPI">
          <OpenApiTab />
        </TabStripTab>
        <TabStripTab title="Aruba">
          <ArubaTab />
        </TabStripTab>
        <TabStripTab title="InfoCert">
          <InfoCertTab />
        </TabStripTab>
        <TabStripTab title="Namirial">
          <NamirialTab />
        </TabStripTab>
      </TabStrip>

      <DialogActionsBar>
        <Button onClick={onClose}>Chiudi</Button>
      </DialogActionsBar>
    </Dialog>
  );
};

export default SignProvidersConfigModal;
