/**
 * NamirialRemoteSignProvider.ts
 * Implementazione del provider di firma remota per Namirial eSignAnyWhere
 *
 * Documentazione API Namirial: https://www.esignanywhere.net/en/esignature-api/
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
  NamirialProviderConfig,
  RemoteSignError
} from '../IRemoteSignProvider';
import log from 'electron-log';

/**
 * Risposta autenticazione Namirial
 */
interface NamirialAuthResponse {
  sessionId: string;
  expiresAt: string;
  user: {
    userId: string;
    displayName: string;
  };
}

/**
 * Risposta firma Namirial
 */
interface NamirialSignResponse {
  signatureValue: string;
  signingTime: string;
  signatureAlgorithm: string;
}

/**
 * Risposta certificato Namirial
 */
interface NamirialCertificateResponse {
  subject: string;
  serialNumber: string;
  issuer: string;
  validFrom: string;
  validTo: string;
}

/**
 * Provider per firma remota Namirial eSignAnyWhere.
 */
export class NamirialRemoteSignProvider implements IRemoteSignProvider {
  readonly providerId = 'NAMIRIAL';
  readonly providerName = 'Namirial Sign';
  readonly supportsBatchSigning = true;
  readonly supportsExtendedSession = true;

  private config: NamirialProviderConfig;
  private httpClient: AxiosInstance;

  constructor(config: NamirialProviderConfig) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey
      }
    });

    // Interceptor per logging
    this.httpClient.interceptors.request.use(
      (request) => {
        log.debug(`[Namirial] ${request.method?.toUpperCase()} ${request.url}`);
        return request;
      },
      (error) => {
        log.error('[Namirial] Request error:', error);
        return Promise.reject(error);
      }
    );

    this.httpClient.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        log.error(`[Namirial] Response error: ${error.response?.status} ${error.message}`);
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
    log.info(`[Namirial] Autenticazione utente: ${credentials.username}`);

    try {
      const response = await this.httpClient.post<NamirialAuthResponse>(
        '/api/v5/auth/login',
        {
          userId: credentials.username,
          pin: credentials.pin,
          otp: credentials.otp,
          sessionDuration: sessionDurationMinutes * 60, // In secondi
          organizationId: this.config.organizationId
        }
      );

      const { sessionId, expiresAt, user } = response.data;

      // Recupera info certificato
      let certificate: CertificateInfo | undefined;
      try {
        certificate = await this.fetchCertificateInfo(sessionId);
      } catch (e) {
        log.warn('[Namirial] Impossibile recuperare info certificato:', e);
      }

      const session: RemoteSignSession = {
        sessionId,
        providerId: this.providerId,
        userId: credentials.username,
        expiresAt: new Date(expiresAt),
        certificate,
        accessToken: sessionId
      };

      log.info(`[Namirial] Sessione creata, scade: ${expiresAt}`);

      return session;
    } catch (error) {
      throw this.handleAuthError(error);
    }
  }

  async validateSession(session: RemoteSignSession): Promise<boolean> {
    const now = new Date();
    if (now >= session.expiresAt) {
      return false;
    }

    try {
      await this.httpClient.get('/api/v5/session/validate', {
        headers: { 'X-Session-Id': session.sessionId }
      });
      return true;
    } catch {
      return false;
    }
  }

  async refreshSession(session: RemoteSignSession): Promise<RemoteSignSession> {
    log.info('[Namirial] Rinnovo sessione');

    try {
      const response = await this.httpClient.post<NamirialAuthResponse>(
        '/api/v5/session/extend',
        {
          extensionMinutes: 45
        },
        {
          headers: { 'X-Session-Id': session.sessionId }
        }
      );

      return {
        ...session,
        expiresAt: new Date(response.data.expiresAt)
      };
    } catch (error) {
      throw new RemoteSignError(
        'Impossibile rinnovare la sessione',
        'REFRESH_FAILED',
        this.providerId,
        false
      );
    }
  }

  async closeSession(session: RemoteSignSession): Promise<void> {
    log.info('[Namirial] Chiusura sessione');

    try {
      await this.httpClient.post('/api/v5/auth/logout', null, {
        headers: { 'X-Session-Id': session.sessionId }
      });
    } catch (error) {
      log.warn('[Namirial] Errore chiusura sessione (ignorato):', error);
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
    log.info(`[Namirial] Firma documento: ${request.documentId || 'unknown'}`);

    try {
      const response = await this.httpClient.post<NamirialSignResponse>(
        '/api/v5/signature/hash',
        {
          hash: request.documentHash,
          hashAlgorithm: request.hashAlgorithm || 'SHA256',
          signatureType: this.mapSignatureFormat(request.signatureFormat)
        },
        {
          headers: { 'X-Session-Id': session.sessionId }
        }
      );

      return {
        signature: response.data.signatureValue,
        signedBy: session.certificate?.cn || 'Namirial Sign',
        signatureTimestamp: response.data.signingTime || new Date().toISOString(),
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
    log.info(`[Namirial] Firma batch di ${requests.length} documenti`);

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
        log.error(`[Namirial] Errore firma documento ${request.documentId}:`, error);
        results.push({
          documentId: request.documentId || `doc_${i}`,
          success: false,
          error: error.message || 'Errore sconosciuto'
        });

        if (error.code === 'SESSION_EXPIRED' || error.code === 'INVALID_SESSION') {
          break;
        }
      }
    }

    if (onProgress) {
      onProgress(requests.length, requests.length);
    }

    const successCount = results.filter(r => r.success).length;
    log.info(`[Namirial] Firma batch completata: ${successCount}/${requests.length} successi`);

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

  private async fetchCertificateInfo(sessionId: string): Promise<CertificateInfo> {
    try {
      const response = await this.httpClient.get<NamirialCertificateResponse>(
        '/api/v5/certificate/info',
        {
          headers: { 'X-Session-Id': sessionId }
        }
      );

      const certData = response.data;
      const cn = this.extractCNFromSubject(certData.subject);

      return {
        cn,
        serialNumber: certData.serialNumber,
        issuer: certData.issuer,
        validTo: new Date(certData.validTo)
      };
    } catch (error) {
      log.error('[Namirial] Errore recupero info certificato:', error);
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
    return Boolean(this.config.baseUrl && this.config.apiKey);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.httpClient.get('/api/v5/status', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // HELPER PRIVATI
  // ===========================================================================

  private mapSignatureFormat(format: string): string {
    const map: Record<string, string> = {
      'CAdES': 'CADES',
      'PAdES': 'PADES',
      'XAdES': 'XADES'
    };
    return map[format] || 'CADES';
  }

  private extractCNFromSubject(subject: string): string {
    const cnMatch = subject.match(/CN=([^,]+)/i);
    return cnMatch ? cnMatch[1] : subject;
  }

  private mapError(error: AxiosError): RemoteSignError {
    const status = error.response?.status;
    const data = error.response?.data as any;

    let code = 'UNKNOWN_ERROR';
    let message = error.message;
    let isRetryable = false;

    if (status === 401) {
      code = 'INVALID_SESSION';
      message = 'Sessione non valida o scaduta';
    } else if (status === 403) {
      code = 'FORBIDDEN';
      message = 'Accesso negato';
    } else if (status === 400) {
      code = data?.errorCode || 'BAD_REQUEST';
      message = data?.message || 'Richiesta non valida';
    } else if (status === 429) {
      code = 'RATE_LIMITED';
      message = 'Troppe richieste. Riprovare tra poco.';
      isRetryable = true;
    } else if (status && status >= 500) {
      code = 'SERVER_ERROR';
      message = 'Errore del server Namirial. Riprovare.';
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

    if (data?.errorCode === 'INVALID_CREDENTIALS') {
      return new RemoteSignError(
        'Credenziali non valide',
        'INVALID_CREDENTIALS',
        this.providerId,
        false
      );
    }
    if (data?.errorCode === 'INVALID_OTP') {
      return new RemoteSignError(
        'OTP non valido o scaduto',
        'INVALID_OTP',
        this.providerId,
        false
      );
    }
    if (data?.errorCode === 'USER_LOCKED') {
      return new RemoteSignError(
        'Utente bloccato per troppi tentativi errati',
        'USER_LOCKED',
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

    if (data?.errorCode === 'SESSION_EXPIRED') {
      return new RemoteSignError(
        'Sessione scaduta',
        'SESSION_EXPIRED',
        this.providerId,
        false
      );
    }

    return this.mapError(error);
  }
}
