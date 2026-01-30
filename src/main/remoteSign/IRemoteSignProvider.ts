/**
 * IRemoteSignProvider.ts
 * Interfaccia comune per tutti i provider di firma remota (Aruba, InfoCert, Namirial)
 */

// ============================================================================
// CREDENTIALS & AUTHENTICATION
// ============================================================================

/**
 * Credenziali per l'autenticazione al servizio di firma remota
 */
export interface RemoteSignCredentials {
  /** Username o User ID del titolare del certificato */
  username: string;
  /** Password di accesso al certificato (Namirial la richiede separata dal PIN) */
  password?: string;
  /** PIN del certificato di firma (per alcuni provider coincide con la password) */
  pin: string;
  /** One Time Password (richiesto solo per la prima autenticazione) */
  otp?: string;
  /** Dominio di autenticazione (opzionale, alcuni provider lo richiedono) */
  domain?: string;
}

/**
 * Informazioni sul certificato di firma
 */
export interface CertificateInfo {
  /** Common Name del certificato (es. "ROSSI MARIO") */
  cn: string;
  /** Numero seriale del certificato */
  serialNumber: string;
  /** Issuer del certificato (es. "Aruba PEC S.p.A.") */
  issuer: string;
  /** Data di scadenza del certificato */
  validTo?: Date;
  /** Codice fiscale del titolare (se presente) */
  fiscalCode?: string;
}

/**
 * Sessione di firma attiva
 */
export interface RemoteSignSession {
  /** ID univoco della sessione */
  sessionId: string;
  /** ID del provider (ARUBA, INFOCERT, NAMIRIAL, OPENAPI) */
  providerId: string;
  /** Data/ora di scadenza della sessione */
  expiresAt: Date;
  /** User ID del titolare */
  userId: string;
  /** Informazioni sul certificato (popolate dopo autenticazione) */
  certificate?: CertificateInfo;
  /** Numero di firme rimanenti nella sessione (se applicabile) */
  remainingSignatures?: number;
  /** Token di accesso (interno, non esporre) */
  accessToken?: string;
  /** Token di refresh (interno, non esporre) */
  refreshToken?: string;
  /** Metadati aggiuntivi specifici del provider */
  metadata?: Record<string, any>;
}

// ============================================================================
// SIGNING OPERATIONS
// ============================================================================

/**
 * Formato della firma digitale
 */
export type SignatureFormat = 'CAdES' | 'PAdES' | 'XAdES';

/**
 * Algoritmo di hash supportato
 */
export type HashAlgorithm = 'SHA-256' | 'SHA-384' | 'SHA-512';

/**
 * Richiesta di firma documento
 */
export interface SignDocumentRequest {
  /** Hash del documento in base64 (calcolato con l'algoritmo specificato) */
  documentHash?: string;
  /** Documento completo in base64 (alternativa all'hash per alcuni provider) */
  documentPayload?: string;
  /** Nome del documento (opzionale) */
  documentName?: string;
  /** Algoritmo usato per calcolare l'hash */
  hashAlgorithm?: HashAlgorithm;
  /** Formato della firma richiesto */
  signatureFormat: SignatureFormat;
  /** ID documento per tracking (opzionale) */
  documentId?: string;
  /** Descrizione documento per log (opzionale) */
  documentDescription?: string;
}

/**
 * Risposta della firma documento
 */
export interface SignDocumentResponse {
  /** Firma in formato base64 (CMS/CAdES per CAdES, embedded per PAdES) */
  signature: string;
  /** CN del certificato che ha firmato */
  signedBy: string;
  /** Timestamp della firma (ISO 8601) */
  signatureTimestamp: string;
  /** Timestamp TSA se disponibile */
  tsaTimestamp?: string;
  /** ID documento (se fornito nella richiesta) */
  documentId?: string;
}

/**
 * Risultato firma batch (per firma multipla)
 */
export interface BatchSignResult {
  /** ID documento */
  documentId: string;
  /** Successo o fallimento */
  success: boolean;
  /** Risposta firma (se successo) */
  response?: SignDocumentResponse;
  /** Messaggio di errore (se fallimento) */
  error?: string;
}

// ============================================================================
// PROVIDER CONFIGURATION
// ============================================================================

/**
 * Configurazione base del provider
 */
export interface ProviderConfig {
  /** URL base del servizio */
  baseUrl: string;
  /** Timeout richieste in millisecondi */
  timeout?: number;
  /** Numero massimo di retry per errori di rete */
  maxRetries?: number;
}

/**
 * Configurazione specifica Aruba
 */
export interface ArubaProviderConfig extends ProviderConfig {
  /** API Key (se richiesta) */
  apiKey?: string;
  /** Tipo di credenziale (es. "firma_remota") */
  credentialType?: string;
}

/**
 * Configurazione specifica InfoCert
 */
export interface InfoCertProviderConfig extends ProviderConfig {
  /** Client ID OAuth2 */
  clientId?: string;
  /** Client Secret OAuth2 */
  clientSecret?: string;
  /** Scope OAuth2 */
  scope?: string;
}

/**
 * Configurazione specifica Namirial SWS
 *
 * SWS supporta due modalità di deployment:
 * - SaaS: richiede mTLS con certificato client (.p12)
 * - On-Premises: connessione diretta HTTP/HTTPS senza mTLS
 *
 * Il certificato per SaaS viene fornito da Namirial in formato .p12 o .jks
 */
export interface NamirialProviderConfig extends ProviderConfig {
  /** API Key (legacy, non usato per SWS SaaS) */
  apiKey?: string;
  /** Organization ID (legacy, non usato per SWS SaaS) */
  organizationId?: string;
  /**
   * Path al certificato client per mTLS (formato .p12 o .pfx)
   * Richiesto per SWS SaaS, non usato per On-Premises
   */
  clientCertPath?: string;
  /** Password del certificato client */
  clientCertPassword?: string;
  /** URL proxy (opzionale) */
  proxyUrl?: string;
  /** Se true, bypassa qualsiasi proxy di sistema */
  noProxy?: boolean;

  // ---- Supporto On-Premises ----

  /**
   * URL base del server SWS On-Premises (es. http://192.168.1.100:8080/SignEngineWeb)
   * Se configurato, permette di scegliere tra SaaS e On-Premises
   */
  onPremiseBaseUrl?: string;
  /**
   * Se true, usa l'endpoint On-Premises invece di SaaS
   * Default: false (usa SaaS)
   */
  useOnPremise?: boolean;
}

/**
 * Configurazione specifica LAZIOcrea FirmaWeb
 * Wrapper REST sopra Namirial SWS con autenticazione OAuth2
 */
export interface LAZIOcreaProviderConfig extends ProviderConfig {
  /** Client ID per OAuth2 (obbligatorio) */
  clientId: string;
  /** Client Secret per OAuth2 (obbligatorio) */
  clientSecret: string;
  /** URL OAuth2 (default: https://qiam.regione.lazio.it/oauth2/token) */
  oauthUrl?: string;
  /** Scope OAuth2 (default: openid) */
  scope?: string;
  /** Ambiente: 'collaudo' | 'produzione' */
  environment?: 'collaudo' | 'produzione';
}

/**
 * Configurazione specifica OpenAPI.com
 * https://console.openapi.com/apis/esignature/documentation
 *
 * Supporta 3 metodi di autenticazione:
 * 1. apiKey - API Key dalla console, usata come Bearer token
 * 2. token - Token pre-generato dalla console
 * 3. clientId + clientSecret - OAuth2 client_credentials
 */
export interface OpenApiProviderConfig extends ProviderConfig {
  /** API Key dalla console OpenAPI (metodo semplice) */
  apiKey?: string;
  /** Token pre-generato dalla console OpenAPI */
  token?: string;
  /** Client ID per OAuth2 (metodo avanzato) */
  clientId?: string;
  /** Client Secret per OAuth2 (metodo avanzato) */
  clientSecret?: string;
  /** URL OAuth (default: https://console.openapi.com/oauth/token) */
  oauthUrl?: string;
  /** Tipo di certificato/firma: EU-QES_otp, EU-QES_automatic, EU-SES */
  certificateType?: 'EU-QES_otp' | 'EU-QES_automatic' | 'EU-SES';
}

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

/**
 * Stato della sessione
 */
export interface SessionStatus {
  /** Sessione attiva o meno */
  active: boolean;
  /** Data/ora di scadenza */
  expiresAt?: Date;
  /** Minuti rimanenti */
  remainingMinutes?: number;
  /** CN del certificato */
  signedBy?: string;
  /** Firme rimanenti nella sessione */
  remainingSignatures?: number;
}

/**
 * Errore specifico del provider
 */
export class RemoteSignError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly providerId: string,
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'RemoteSignError';
  }
}

/**
 * Interfaccia base per tutti i provider di firma remota.
 * Implementa il pattern Strategy per supportare diversi provider.
 */
export interface IRemoteSignProvider {
  // -------------------------------------------------------------------------
  // Proprietà
  // -------------------------------------------------------------------------

  /** ID univoco del provider (es. "ARUBA", "INFOCERT", "NAMIRIAL") */
  readonly providerId: string;

  /** Nome visualizzato del provider */
  readonly providerName: string;

  /** Indica se il provider supporta firma batch nativa */
  readonly supportsBatchSigning: boolean;

  /** Indica se il provider supporta sessioni estese (senza OTP per ogni firma) */
  readonly supportsExtendedSession: boolean;

  // -------------------------------------------------------------------------
  // Autenticazione e Gestione Sessione
  // -------------------------------------------------------------------------

  /**
   * Autentica l'utente e crea una sessione di firma.
   * @param credentials Credenziali (username, PIN, OTP)
   * @param sessionDurationMinutes Durata richiesta della sessione in minuti
   * @returns Sessione attiva
   * @throws RemoteSignError se autenticazione fallisce
   */
  authenticate(
    credentials: RemoteSignCredentials,
    sessionDurationMinutes?: number
  ): Promise<RemoteSignSession>;

  /**
   * Verifica se la sessione è ancora valida.
   * @param session Sessione da verificare
   * @returns true se la sessione è valida
   */
  validateSession(session: RemoteSignSession): Promise<boolean>;

  /**
   * Rinnova una sessione esistente (se supportato dal provider).
   * @param session Sessione da rinnovare
   * @returns Nuova sessione con scadenza estesa
   * @throws RemoteSignError se il rinnovo non è supportato o fallisce
   */
  refreshSession(session: RemoteSignSession): Promise<RemoteSignSession>;

  /**
   * Chiude una sessione attiva.
   * @param session Sessione da chiudere
   */
  closeSession(session: RemoteSignSession): Promise<void>;

  /**
   * Ottiene lo stato corrente della sessione.
   * @param session Sessione da verificare
   * @returns Stato della sessione
   */
  getSessionStatus(session: RemoteSignSession): SessionStatus;

  // -------------------------------------------------------------------------
  // Operazioni di Firma
  // -------------------------------------------------------------------------

  /**
   * Firma un singolo documento.
   * @param session Sessione attiva
   * @param request Richiesta di firma (hash + formato)
   * @returns Risposta con firma
   * @throws RemoteSignError se la firma fallisce
   */
  signDocument(
    session: RemoteSignSession,
    request: SignDocumentRequest
  ): Promise<SignDocumentResponse>;

  /**
   * Firma multipli documenti in batch.
   * Se il provider non supporta batch nativo, esegue firme sequenziali.
   * @param session Sessione attiva
   * @param requests Array di richieste di firma
   * @param onProgress Callback per progresso (opzionale)
   * @returns Array di risultati
   */
  signMultipleDocuments(
    session: RemoteSignSession,
    requests: SignDocumentRequest[],
    onProgress?: (completed: number, total: number, current?: string) => void
  ): Promise<BatchSignResult[]>;

  // -------------------------------------------------------------------------
  // Informazioni Certificato
  // -------------------------------------------------------------------------

  /**
   * Recupera le informazioni del certificato dalla sessione.
   * @param session Sessione attiva
   * @returns Informazioni certificato
   */
  getCertificateInfo(session: RemoteSignSession): Promise<CertificateInfo>;

  // -------------------------------------------------------------------------
  // Utilità
  // -------------------------------------------------------------------------

  /**
   * Verifica se il provider è configurato correttamente.
   * @returns true se la configurazione è valida
   */
  isConfigured(): boolean;

  /**
   * Testa la connettività con il servizio remoto.
   * @returns true se il servizio è raggiungibile
   */
  testConnection(): Promise<boolean>;
}
