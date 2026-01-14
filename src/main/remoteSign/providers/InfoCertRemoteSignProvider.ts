/**
 * InfoCertRemoteSignProvider.ts
 * Implementazione del provider di firma remota per InfoCert GoSign
 *
 * Documentazione API InfoCert: https://developers.infocert.digital
 * Standard: OAuth2 + CSC API
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
  InfoCertProviderConfig,
  RemoteSignError
} from '../IRemoteSignProvider';
import log from 'electron-log';

/**
 * Risposta token OAuth2 InfoCert
 */
interface InfoCertTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/**
 * Risposta firma InfoCert
 */
interface InfoCertSignResponse {
  signedData: string;
  signingTime: string;
}

/**
 * Risposta certificato InfoCert
 */
interface InfoCertCertificateResponse {
  certificate: {
    subjectDN: string;
    serialNumber: string;
    issuerDN: string;
    notBefore: string;
    notAfter: string;
  };
}

/**
 * Provider per firma remota InfoCert GoSign.
 */
export class InfoCertRemoteSignProvider implements IRemoteSignProvider {
  readonly providerId = 'INFOCERT';
  readonly providerName = 'InfoCert GoSign';
  readonly supportsBatchSigning = true;
  readonly supportsExtendedSession = true;

  private config: InfoCertProviderConfig;
  private httpClient: AxiosInstance;

  constructor(config: InfoCertProviderConfig) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Interceptor per logging
    this.httpClient.interceptors.request.use(
      (request) => {
        log.debug(`[InfoCert] ${request.method?.toUpperCase()} ${request.url}`);
        return request;
      },
      (error) => {
        log.error('[InfoCert] Request error:', error);
        return Promise.reject(error);
      }
    );

    this.httpClient.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        log.error(`[InfoCert] Response error: ${error.response?.status} ${error.message}`);
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
    log.info(`[InfoCert] Autenticazione utente: ${credentials.username}`);

    try {
      // Step 1: OAuth2 token con OTP
      const tokenResponse = await this.httpClient.post<InfoCertTokenResponse>(
        '/oauth/token',
        new URLSearchParams({
          grant_type: 'password',
          client_id: this.config.clientId || '',
          client_secret: this.config.clientSecret || '',
          username: credentials.username,
          password: credentials.pin,
          otp: credentials.otp || '',
          scope: this.config.scope || 'sign'
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      // Recupera info certificato
      let certificate: CertificateInfo | undefined;
      try {
        certificate = await this.fetchCertificateInfo(access_token);
      } catch (e) {
        log.warn('[InfoCert] Impossibile recuperare info certificato:', e);
      }

      const session: RemoteSignSession = {
        sessionId: access_token,
        providerId: this.providerId,
        userId: credentials.username,
        expiresAt: new Date(Date.now() + expires_in * 1000),
        certificate,
        accessToken: access_token,
        refreshToken: refresh_token
      };

      log.info(`[InfoCert] Sessione creata, scade in ${expires_in}s`);

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
      // Verifica token con chiamata leggera
      await this.httpClient.get('/api/v1/user/info', {
        headers: { 'Authorization': `Bearer ${session.accessToken}` }
      });
      return true;
    } catch {
      return false;
    }
  }

  async refreshSession(session: RemoteSignSession): Promise<RemoteSignSession> {
    if (!session.refreshToken) {
      throw new RemoteSignError(
        'Refresh token non disponibile',
        'NO_REFRESH_TOKEN',
        this.providerId,
        false
      );
    }

    log.info('[InfoCert] Rinnovo sessione');

    try {
      const tokenResponse = await this.httpClient.post<InfoCertTokenResponse>(
        '/oauth/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.config.clientId || '',
          client_secret: this.config.clientSecret || '',
          refresh_token: session.refreshToken || ''
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      return {
        ...session,
        sessionId: access_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
        accessToken: access_token,
        refreshToken: refresh_token || session.refreshToken
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
    log.info('[InfoCert] Chiusura sessione');

    try {
      await this.httpClient.post('/oauth/revoke', {
        token: session.accessToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret
      });
    } catch (error) {
      log.warn('[InfoCert] Errore chiusura sessione (ignorato):', error);
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
    log.info(`[InfoCert] Firma documento: ${request.documentId || 'unknown'}`);

    try {
      const response = await this.httpClient.post<InfoCertSignResponse>(
        '/api/v1/signature/signHash',
        {
          hash: request.documentHash,
          hashAlgorithm: request.hashAlgorithm || 'SHA-256',
          signatureFormat: request.signatureFormat
        },
        {
          headers: {
            'Authorization': `Bearer ${session.accessToken}`
          }
        }
      );

      return {
        signature: response.data.signedData,
        signedBy: session.certificate?.cn || 'InfoCert GoSign',
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
    log.info(`[InfoCert] Firma batch di ${requests.length} documenti`);

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
        log.error(`[InfoCert] Errore firma documento ${request.documentId}:`, error);
        results.push({
          documentId: request.documentId || `doc_${i}`,
          success: false,
          error: error.message || 'Errore sconosciuto'
        });

        if (error.code === 'SESSION_EXPIRED' || error.code === 'INVALID_TOKEN') {
          break;
        }
      }
    }

    if (onProgress) {
      onProgress(requests.length, requests.length);
    }

    const successCount = results.filter(r => r.success).length;
    log.info(`[InfoCert] Firma batch completata: ${successCount}/${requests.length} successi`);

    return results;
  }

  // ===========================================================================
  // CERTIFICATO
  // ===========================================================================

  async getCertificateInfo(session: RemoteSignSession): Promise<CertificateInfo> {
    if (session.certificate) {
      return session.certificate;
    }

    return this.fetchCertificateInfo(session.accessToken!);
  }

  private async fetchCertificateInfo(accessToken: string): Promise<CertificateInfo> {
    try {
      const response = await this.httpClient.get<InfoCertCertificateResponse>(
        '/api/v1/certificate/info',
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      const certData = response.data.certificate;
      const cn = this.extractCNFromDN(certData.subjectDN);

      return {
        cn,
        serialNumber: certData.serialNumber,
        issuer: certData.issuerDN,
        validTo: new Date(certData.notAfter)
      };
    } catch (error) {
      log.error('[InfoCert] Errore recupero info certificato:', error);
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
    return Boolean(
      this.config.baseUrl &&
      this.config.clientId &&
      this.config.clientSecret
    );
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.httpClient.get('/health', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // HELPER PRIVATI
  // ===========================================================================

  private extractCNFromDN(subjectDN: string): string {
    const cnMatch = subjectDN.match(/CN=([^,]+)/i);
    return cnMatch ? cnMatch[1] : subjectDN;
  }

  private mapError(error: AxiosError): RemoteSignError {
    const status = error.response?.status;
    const data = error.response?.data as any;

    let code = 'UNKNOWN_ERROR';
    let message = error.message;
    let isRetryable = false;

    if (status === 401) {
      code = 'INVALID_TOKEN';
      message = 'Token non valido o scaduto';
    } else if (status === 403) {
      code = 'FORBIDDEN';
      message = 'Accesso negato';
    } else if (status === 400) {
      code = data?.error || 'BAD_REQUEST';
      message = data?.error_description || 'Richiesta non valida';
    } else if (status === 429) {
      code = 'RATE_LIMITED';
      message = 'Troppe richieste. Riprovare tra poco.';
      isRetryable = true;
    } else if (status && status >= 500) {
      code = 'SERVER_ERROR';
      message = 'Errore del server InfoCert. Riprovare.';
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

    if (data?.error === 'invalid_grant') {
      return new RemoteSignError(
        'Credenziali non valide o OTP errato',
        'INVALID_CREDENTIALS',
        this.providerId,
        false
      );
    }
    if (data?.error === 'invalid_otp') {
      return new RemoteSignError(
        'OTP non valido o scaduto',
        'INVALID_OTP',
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

    if (data?.error === 'token_expired') {
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
