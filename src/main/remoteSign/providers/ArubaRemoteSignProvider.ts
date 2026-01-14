/**
 * ArubaRemoteSignProvider.ts
 * Implementazione del provider di firma remota per Aruba ARSS
 * (Aruba Remote Signing Service)
 *
 * Documentazione API Aruba: https://enterprise.aruba.it
 * Standard: CSC API (Cloud Signature Consortium)
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  IRemoteSignProvider,
  RemoteSignCredentials,
  RemoteSignSession,
  SessionStatus,
  SignDocumentRequest,
  SignDocumentResponse,
  BatchSignResult,
  CertificateInfo,
  ArubaProviderConfig,
  RemoteSignError
} from '../IRemoteSignProvider';
import log from 'electron-log';

/**
 * Risposta autenticazione Aruba
 */
interface ArubaAuthResponse {
  SAD: string; // Signature Activation Data
  expiresIn: number; // Secondi
  numSignatures?: number; // Firme disponibili
}

/**
 * Risposta firma Aruba
 */
interface ArubaSignResponse {
  signatures: string[];
  signAlgo: string;
}

/**
 * Risposta info certificato Aruba
 */
interface ArubaCertificateResponse {
  cert: {
    status: string;
    certificates: Array<{
      subjectDN: string;
      serialNumber: string;
      issuerDN: string;
      validFrom: string;
      validTo: string;
    }>;
  };
}

/**
 * Provider per firma remota Aruba ARSS.
 * Implementa l'interfaccia IRemoteSignProvider.
 */
export class ArubaRemoteSignProvider implements IRemoteSignProvider {
  readonly providerId = 'ARUBA';
  readonly providerName = 'Aruba Firma Remota';
  readonly supportsBatchSigning = true;
  readonly supportsExtendedSession = true;

  private config: ArubaProviderConfig;
  private httpClient: AxiosInstance;

  constructor(config: ArubaProviderConfig) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { 'X-API-Key': config.apiKey })
      }
    });

    // Interceptor per logging
    this.httpClient.interceptors.request.use(
      (request) => {
        log.debug(`[Aruba] ${request.method?.toUpperCase()} ${request.url}`);
        return request;
      },
      (error) => {
        log.error('[Aruba] Request error:', error);
        return Promise.reject(error);
      }
    );

    this.httpClient.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        log.error(`[Aruba] Response error: ${error.response?.status} ${error.message}`);
        return Promise.reject(this.mapError(error));
      }
    );
  }

  // ===========================================================================
  // AUTENTICAZIONE
  // ===========================================================================

  async authenticate(
    credentials: RemoteSignCredentials,
    sessionDurationMinutes: number = 45
  ): Promise<RemoteSignSession> {
    log.info(`[Aruba] Autenticazione utente: ${credentials.username}`);

    try {
      // Endpoint CSC: POST /csc/v1/credentials/authorize
      const response = await this.httpClient.post<ArubaAuthResponse>(
        '/csc/v1/credentials/authorize',
        {
          credentialID: credentials.username,
          PIN: credentials.pin,
          OTP: credentials.otp,
          // Richiedi N firme con un solo OTP (sessione estesa)
          numSignatures: 1000, // Massimo firme per sessione
          description: 'MedReport Firma Massiva'
        }
      );

      const { SAD, expiresIn, numSignatures } = response.data;

      // Recupera info certificato
      let certificate: CertificateInfo | undefined;
      try {
        certificate = await this.fetchCertificateInfo(credentials.username, SAD);
      } catch (e) {
        log.warn('[Aruba] Impossibile recuperare info certificato:', e);
      }

      const session: RemoteSignSession = {
        sessionId: SAD,
        providerId: this.providerId,
        userId: credentials.username,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        certificate,
        remainingSignatures: numSignatures,
        accessToken: SAD
      };

      log.info(`[Aruba] Sessione creata, scade in ${expiresIn}s, firme disponibili: ${numSignatures}`);

      return session;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  async validateSession(session: RemoteSignSession): Promise<boolean> {
    // Aruba non ha endpoint esplicito per validazione
    // Verifichiamo solo la scadenza locale
    const now = new Date();
    if (now >= session.expiresAt) {
      return false;
    }

    // Opzionale: tentare una chiamata leggera per verificare il SAD
    try {
      await this.httpClient.post('/csc/v1/credentials/info', {
        credentialID: session.userId
      }, {
        headers: { 'Authorization': `Bearer ${session.accessToken}` }
      });
      return true;
    } catch {
      return false;
    }
  }

  async refreshSession(session: RemoteSignSession): Promise<RemoteSignSession> {
    // Aruba non supporta il refresh del SAD
    // È necessario ri-autenticarsi con un nuovo OTP
    throw new RemoteSignError(
      'Aruba non supporta il rinnovo della sessione. È necessario ri-autenticarsi.',
      'SESSION_REFRESH_NOT_SUPPORTED',
      this.providerId,
      false
    );
  }

  async closeSession(session: RemoteSignSession): Promise<void> {
    log.info(`[Aruba] Chiusura sessione ${session.sessionId.substring(0, 8)}...`);

    try {
      // Endpoint CSC: POST /csc/v1/credentials/revoke (se disponibile)
      await this.httpClient.post('/csc/v1/credentials/revoke', {
        credentialID: session.userId,
        SAD: session.sessionId
      });
    } catch (error) {
      // Ignora errori di chiusura - il SAD scadrà comunque
      log.warn('[Aruba] Errore chiusura sessione (ignorato):', error);
    }
  }

  getSessionStatus(session: RemoteSignSession): SessionStatus {
    const now = new Date();
    const remainingMs = session.expiresAt.getTime() - now.getTime();

    return {
      active: remainingMs > 0,
      expiresAt: session.expiresAt,
      remainingMinutes: Math.max(0, Math.floor(remainingMs / 60000)),
      signedBy: session.certificate?.cn,
      remainingSignatures: session.remainingSignatures
    };
  }

  // ===========================================================================
  // FIRMA DOCUMENTI
  // ===========================================================================

  async signDocument(
    session: RemoteSignSession,
    request: SignDocumentRequest
  ): Promise<SignDocumentResponse> {
    log.info(`[Aruba] Firma documento: ${request.documentId || 'unknown'}`);

    try {
      // Endpoint CSC: POST /csc/v1/signatures/signHash
      const response = await this.httpClient.post<ArubaSignResponse>(
        '/csc/v1/signatures/signHash',
        {
          credentialID: session.userId,
          SAD: session.sessionId,
          hash: [request.documentHash],
          hashAlgo: this.mapHashAlgorithm(request.hashAlgorithm),
          signAlgo: '1.2.840.113549.1.1.11' // SHA256withRSA OID
        }
      );

      if (!response.data.signatures || response.data.signatures.length === 0) {
        throw new RemoteSignError(
          'Nessuna firma restituita dal server',
          'NO_SIGNATURE',
          this.providerId,
          false
        );
      }

      // Aggiorna contatore firme rimanenti
      if (session.remainingSignatures !== undefined) {
        session.remainingSignatures--;
      }

      return {
        signature: response.data.signatures[0],
        signedBy: session.certificate?.cn || 'Aruba Firma Remota',
        signatureTimestamp: new Date().toISOString(),
        documentId: request.documentId
      };
    } catch (error) {
      throw this.handleSignError(error, request.documentId);
    }
  }

  async signMultipleDocuments(
    session: RemoteSignSession,
    requests: SignDocumentRequest[],
    onProgress?: (completed: number, total: number, current?: string) => void
  ): Promise<BatchSignResult[]> {
    log.info(`[Aruba] Firma batch di ${requests.length} documenti`);

    const results: BatchSignResult[] = [];

    // Aruba supporta firma batch nativa (array di hash)
    // Ma per avere controllo granulare sugli errori, firmiamo uno alla volta
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
        log.error(`[Aruba] Errore firma documento ${request.documentId}:`, error);
        results.push({
          documentId: request.documentId || `doc_${i}`,
          success: false,
          error: error.message || 'Errore sconosciuto'
        });

        // Se errore di sessione, interrompi
        if (error.code === 'SESSION_EXPIRED' || error.code === 'INVALID_SAD') {
          break;
        }
      }
    }

    if (onProgress) {
      onProgress(requests.length, requests.length);
    }

    const successCount = results.filter(r => r.success).length;
    log.info(`[Aruba] Firma batch completata: ${successCount}/${requests.length} successi`);

    return results;
  }

  // ===========================================================================
  // CERTIFICATO
  // ===========================================================================

  async getCertificateInfo(session: RemoteSignSession): Promise<CertificateInfo> {
    if (session.certificate) {
      return session.certificate;
    }

    return this.fetchCertificateInfo(session.userId, session.sessionId);
  }

  private async fetchCertificateInfo(
    credentialId: string,
    sad?: string
  ): Promise<CertificateInfo> {
    try {
      const response = await this.httpClient.post<ArubaCertificateResponse>(
        '/csc/v1/credentials/info',
        {
          credentialID: credentialId,
          certificates: 'chain',
          certInfo: true
        },
        sad ? { headers: { 'Authorization': `Bearer ${sad}` } } : {}
      );

      const certData = response.data.cert?.certificates?.[0];
      if (!certData) {
        throw new Error('Nessun certificato trovato');
      }

      // Parse SubjectDN per estrarre CN
      const cn = this.extractCNFromDN(certData.subjectDN);

      return {
        cn,
        serialNumber: certData.serialNumber,
        issuer: certData.issuerDN,
        validTo: new Date(certData.validTo)
      };
    } catch (error) {
      log.error('[Aruba] Errore recupero info certificato:', error);
      throw new RemoteSignError(
        'Impossibile recuperare informazioni certificato',
        'CERTIFICATE_INFO_ERROR',
        this.providerId,
        true
      );
    }
  }

  // ===========================================================================
  // UTILITY
  // ===========================================================================

  isConfigured(): boolean {
    return Boolean(this.config.baseUrl);
  }

  async testConnection(): Promise<boolean> {
    try {
      // Endpoint CSC: GET /csc/v1/info
      await this.httpClient.get('/csc/v1/info', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // HELPER PRIVATI
  // ===========================================================================

  private mapHashAlgorithm(algo?: string): string {
    // OID per algoritmi hash
    const map: Record<string, string> = {
      'SHA-256': '2.16.840.1.101.3.4.2.1',
      'SHA-384': '2.16.840.1.101.3.4.2.2',
      'SHA-512': '2.16.840.1.101.3.4.2.3'
    };
    return map[algo || 'SHA-256'] || map['SHA-256'];
  }

  private extractCNFromDN(subjectDN: string): string {
    // Parse "CN=ROSSI MARIO,..." per estrarre CN
    const cnMatch = subjectDN.match(/CN=([^,]+)/i);
    return cnMatch ? cnMatch[1] : subjectDN;
  }

  private mapError(error: AxiosError): RemoteSignError {
    const status = error.response?.status;
    const data = error.response?.data as any;

    let code = 'UNKNOWN_ERROR';
    let message = error.message;
    let isRetryable = false;

    if (status === 401 || status === 403) {
      code = 'AUTH_FAILED';
      message = 'Autenticazione fallita. Verificare credenziali.';
    } else if (status === 400) {
      code = data?.error || 'BAD_REQUEST';
      message = data?.error_description || 'Richiesta non valida';
    } else if (status === 429) {
      code = 'RATE_LIMITED';
      message = 'Troppe richieste. Riprovare tra poco.';
      isRetryable = true;
    } else if (status === 500 || status === 502 || status === 503) {
      code = 'SERVER_ERROR';
      message = 'Errore del server Aruba. Riprovare.';
      isRetryable = true;
    } else if (!error.response) {
      code = 'NETWORK_ERROR';
      message = 'Errore di rete. Verificare la connessione.';
      isRetryable = true;
    }

    return new RemoteSignError(message, code, this.providerId, isRetryable);
  }

  private handleAuthError(error: any): RemoteSignError {
    if (error instanceof RemoteSignError) {
      return error;
    }

    const data = error.response?.data;

    // Errori specifici Aruba
    if (data?.error === 'invalid_otp') {
      return new RemoteSignError(
        'OTP non valido o scaduto',
        'INVALID_OTP',
        this.providerId,
        false
      );
    }
    if (data?.error === 'invalid_pin') {
      return new RemoteSignError(
        'PIN non corretto',
        'INVALID_PIN',
        this.providerId,
        false
      );
    }
    if (data?.error === 'credential_locked') {
      return new RemoteSignError(
        'Credenziali bloccate per troppi tentativi errati',
        'CREDENTIAL_LOCKED',
        this.providerId,
        false
      );
    }

    return this.mapError(error);
  }

  private handleSignError(error: any, documentId?: string): RemoteSignError {
    if (error instanceof RemoteSignError) {
      return error;
    }

    const data = error.response?.data;

    if (data?.error === 'invalid_sad') {
      return new RemoteSignError(
        'Sessione non valida o scaduta',
        'INVALID_SAD',
        this.providerId,
        false
      );
    }
    if (data?.error === 'no_signatures_left') {
      return new RemoteSignError(
        'Firme disponibili esaurite nella sessione',
        'NO_SIGNATURES_LEFT',
        this.providerId,
        false
      );
    }

    return this.mapError(error);
  }
}
