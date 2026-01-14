/**
 * OpenApiRemoteSignProvider.ts
 * Provider per firma remota tramite OpenAPI.com (esignature API)
 *
 * OpenAPI.com e' un marketplace API che fornisce accesso unificato
 * a servizi di firma elettronica qualificata (QES) con OTP.
 *
 * Autenticazione API:
 * - Metodo 1: API Key diretta (apiKey) -> usata come Bearer token
 * - Metodo 2: Token generato dalla console (token) -> usato come Bearer token
 * - Metodo 3: OAuth2 (clientId + clientSecret) -> genera access token
 *
 * Credenziali Certificato per Firma:
 * - certificateUsername: username del certificato (es. RHI_123456)
 * - certificatePassword: password del certificato
 * - certificateOtp: OTP dall'app Namirial Sign (solo per EU-QES_otp)
 *
 * SANDBOX TEST CREDENTIALS:
 * - certificateUsername: openapiSandboxUsername
 * - certificatePassword: openapiSandboxPassword
 * - certificateOtp: qualsiasi valore (sandbox)
 *
 * Documentazione: https://console.openapi.com/apis/esignature/documentation
 * Specifiche OAS: https://console.openapi.com/oas/en/esignature.openapi.json
 */

import log from 'electron-log';
import {
  IRemoteSignProvider,
  RemoteSignCredentials,
  RemoteSignSession,
  SignDocumentRequest,
  SignDocumentResponse,
  OpenApiProviderConfig,
  CertificateInfo,
  SessionStatus,
  BatchSignResult
} from '../IRemoteSignProvider';

/**
 * Risposta autenticazione OpenAPI OAuth
 */
interface OpenApiOAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

/**
 * Risposta firma OpenAPI
 */
interface OpenApiSignResponse {
  id: string;
  state: 'WAIT_VALIDATION' | 'WAIT_SIGN' | 'DONE' | 'ERROR';
  certificateType: string;
  signatureType: string;
  document: {
    inputDocuments: Array<{
      name: string;
      mimeType: string;
    }>;
    validatedDocument?: {
      name: string;
      payload: string; // base64
    };
    signedDocument?: {
      name: string;
      payload: string; // base64
      mimeType: string;
    };
  };
  success: boolean;
  message: string;
}

/**
 * Configurazione estesa per OpenAPI.com
 * Supporta sia API Key che OAuth2
 */
export interface OpenApiExtendedConfig extends OpenApiProviderConfig {
  /** API Key o Token generato dalla console (usato direttamente come Bearer) */
  apiKey?: string;
  /** Token pre-generato dalla console */
  token?: string;
}

/**
 * Provider per OpenAPI.com eSignature API
 */
export class OpenApiRemoteSignProvider implements IRemoteSignProvider {
  readonly providerId = 'OPENAPI';
  readonly providerName = 'OpenAPI.com';
  readonly supportsBatchSigning = true;
  readonly supportsExtendedSession = true;

  private config: OpenApiExtendedConfig;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(config: OpenApiExtendedConfig) {
    this.config = config;
    log.info('[OpenAPI] Provider inizializzato');
    log.info('[OpenAPI] Metodo auth:', this.getAuthMethod());
  }

  /**
   * Determina il metodo di autenticazione disponibile
   */
  private getAuthMethod(): string {
    if (this.config.token) return 'TOKEN';
    if (this.config.apiKey) return 'API_KEY';
    if (this.config.clientId && this.config.clientSecret) return 'OAUTH2';
    return 'NONE';
  }

  /**
   * Ottiene il token di autenticazione.
   * Supporta 3 metodi:
   * 1. Token pre-configurato
   * 2. API Key usata come Bearer
   * 3. OAuth2 client_credentials
   */
  private async getAccessToken(): Promise<string> {
    const authMethod = this.getAuthMethod();

    // Metodo 1: Token pre-configurato
    if (this.config.token) {
      log.debug('[OpenAPI] Usando token pre-configurato');
      return this.config.token;
    }

    // Metodo 2: API Key diretta
    if (this.config.apiKey) {
      log.debug('[OpenAPI] Usando API Key come Bearer token');
      return this.config.apiKey;
    }

    // Metodo 3: OAuth2 - genera access token
    if (this.config.clientId && this.config.clientSecret) {
      // Se abbiamo un token valido, riutilizzalo
      if (this.accessToken && this.tokenExpiresAt && new Date() < this.tokenExpiresAt) {
        return this.accessToken;
      }

      log.info('[OpenAPI] Richiesta nuovo access token OAuth2');

      const oauthUrl = this.config.oauthUrl || 'https://console.openapi.com/oauth/token';

      const response = await fetch(oauthUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          scope: 'POST:esignature/EU-QES_otp POST:esignature/EU-SES POST:esignature/verify'
        }).toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error('[OpenAPI] Errore OAuth:', response.status, errorText);
        throw new Error(`OAuth authentication failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as OpenApiOAuthResponse;
      this.accessToken = data.access_token;
      this.tokenExpiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);

      log.info('[OpenAPI] Access token ottenuto, scade tra', data.expires_in, 'secondi');
      return this.accessToken;
    }

    throw new Error('Nessun metodo di autenticazione configurato per OpenAPI');
  }

  /**
   * Autentica l'utente e crea una sessione di firma.
   * Per OpenAPI, le credenziali sono:
   * - username = certificateUsername (es. RHI_123456)
   * - pin = certificatePassword
   * - otp = codice OTP da app Namirial Sign
   */
  async authenticate(
    credentials: RemoteSignCredentials,
    sessionDurationMinutes?: number
  ): Promise<RemoteSignSession> {
    log.info('[OpenAPI] Autenticazione utente:', credentials.username);

    try {
      // Verifica che possiamo ottenere un token
      const token = await this.getAccessToken();
      log.info('[OpenAPI] Token di accesso valido');

      // Per OpenAPI, non c'e' un endpoint di "login" separato.
      // La validazione delle credenziali avviene al momento della firma.
      // Creiamo una sessione locale che memorizza le credenziali.

      const sessionId = `openapi_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      const duration = sessionDurationMinutes || 45;
      const expiresAt = new Date(Date.now() + duration * 60 * 1000);

      const session: RemoteSignSession = {
        sessionId,
        providerId: this.providerId,
        expiresAt,
        userId: credentials.username,
        certificate: {
          cn: credentials.username,
          serialNumber: 'N/A',
          issuer: 'OpenAPI.com / Namirial'
        },
        // Memorizziamo le credenziali nella sessione
        metadata: {
          certificateUsername: credentials.username,
          certificatePassword: credentials.pin,
          certificateOtp: credentials.otp,
          authMethod: this.getAuthMethod()
        }
      };

      log.info('[OpenAPI] Sessione creata:', sessionId, '- durata:', duration, 'min');
      return session;

    } catch (error: any) {
      log.error('[OpenAPI] Errore autenticazione:', error);
      throw new Error(`Autenticazione OpenAPI fallita: ${error.message}`);
    }
  }

  /**
   * Valida se la sessione e' ancora attiva
   */
  async validateSession(session: RemoteSignSession): Promise<boolean> {
    // Verifica scadenza temporale
    if (new Date() > session.expiresAt) {
      log.warn('[OpenAPI] Sessione scaduta');
      return false;
    }

    // Verifica che le credenziali siano presenti
    if (!session.metadata?.certificateUsername || !session.metadata?.certificatePassword) {
      log.warn('[OpenAPI] Credenziali sessione mancanti');
      return false;
    }

    return true;
  }

  /**
   * Rinnova la sessione (per OpenAPI richiede nuovo OTP)
   */
  async refreshSession(session: RemoteSignSession): Promise<RemoteSignSession> {
    throw new Error('OpenAPI richiede un nuovo OTP per rinnovare la sessione');
  }

  /**
   * Chiude la sessione
   */
  async closeSession(session: RemoteSignSession): Promise<void> {
    log.info('[OpenAPI] Chiusura sessione:', session.sessionId);
    // Per OpenAPI non c'e' un endpoint di logout
  }

  /**
   * Ottiene lo stato della sessione
   */
  getSessionStatus(session: RemoteSignSession): SessionStatus {
    const now = new Date();
    const active = now < session.expiresAt;
    const remainingMs = session.expiresAt.getTime() - now.getTime();
    const remainingMinutes = Math.max(0, Math.floor(remainingMs / 60000));

    return {
      active,
      expiresAt: session.expiresAt,
      remainingMinutes,
      signedBy: session.certificate?.cn
    };
  }

  /**
   * Firma un documento
   */
  async signDocument(
    session: RemoteSignSession,
    request: SignDocumentRequest
  ): Promise<SignDocumentResponse> {
    log.info('[OpenAPI] Firma documento:', request.documentId);

    try {
      const accessToken = await this.getAccessToken();

      // Usa sandbox se configurato
      const baseUrl = this.config.baseUrl || 'https://esignature.openapi.com';
      log.info('[OpenAPI] Base URL:', baseUrl);

      // Determina il tipo di firma
      let signatureType = 'cades';
      if (request.signatureFormat === 'PAdES') {
        signatureType = 'pades';
      } else if (request.signatureFormat === 'XAdES') {
        signatureType = 'xades';
      }

      // Determina l'endpoint in base al tipo di certificato/firma
      const certificateType = this.config.certificateType || 'EU-SES';
      let endpoint = '/EU-SES'; // Default: firma elettronica semplice
      if (certificateType === 'EU-QES_otp') {
        endpoint = '/EU-QES_otp';
      } else if (certificateType === 'EU-QES_automatic') {
        endpoint = '/EU-QES_automatic';
      }

      // Prepara il body della richiesta
      const requestBody: any = {
        title: `Firma referto ${request.documentId}`,
        description: request.documentDescription || request.documentName || 'Referto medico',
        certificateUsername: session.metadata?.certificateUsername,
        certificatePassword: session.metadata?.certificatePassword,
        signatureType,
        options: {
          asyncDocumentsValidation: false,
          level: 'B', // Baseline level
          hashAlgorithm: 'SHA256'
        }
      };

      // Aggiungi OTP se richiesto (per EU-QES_otp)
      if (certificateType === 'EU-QES_otp' && session.metadata?.certificateOtp) {
        requestBody.certificateOtp = session.metadata.certificateOtp;
      }

      // Aggiungi il documento (hash o payload base64)
      if (request.documentHash) {
        requestBody.inputDocuments = [{
          name: request.documentName || `document_${request.documentId}.pdf`,
          hash: request.documentHash,
          hashAlgorithm: 'SHA256'
        }];
      } else if (request.documentPayload) {
        requestBody.inputDocuments = [{
          name: request.documentName || `document_${request.documentId}.pdf`,
          payload: request.documentPayload,
          mimeType: 'application/pdf'
        }];
      } else {
        throw new Error('Documento o hash richiesto per la firma');
      }

      log.info('[OpenAPI] Invio richiesta firma a:', baseUrl + endpoint);
      log.debug('[OpenAPI] Request body (senza credenziali):', {
        ...requestBody,
        certificatePassword: '***',
        certificateOtp: '***'
      });

      // Chiama API di firma
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      log.debug('[OpenAPI] Response status:', response.status);
      log.debug('[OpenAPI] Response body:', responseText.substring(0, 500));

      if (!response.ok) {
        let errorMessage = `Errore firma: ${response.status}`;
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {}
        log.error('[OpenAPI] Errore firma:', response.status, responseText);
        throw new Error(errorMessage);
      }

      const result: OpenApiSignResponse = JSON.parse(responseText);

      if (!result.success || result.state === 'ERROR') {
        throw new Error(result.message || 'Firma fallita');
      }

      log.info('[OpenAPI] Firma completata:', result.id, '- stato:', result.state);

      return {
        signature: result.document?.signedDocument?.payload || '',
        signedBy: session.userId,
        signatureTimestamp: new Date().toISOString(),
        documentId: request.documentId
      };

    } catch (error: any) {
      log.error('[OpenAPI] Errore durante firma:', error);
      throw error;
    }
  }

  /**
   * Firma multipli documenti in batch
   */
  async signMultipleDocuments(
    session: RemoteSignSession,
    requests: SignDocumentRequest[],
    onProgress?: (completed: number, total: number, current?: string) => void
  ): Promise<BatchSignResult[]> {
    log.info('[OpenAPI] Firma batch di', requests.length, 'documenti');

    const results: BatchSignResult[] = [];

    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];

      if (onProgress) {
        onProgress(i, requests.length, request.documentDescription || request.documentId);
      }

      try {
        const response = await this.signDocument(session, request);
        results.push({
          documentId: request.documentId || `doc_${i}`,
          success: true,
          response
        });
      } catch (error: any) {
        log.error('[OpenAPI] Errore firma documento', request.documentId, ':', error);
        results.push({
          documentId: request.documentId || `doc_${i}`,
          success: false,
          error: error.message
        });
      }
    }

    if (onProgress) {
      onProgress(requests.length, requests.length);
    }

    return results;
  }

  /**
   * Recupera informazioni sul certificato
   */
  async getCertificateInfo(session: RemoteSignSession): Promise<CertificateInfo> {
    return session.certificate || {
      cn: session.userId,
      serialNumber: 'N/A',
      issuer: 'OpenAPI.com / Namirial'
    };
  }

  /**
   * Verifica se il provider e' configurato
   */
  isConfigured(): boolean {
    const hasAuth = !!(this.config.token || this.config.apiKey ||
      (this.config.clientId && this.config.clientSecret));
    const hasUrl = !!this.config.baseUrl;
    return hasAuth && hasUrl;
  }

  /**
   * Testa la connettivita' con il servizio
   */
  async testConnection(): Promise<boolean> {
    try {
      const token = await this.getAccessToken();
      log.info('[OpenAPI] Test connessione OK - token ottenuto');
      return true;
    } catch (error: any) {
      log.error('[OpenAPI] Test connessione fallito:', error);
      return false;
    }
  }
}
