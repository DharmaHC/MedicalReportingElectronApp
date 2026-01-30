/**
 * LAZIOcreaRemoteSignProvider.ts
 * Implementazione del provider di firma remota per LAZIOcrea FirmaWeb API.
 *
 * LAZIOcrea FirmaWeb è un wrapper REST sopra Namirial SWS, con autenticazione OAuth2.
 * Documentazione: API Integrazione Firma Remota LAZIOcrea
 *
 * Endpoint:
 * - Collaudo: https://gwapi.laziocrea.it/firmaweb
 * - Produzione: https://gwapi.servicelazio.it/firmaweb
 *
 * OAuth2 Discovery:
 * - https://qiam.regione.lazio.it/oauth2/oidcdiscovery/.well-known/openid-configuration
 *
 * La sessione dura 3 minuti (come Namirial SWS).
 */

import {
  IRemoteSignProvider,
  RemoteSignCredentials,
  RemoteSignSession,
  SessionStatus,
  SignDocumentRequest,
  SignDocumentResponse,
  BatchSignResult,
  CertificateInfo,
  ProviderConfig,
  RemoteSignError
} from '../IRemoteSignProvider';
import log from 'electron-log';
import { net } from 'electron';

/**
 * Configurazione specifica LAZIOcrea
 */
export interface LAZIOcreaProviderConfig extends ProviderConfig {
  /** Client ID per OAuth2 */
  clientId: string;
  /** Client Secret per OAuth2 */
  clientSecret: string;
  /** URL OAuth2 (default: https://qiam.regione.lazio.it/oauth2/token) */
  oauthUrl?: string;
  /** Scope OAuth2 (default: openid) */
  scope?: string;
  /** Ambiente: 'collaudo' | 'produzione' */
  environment?: 'collaudo' | 'produzione';
}

/**
 * Token OAuth2
 */
interface OAuth2Token {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  /** Timestamp di quando il token è stato ottenuto */
  obtainedAt: number;
}

/**
 * Risposta API LAZIOcrea
 */
interface LAZIOcreaResponse<T = any> {
  esito: 'OK' | 'KO';
  codiceErrore?: string;
  descrizioneErrore?: string;
  data?: T;
}

/**
 * Risposta sessione
 */
interface SessionResponse {
  sessionId: string;
  expiresIn: number;  // secondi
}

/**
 * Risposta certificato
 */
interface CertificateResponse {
  cn: string;
  serialNumber: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  fiscalCode?: string;
}

/**
 * Risposta firma
 */
interface SignResponse {
  signedDocument: string;  // base64
  signatureTimestamp: string;
}

/**
 * Provider per firma remota LAZIOcrea FirmaWeb.
 * Usa REST + OAuth2 per comunicare con il server.
 *
 * Transcodifica credenziali Namirial → LAZIOcrea:
 * - dispositivo (RHIP...) → username
 * - pin → password
 * - ID-Otp → dispositivo
 * - Codice OTP → otp
 */
export class LAZIOcreaRemoteSignProvider implements IRemoteSignProvider {
  readonly providerId = 'LAZIOCREA';
  readonly providerName = 'LAZIOcrea FirmaWeb';
  readonly supportsBatchSigning = true;
  readonly supportsExtendedSession = false;  // Sessione dura solo 3 minuti

  private config: LAZIOcreaProviderConfig;
  private baseUrl: string;
  private oauthUrl: string;
  private oauthToken: OAuth2Token | null = null;

  constructor(config: LAZIOcreaProviderConfig) {
    this.config = config;

    // Determina baseUrl in base all'ambiente
    if (config.baseUrl) {
      this.baseUrl = config.baseUrl.endsWith('/')
        ? config.baseUrl.slice(0, -1)
        : config.baseUrl;
    } else if (config.environment === 'produzione') {
      this.baseUrl = 'https://gwapi.servicelazio.it/firmaweb';
    } else {
      this.baseUrl = 'https://gwapi.laziocrea.it/firmaweb';
    }

    // OAuth URL
    this.oauthUrl = config.oauthUrl || 'https://qiam.regione.lazio.it/oauth2/token';

    log.info(`[LAZIOcrea] Provider inizializzato`);
    log.info(`[LAZIOcrea] Base URL: ${this.baseUrl}`);
    log.info(`[LAZIOcrea] OAuth URL: ${this.oauthUrl}`);
    log.info(`[LAZIOcrea] Client ID: ${config.clientId ? config.clientId.substring(0, 8) + '...' : 'non configurato'}`);
  }

  // ===========================================================================
  // OAUTH2 AUTHENTICATION
  // ===========================================================================

  /**
   * Ottiene un token OAuth2 usando Client Credentials
   */
  private async getOAuthToken(): Promise<string> {
    // Verifica se abbiamo già un token valido
    if (this.oauthToken) {
      const now = Date.now();
      const expiresAt = this.oauthToken.obtainedAt + (this.oauthToken.expires_in * 1000) - 60000; // 1 min margine
      if (now < expiresAt) {
        log.debug('[LAZIOcrea] Usando token OAuth2 esistente');
        return this.oauthToken.access_token;
      }
    }

    log.info('[LAZIOcrea] Richiesta nuovo token OAuth2...');

    if (!this.config.clientId || !this.config.clientSecret) {
      throw new RemoteSignError(
        'Client ID e Client Secret OAuth2 non configurati',
        'OAUTH_NOT_CONFIGURED',
        this.providerId,
        false
      );
    }

    try {
      const body = new URLSearchParams();
      body.append('grant_type', 'client_credentials');
      body.append('client_id', this.config.clientId);
      body.append('client_secret', this.config.clientSecret);
      body.append('scope', this.config.scope || 'openid');

      const response = await this.httpRequest('POST', this.oauthUrl, body.toString(), {
        'Content-Type': 'application/x-www-form-urlencoded'
      });

      if (!response.access_token) {
        throw new Error('Token non ricevuto');
      }

      this.oauthToken = {
        ...response,
        obtainedAt: Date.now()
      };

      log.info(`[LAZIOcrea] Token OAuth2 ottenuto, scade in ${response.expires_in}s`);
      return response.access_token;
    } catch (error: any) {
      log.error('[LAZIOcrea] Errore OAuth2:', error.message);
      throw new RemoteSignError(
        `Errore autenticazione OAuth2: ${error.message}`,
        'OAUTH_ERROR',
        this.providerId,
        true
      );
    }
  }

  // ===========================================================================
  // HTTP REQUEST HELPER
  // ===========================================================================

  /**
   * Esegue una richiesta HTTP
   */
  private async httpRequest(
    method: string,
    url: string,
    body?: string | object,
    headers?: Record<string, string>
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestUrl = new URL(url);

      const options: Electron.ClientRequestConstructorOptions = {
        method: method,
        protocol: requestUrl.protocol as 'http:' | 'https:',
        hostname: requestUrl.hostname,
        port: requestUrl.port ? parseInt(requestUrl.port) : (requestUrl.protocol === 'https:' ? 443 : 80),
        path: requestUrl.pathname + requestUrl.search
      };

      log.debug(`[LAZIOcrea] ${method} ${url}`);

      const request = net.request(options);

      // Headers
      const defaultHeaders: Record<string, string> = {
        'Accept': 'application/json'
      };

      if (body && typeof body === 'object') {
        defaultHeaders['Content-Type'] = 'application/json';
      }

      const allHeaders = { ...defaultHeaders, ...headers };
      for (const [key, value] of Object.entries(allHeaders)) {
        request.setHeader(key, value);
      }

      let responseData = '';

      request.on('response', (response) => {
        response.on('data', (chunk) => {
          responseData += chunk.toString();
        });

        response.on('end', () => {
          log.debug(`[LAZIOcrea] Response status: ${response.statusCode}`);

          try {
            const jsonResponse = responseData ? JSON.parse(responseData) : {};

            if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
              resolve(jsonResponse);
            } else {
              const errorMsg = jsonResponse.descrizioneErrore ||
                               jsonResponse.error_description ||
                               jsonResponse.message ||
                               `HTTP ${response.statusCode}`;
              reject(new Error(errorMsg));
            }
          } catch (parseError) {
            if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
              resolve(responseData);
            } else {
              reject(new Error(`HTTP ${response.statusCode}: ${responseData}`));
            }
          }
        });
      });

      request.on('error', (error) => {
        log.error(`[LAZIOcrea] Request error: ${error.message}`);
        reject(error);
      });

      // Body
      if (body) {
        const bodyString = typeof body === 'object' ? JSON.stringify(body) : body;
        request.write(bodyString);
      }

      request.end();
    });
  }

  /**
   * Esegue una richiesta API LAZIOcrea (con OAuth2)
   */
  private async apiRequest<T>(
    method: string,
    endpoint: string,
    body?: object
  ): Promise<LAZIOcreaResponse<T>> {
    const token = await this.getOAuthToken();
    const url = `${this.baseUrl}${endpoint}`;

    const response = await this.httpRequest(method, url, body, {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    // Verifica esito
    if (response.esito === 'KO') {
      throw new RemoteSignError(
        response.descrizioneErrore || 'Errore API LAZIOcrea',
        response.codiceErrore || 'API_ERROR',
        this.providerId,
        false
      );
    }

    return response;
  }

  // ===========================================================================
  // AUTENTICAZIONE
  // ===========================================================================

  async authenticate(
    credentials: RemoteSignCredentials,
    sessionDurationMinutes: number = 3
  ): Promise<RemoteSignSession> {
    log.info(`[LAZIOcrea] Autenticazione utente: ${credentials.username}`);

    /**
     * Transcodifica credenziali secondo documentazione LAZIOcrea:
     * - username → codice dispositivo Namirial (es. RHIP...)
     * - password → PIN del certificato
     * - dispositivo → ID-OTP (per app TOTP, es. TOTP001...)
     * - otp → codice OTP 6 cifre
     */
    const sessionRequest = {
      username: credentials.username,      // Codice dispositivo (RHIP...)
      password: credentials.pin,           // PIN certificato
      dispositivo: credentials.domain,     // ID-OTP (opzionale, per alcuni tipi di OTP)
      otp: credentials.otp                 // Codice OTP 6 cifre
    };

    log.info(`[LAZIOcrea] Credenziali: username=${credentials.username}, hasPassword=${!!sessionRequest.password}, hasOtp=${!!sessionRequest.otp}`);

    try {
      // Prima verifica che l'API sia raggiungibile ottenendo il token OAuth2
      await this.getOAuthToken();

      // Crea sessione
      log.info('[LAZIOcrea] Chiamata POST /session...');
      const response = await this.apiRequest<SessionResponse>('POST', '/session', sessionRequest);

      const sessionData = response.data;
      if (!sessionData?.sessionId) {
        throw new RemoteSignError(
          'SessionId non ricevuto da LAZIOcrea',
          'NO_SESSION_ID',
          this.providerId,
          false
        );
      }

      log.info(`[LAZIOcrea] Sessione creata: ${sessionData.sessionId}`);

      // La sessione LAZIOcrea dura 3 minuti (180 secondi)
      const expiresInSeconds = sessionData.expiresIn || 180;
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

      // Recupera info certificato
      let certificateInfo: CertificateInfo | undefined;
      try {
        certificateInfo = await this.fetchCertificateInfo(sessionData.sessionId);
      } catch (certError) {
        log.warn('[LAZIOcrea] Impossibile recuperare info certificato:', certError);
        certificateInfo = {
          cn: credentials.username,
          serialNumber: 'N/A',
          issuer: 'Namirial S.p.A. (via LAZIOcrea)'
        };
      }

      const session: RemoteSignSession = {
        sessionId: sessionData.sessionId,
        providerId: this.providerId,
        userId: credentials.username,
        expiresAt,
        certificate: certificateInfo,
        accessToken: sessionData.sessionId,
        metadata: {
          credentials: {
            username: credentials.username,
            pin: credentials.pin
          }
        }
      };

      log.info(`[LAZIOcrea] Sessione attiva fino a: ${expiresAt.toISOString()}`);
      if (certificateInfo) {
        log.info(`[LAZIOcrea] Certificato: ${certificateInfo.cn}`);
      }

      return session;
    } catch (error: any) {
      log.error('[LAZIOcrea] Errore autenticazione:', error.message);
      throw this.handleAuthError(error);
    }
  }

  /**
   * Recupera le informazioni del certificato
   */
  private async fetchCertificateInfo(sessionId: string): Promise<CertificateInfo> {
    log.info('[LAZIOcrea] Recupero info certificato...');

    const response = await this.apiRequest<CertificateResponse>('GET', `/certificate?sessionId=${sessionId}`);

    const certData = response.data;
    if (!certData) {
      throw new Error('Dati certificato non ricevuti');
    }

    return {
      cn: certData.cn,
      serialNumber: certData.serialNumber,
      issuer: certData.issuer,
      validTo: certData.validTo ? new Date(certData.validTo) : undefined,
      fiscalCode: certData.fiscalCode
    };
  }

  async validateSession(session: RemoteSignSession): Promise<boolean> {
    const now = new Date();
    if (now >= session.expiresAt) {
      log.info('[LAZIOcrea] Sessione scaduta localmente');
      return false;
    }

    // Per LAZIOcrea verifichiamo solo la scadenza locale
    // Non c'è un endpoint esplicito per verificare la sessione
    return true;
  }

  async refreshSession(session: RemoteSignSession): Promise<RemoteSignSession> {
    log.info('[LAZIOcrea] Tentativo rinnovo sessione...');

    // LAZIOcrea non supporta refresh - bisogna riaprire la sessione
    // E richiede sempre OTP
    throw new RemoteSignError(
      'Impossibile rinnovare sessione LAZIOcrea: richiede nuovo OTP',
      'REFRESH_REQUIRES_OTP',
      this.providerId,
      false
    );
  }

  async closeSession(session: RemoteSignSession): Promise<void> {
    log.info('[LAZIOcrea] Chiusura sessione');

    try {
      await this.apiRequest('DELETE', `/session/close?sessionId=${session.sessionId}`);
      log.info('[LAZIOcrea] Sessione chiusa con successo');
    } catch (error) {
      log.warn('[LAZIOcrea] Errore chiusura sessione (ignorato):', error);
    }
  }

  getSessionStatus(session: RemoteSignSession): SessionStatus {
    const now = new Date();
    const remainingMs = session.expiresAt.getTime() - now.getTime();

    return {
      active: remainingMs > 0,
      expiresAt: session.expiresAt,
      remainingMinutes: Math.max(0, Math.floor(remainingMs / 60000)),
      signedBy: session.certificate?.cn
    };
  }

  // ===========================================================================
  // FIRMA DOCUMENTI
  // ===========================================================================

  async signDocument(
    session: RemoteSignSession,
    request: SignDocumentRequest
  ): Promise<SignDocumentResponse> {
    log.info(`[LAZIOcrea] Firma documento: ${request.documentId || 'unknown'}`);

    // Verifica sessione ancora valida
    const status = this.getSessionStatus(session);
    if (!status.active) {
      throw new RemoteSignError(
        'Sessione scaduta. Richiede nuovo OTP.',
        'SESSION_EXPIRED',
        this.providerId,
        false
      );
    }

    try {
      // Determina endpoint in base al formato
      const signatureFormat = (request.signatureFormat || 'PAdES').toLowerCase();
      let endpoint: string;

      switch (signatureFormat) {
        case 'pades':
          endpoint = '/sign/pades';
          break;
        case 'cades':
          endpoint = '/sign/cades';
          break;
        case 'xades':
          endpoint = '/sign/xades';
          break;
        default:
          endpoint = '/sign/pades';
      }

      // Prepara richiesta firma
      const signRequest: any = {
        sessionId: session.sessionId
      };

      if (request.documentPayload) {
        // Documento completo (per PAdES)
        signRequest.document = request.documentPayload;  // base64
      } else if (request.documentHash) {
        // Solo hash (per CAdES/firma hash)
        signRequest.hash = request.documentHash;
        signRequest.hashAlgorithm = request.hashAlgorithm || 'SHA-256';
      } else {
        throw new RemoteSignError(
          'Documento o hash richiesto per la firma',
          'MISSING_DOCUMENT',
          this.providerId,
          false
        );
      }

      log.info(`[LAZIOcrea] Chiamata POST ${endpoint}...`);
      const response = await this.apiRequest<SignResponse>('POST', endpoint, signRequest);

      const signData = response.data;
      if (!signData?.signedDocument) {
        throw new RemoteSignError(
          'Documento firmato non ricevuto',
          'NO_SIGNED_DOCUMENT',
          this.providerId,
          false
        );
      }

      log.info('[LAZIOcrea] Documento firmato con successo');

      return {
        signature: signData.signedDocument,
        signedBy: session.certificate?.cn || session.userId,
        signatureTimestamp: signData.signatureTimestamp || new Date().toISOString(),
        documentId: request.documentId
      };
    } catch (error: any) {
      log.error('[LAZIOcrea] Errore firma:', error.message);
      throw this.handleSignError(error, request.documentId);
    }
  }

  async signMultipleDocuments(
    session: RemoteSignSession,
    requests: SignDocumentRequest[],
    onProgress?: (completed: number, total: number, current?: string) => void
  ): Promise<BatchSignResult[]> {
    log.info(`[LAZIOcrea] Firma batch di ${requests.length} documenti`);

    // Verifica sessione ancora valida
    const status = this.getSessionStatus(session);
    if (!status.active) {
      throw new RemoteSignError(
        'Sessione scaduta. Richiede nuovo OTP.',
        'SESSION_EXPIRED',
        this.providerId,
        false
      );
    }

    // LAZIOcrea supporta firma multipla nativa tramite /sign/pades/multiple
    // Ma per maggiore controllo e progress, firmiamo uno alla volta
    const results: BatchSignResult[] = [];

    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];

      if (onProgress) {
        onProgress(i, requests.length, request.documentDescription);
      }

      try {
        const response = await this.signDocument(session, request);
        results.push({
          documentId: request.documentId || `doc_${i}`,
          success: true,
          response
        });
      } catch (error: any) {
        log.error(`[LAZIOcrea] Errore firma documento ${request.documentId}:`, error.message);
        results.push({
          documentId: request.documentId || `doc_${i}`,
          success: false,
          error: error.message || 'Errore sconosciuto'
        });

        // Se sessione scaduta, interrompi
        if (error.code === 'SESSION_EXPIRED') {
          log.warn('[LAZIOcrea] Sessione scaduta, interruzione batch');
          break;
        }
      }
    }

    if (onProgress) {
      onProgress(requests.length, requests.length);
    }

    const successCount = results.filter(r => r.success).length;
    log.info(`[LAZIOcrea] Firma batch completata: ${successCount}/${requests.length} successi`);

    return results;
  }

  // ===========================================================================
  // CERTIFICATO
  // ===========================================================================

  async getCertificateInfo(session: RemoteSignSession): Promise<CertificateInfo> {
    if (session.certificate) {
      return session.certificate;
    }

    return this.fetchCertificateInfo(session.sessionId);
  }

  // ===========================================================================
  // UTILITY
  // ===========================================================================

  isConfigured(): boolean {
    return Boolean(
      this.config.clientId &&
      this.config.clientSecret &&
      this.baseUrl
    );
  }

  async testConnection(): Promise<boolean> {
    try {
      // Prova a ottenere un token OAuth2
      await this.getOAuthToken();
      log.info('[LAZIOcrea] Test connessione OK');
      return true;
    } catch (error: any) {
      log.error('[LAZIOcrea] Test connessione fallito:', error.message);
      return false;
    }
  }

  /**
   * Richiede invio OTP via SMS (se configurato)
   */
  async requestOtp(username: string, dispositivo: string): Promise<void> {
    log.info(`[LAZIOcrea] Richiesta invio OTP per ${username}`);

    try {
      await this.apiRequest('POST', '/otp', {
        username,
        dispositivo
      });
      log.info('[LAZIOcrea] OTP inviato con successo');
    } catch (error: any) {
      log.error('[LAZIOcrea] Errore richiesta OTP:', error.message);
      throw new RemoteSignError(
        `Errore richiesta OTP: ${error.message}`,
        'OTP_REQUEST_ERROR',
        this.providerId,
        false
      );
    }
  }

  // ===========================================================================
  // HELPER PRIVATI
  // ===========================================================================

  private handleAuthError(error: any): RemoteSignError {
    if (error instanceof RemoteSignError) {
      return error;
    }

    const message = error.message || 'Errore autenticazione';
    let errorCode = 'AUTH_ERROR';

    // Errori di rete
    if (message.includes('ENOTFOUND') || message.includes('ECONNREFUSED')) {
      return new RemoteSignError(
        'Impossibile connettersi al server LAZIOcrea. Verificare la connessione.',
        'NETWORK_ERROR',
        this.providerId,
        true
      );
    }

    if (message.includes('ETIMEDOUT')) {
      return new RemoteSignError(
        'Timeout connessione al server LAZIOcrea.',
        'TIMEOUT_ERROR',
        this.providerId,
        true
      );
    }

    // Errori OAuth2
    if (message.includes('invalid_client') || message.includes('unauthorized_client')) {
      return new RemoteSignError(
        'Client ID o Client Secret OAuth2 non validi.',
        'OAUTH_INVALID_CLIENT',
        this.providerId,
        false
      );
    }

    // Errori credenziali firma
    if (message.toLowerCase().includes('credenziali') ||
        message.toLowerCase().includes('invalid') ||
        message.toLowerCase().includes('wrong')) {
      return new RemoteSignError(
        'Credenziali non valide. Verificare codice dispositivo, PIN e OTP.',
        'INVALID_CREDENTIALS',
        this.providerId,
        false
      );
    }

    // Dispositivo non trovato
    if (message.includes('1001') ||
        message.toLowerCase().includes('non esistente') ||
        message.toLowerCase().includes('dispositivo')) {
      return new RemoteSignError(
        'Dispositivo non trovato. Verificare che il codice dispositivo (RHI) sia corretto.',
        'DEVICE_NOT_FOUND',
        this.providerId,
        false
      );
    }

    // OTP non valido
    if (message.toLowerCase().includes('otp')) {
      return new RemoteSignError(
        'OTP non valido o scaduto. Generare un nuovo codice OTP.',
        'INVALID_OTP',
        this.providerId,
        false
      );
    }

    return new RemoteSignError(
      message,
      errorCode,
      this.providerId,
      false
    );
  }

  private handleSignError(error: any, documentId?: string): RemoteSignError {
    if (error instanceof RemoteSignError) {
      return error;
    }

    const message = error.message || 'Errore firma';

    if (message.toLowerCase().includes('session') || message.toLowerCase().includes('expired')) {
      return new RemoteSignError(
        'Sessione scaduta',
        'SESSION_EXPIRED',
        this.providerId,
        false
      );
    }

    return new RemoteSignError(
      message,
      'SIGN_ERROR',
      this.providerId,
      false
    );
  }
}
