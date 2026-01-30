/**
 * NamirialRemoteSignProvider.ts
 * Implementazione del provider di firma remota per Namirial SWS (Signing Web Services)
 *
 * Namirial SWS usa SOAP, non REST.
 * WSDL: https://sws-companynamesaas.test.namirialtsp.com/SignEngineWeb/sign-services?wsdl
 * Endpoint: https://sws-companynamesaas.test.namirialtsp.com/SignEngineWeb/sign-services
 *
 * SWS SaaS richiede autenticazione mTLS con certificato client (.p12).
 * La sessione SWS dura 3 minuti.
 */

import * as soap from 'soap';
import * as https from 'https';
import * as fs from 'fs';
import { HttpsProxyAgent } from 'https-proxy-agent';
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
 * Credenziali per SWS
 */
interface SwsCredentials {
  username: string;     // Codice dispositivo (es. RHIP...)
  password: string;     // Password/PIN del dispositivo
  idOtp?: string;       // ID richiesta OTP (opzionale, per sendOtpBySMS)
  otp?: string;         // Codice OTP 6 cifre (dall'app o SMS)
  sessionKey?: string;  // Session key (dopo openSession)
}

/**
 * Preferenze firma PAdES
 */
interface PadesPreferences {
  level?: string;  // 'B', 'T', 'LT', 'LTA'
  hashAlgorithm?: string;
  reason?: string;
  location?: string;
}

/**
 * Provider per firma remota Namirial SWS (Signing Web Services).
 * Usa SOAP per comunicare con il server.
 *
 * NOTA: La sessione SWS dura solo 3 minuti.
 */
export class NamirialRemoteSignProvider implements IRemoteSignProvider {
  readonly providerId = 'NAMIRIAL';
  readonly providerName = 'Namirial SWS';
  readonly supportsBatchSigning = true;
  readonly supportsExtendedSession = false;  // Sessione SWS dura solo 3 minuti

  private config: NamirialProviderConfig;
  private soapClient: soap.Client | null = null;
  private wsdlUrl: string;
  private currentCredentials: SwsCredentials | null = null;
  private isOnPremise: boolean;
  private activeBaseUrl: string;

  constructor(config: NamirialProviderConfig) {
    this.config = config;

    // Determina se usare On-Premises o SaaS
    this.isOnPremise = Boolean(config.useOnPremise && config.onPremiseBaseUrl);

    // Seleziona l'URL base appropriato
    let baseUrl: string;
    if (this.isOnPremise) {
      baseUrl = config.onPremiseBaseUrl!;
      log.info(`[Namirial] Modalità ON-PREMISES selezionata`);
    } else {
      baseUrl = config.baseUrl;
      log.info(`[Namirial] Modalità SaaS selezionata`);
    }

    // Normalizza URL
    this.activeBaseUrl = baseUrl.endsWith('/')
      ? baseUrl.slice(0, -1)
      : baseUrl;

    // Path WSDL dalla documentazione ufficiale SWS Integration Guide
    this.wsdlUrl = `${this.activeBaseUrl}/sign-services?wsdl`;

    log.info(`[Namirial] Provider inizializzato con WSDL: ${this.wsdlUrl}`);
    log.info(`[Namirial] On-Premises: ${this.isOnPremise}, mTLS: ${!this.isOnPremise && Boolean(config.clientCertPath)}`);
  }

  /**
   * Rileva il proxy dalle variabili di ambiente o dalla configurazione
   *
   * Configurazione in sign-settings.json:
   * - proxyUrl: URL del proxy (es. "http://10.10.1.81:8080")
   * - noProxy: true per bypassare qualsiasi proxy e connettersi direttamente
   */
  private getProxyUrl(): string | null {
    // Se noProxy è true, forza connessione diretta (bypassa proxy di sistema)
    const noProxyConfig = (this.config as any).noProxy;
    if (noProxyConfig === true) {
      log.info('[Namirial] noProxy=true, connessione diretta (bypassa proxy di sistema)');
      return null;
    }

    // Prima controlla se il proxy è configurato nelle settings
    const configProxy = (this.config as any).proxyUrl;
    if (configProxy && configProxy.trim() !== '') {
      log.info(`[Namirial] Proxy da configurazione: ${configProxy}`);
      return configProxy;
    }

    // Controlla se sws.firmacerta.it è nella lista NO_PROXY
    const noProxy = process.env.NO_PROXY || process.env.no_proxy || '';
    if (noProxy.includes('firmacerta.it') || noProxy.includes('*')) {
      log.info('[Namirial] Host in NO_PROXY ambiente, connessione diretta');
      return null;
    }

    // Controlla variabili ambiente standard per proxy
    const proxyUrl = process.env.HTTPS_PROXY ||
                     process.env.https_proxy ||
                     process.env.HTTP_PROXY ||
                     process.env.http_proxy;

    if (proxyUrl) {
      log.info(`[Namirial] Proxy da ambiente: ${proxyUrl}`);
      return proxyUrl;
    }

    log.info('[Namirial] Nessun proxy configurato, connessione diretta');
    return null;
  }

  /**
   * Crea l'agent HTTPS con supporto mTLS se configurato.
   * NOTA: In modalità On-Premises, mTLS non è usato anche se il certificato è configurato.
   */
  private createHttpsAgent(): https.Agent | null {
    // In modalità On-Premises non usiamo mTLS
    if (this.isOnPremise) {
      log.info('[Namirial] Modalità On-Premises: mTLS disabilitato');
      return null;
    }

    const certPath = this.config.clientCertPath;
    const certPassword = this.config.clientCertPassword;

    if (!certPath) {
      log.info('[Namirial] Nessun certificato client configurato (mTLS disabilitato)');
      return null;
    }

    // Verifica che il file esista
    if (!fs.existsSync(certPath)) {
      log.error(`[Namirial] Certificato client non trovato: ${certPath}`);
      throw new RemoteSignError(
        `Certificato client non trovato: ${certPath}`,
        'CERT_NOT_FOUND',
        this.providerId,
        false
      );
    }

    log.info(`[Namirial] Caricamento certificato client: ${certPath}`);

    try {
      const pfxBuffer = fs.readFileSync(certPath);

      const agent = new https.Agent({
        pfx: pfxBuffer,
        passphrase: certPassword || '',
        rejectUnauthorized: true,  // Verifica certificato server
        keepAlive: true
      });

      log.info('[Namirial] Certificato client caricato con successo (mTLS abilitato)');
      return agent;
    } catch (error: any) {
      log.error('[Namirial] Errore caricamento certificato:', error.message);
      throw new RemoteSignError(
        `Errore caricamento certificato client: ${error.message}`,
        'CERT_LOAD_ERROR',
        this.providerId,
        false
      );
    }
  }

  /**
   * Inizializza il client SOAP (lazy loading)
   */
  private async getClient(): Promise<soap.Client> {
    if (this.soapClient) {
      return this.soapClient;
    }

    log.info(`[Namirial] Connessione a WSDL: ${this.wsdlUrl}`);

    try {
      // Crea agent HTTPS con mTLS se configurato
      const mtlsAgent = this.createHttpsAgent();

      // Configura opzioni SOAP
      const soapOptions: soap.IOptions = {
        wsdl_options: {
          timeout: 30000
        }
      };

      // Determina quale agent usare (mTLS ha priorità su proxy)
      let activeAgent: https.Agent | HttpsProxyAgent<string> | null = mtlsAgent;

      // Se c'è un proxy e NON c'è mTLS, usa proxy agent
      const proxyUrl = this.getProxyUrl();
      if (proxyUrl && !mtlsAgent) {
        log.info(`[Namirial] Usando proxy: ${proxyUrl}`);
        activeAgent = new HttpsProxyAgent(proxyUrl);
      }

      // Configura l'agent nelle opzioni SOAP per il fetch del WSDL
      if (activeAgent) {
        soapOptions.wsdl_options = {
          ...soapOptions.wsdl_options,
          httpsAgent: activeAgent,
          agent: activeAgent
        };

        log.info(`[Namirial] Agent HTTPS configurato per WSDL fetch: ${mtlsAgent ? 'mTLS' : 'proxy'}`);
      }

      this.soapClient = await soap.createClientAsync(this.wsdlUrl, soapOptions);

      // IMPORTANTE: Forza sempre l'endpoint corretto
      // Il WSDL potrebbe contenere un endpoint interno/localhost
      const correctEndpoint = this.wsdlUrl.replace('?wsdl', '');
      const wsdlEndpoint = this.soapClient.getEndpoint?.() || 'unknown';
      log.info(`[Namirial] Endpoint dal WSDL: ${wsdlEndpoint}`);
      log.info(`[Namirial] Forzatura endpoint a: ${correctEndpoint}`);
      this.soapClient.setEndpoint(correctEndpoint);

      // Configura l'agent per le chiamate successive (mTLS o proxy)
      if (activeAgent) {
        // La libreria soap usa internamente request/axios
        // Impostiamo le opzioni di default per tutte le richieste
        this.soapClient.setEndpoint(correctEndpoint);

        // Sovrascriviamo il security per passare l'agent
        // Metodo alternativo: usiamo addHttpHeader se disponibile
        // oppure l'opzione più robusta: sovrascriviamo httpClient.request

        // Per la libreria soap 0.x, l'agent va passato tramite wsdl_options
        // che abbiamo già fatto. Verifichiamo che funzioni per le chiamate SOAP.
        // Se necessario, possiamo usare un BasicAuthSecurity con agent custom.

        // Sovrascriviamo le opzioni di richiesta per includere sempre l'agent
        const originalHttpClient = (this.soapClient as any).httpClient;
        if (originalHttpClient && typeof originalHttpClient.request === 'function') {
          const originalRequest = originalHttpClient.request.bind(originalHttpClient);
          (this.soapClient as any).httpClient.request = (
            rurl: string,
            data: any,
            callback: any,
            exheaders: any,
            exoptions: any
          ) => {
            const newOptions = {
              ...exoptions,
              httpsAgent: activeAgent,
              agent: activeAgent
            };
            log.info(`[Namirial] Richiesta SOAP a: ${rurl}`);
            return originalRequest(rurl, data, callback, exheaders, newOptions);
          };
          log.info('[Namirial] httpClient.request sovrascritto con agent mTLS');
        } else {
          log.warn('[Namirial] httpClient.request non trovato, mTLS potrebbe non funzionare per le chiamate SOAP');
        }
      }

      log.info('[Namirial] Client SOAP creato con successo');
      log.info(`[Namirial] Endpoint finale: ${this.soapClient.getEndpoint?.() || correctEndpoint}`);

      // Log struttura completa del servizio per debug
      const serviceDesc = this.soapClient.describe();
      log.info('[Namirial] Struttura servizio:', JSON.stringify(serviceDesc, null, 2));

      // Log metodi disponibili sul client
      const clientMethods = Object.keys(this.soapClient).filter(k =>
        typeof (this.soapClient as any)[k] === 'function' && !k.startsWith('_')
      );
      log.info('[Namirial] Metodi client:', clientMethods.slice(0, 20)); // primi 20

      return this.soapClient;
    } catch (error: any) {
      log.error('[Namirial] Errore creazione client SOAP:', error.message);
      throw new RemoteSignError(
        `Impossibile connettersi al servizio Namirial: ${error.message}`,
        'CONNECTION_ERROR',
        this.providerId,
        true
      );
    }
  }

  // ===========================================================================
  // AUTENTICAZIONE
  // ===========================================================================

  async authenticate(
    credentials: RemoteSignCredentials,
    sessionDurationMinutes: number = 3  // SWS ha massimo 3 minuti
  ): Promise<RemoteSignSession> {
    log.info(`[Namirial] Autenticazione utente: ${credentials.username}`);
    log.info(`[Namirial] Endpoint: ${this.activeBaseUrl} (${this.isOnPremise ? 'ON-PREMISES' : 'SaaS'})`);

    // Determina se è firma automatica o con OTP
    const hasOtp = Boolean(credentials.otp);
    const isAutomatic = !hasOtp;

    log.info(`[Namirial] Tipo firma: ${isAutomatic ? 'automatica (senza OTP)' : 'con OTP'}`);

    // Prepara le credenziali SWS
    // Per firma RHI con OTP: username=codice dispositivo, password=PIN, otp=codice OTP
    const swsCredentials: SwsCredentials = {
      username: credentials.username,
      password: credentials.pin || credentials.password || '',
      otp: hasOtp ? credentials.otp : undefined  // Campo 'otp' per il codice 6 cifre
    };

    log.info(`[Namirial] Credenziali: username=${credentials.username}, hasPassword=${!!swsCredentials.password}, hasOtp=${hasOtp}`);

    try {
      const client = await this.getClient();

      // Per la firma AUTOMATICA (senza OTP), NON usiamo openSession
      // Le credenziali demo (DEMO/foo123) sono configurate per firma automatica
      // e openSession non è permesso. Passiamo le credenziali direttamente a signPAdES.
      if (isAutomatic) {
        log.info('[Namirial] Modalità AUTOMATICA: skippo openSession, verifica credenziali con enable...');

        // Proviamo a validare le credenziali con il metodo "enable" o facendo una firma di test
        // In modalità automatica, creiamo una "sessione virtuale" senza sessionKey
        // Le credenziali verranno passate direttamente ai metodi di firma

        // Verifichiamo se il metodo enable esiste
        if (typeof client.enableAsync === 'function') {
          log.info('[Namirial] Chiamata SOAP enable per verifica credenziali...');
          try {
            const enableArgs = {
              credentials: swsCredentials
            };
            const [enableResult] = await client.enableAsync(enableArgs);
            log.info('[Namirial] Risposta enable:', JSON.stringify(enableResult, null, 2));

            // Controlla errori
            if (enableResult?.return?.code && enableResult.return.code !== '0') {
              throw new RemoteSignError(
                enableResult.return.description || `Errore enable: ${enableResult.return.code}`,
                enableResult.return.code,
                this.providerId,
                false
              );
            }
          } catch (enableError: any) {
            // Se enable fallisce, logghiamo ma proviamo comunque a creare la sessione virtuale
            // Alcune configurazioni potrebbero non supportare enable
            log.warn('[Namirial] Metodo enable fallito:', enableError.message);
            log.info('[Namirial] Procedo comunque con sessione virtuale (le credenziali verranno verificate alla prima firma)');
          }
        } else {
          log.info('[Namirial] Metodo enable non disponibile, creo sessione virtuale senza verifica preventiva');
        }

        // Crea una "sessione virtuale" per firma automatica
        // Le credenziali verranno passate direttamente a signPAdES
        const virtualSessionId = `AUTO_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        const expiresAt = new Date(Date.now() + 3 * 60 * 1000);

        // Salva credenziali per uso nelle firme
        this.currentCredentials = { ...swsCredentials };

        const session: RemoteSignSession = {
          sessionId: virtualSessionId,
          providerId: this.providerId,
          userId: credentials.username,
          expiresAt,
          certificate: {
            cn: credentials.username,
            serialNumber: 'N/A',
            issuer: 'Namirial S.p.A.'
          },
          accessToken: undefined,  // Nessun token per sessione automatica
          metadata: {
            isAutomatic: true,
            credentials: swsCredentials  // Credenziali da usare nelle firme
          }
        };

        log.info(`[Namirial] Sessione AUTOMATICA creata: ${virtualSessionId}, scade: ${expiresAt.toISOString()}`);
        return session;
      }

      // Per la firma CON OTP, usiamo openSession per creare una sessione reale
      log.info('[Namirial] Modalità con OTP: chiamata SOAP openSession...');

      const openSessionArgs = {
        credentials: swsCredentials
      };

      log.info('[Namirial] Args openSession:', JSON.stringify({
        credentials: {
          ...swsCredentials,
          password: '***',
          otp: swsCredentials.otp ? '***' : undefined
        }
      }, null, 2));

      // Verifica che il metodo esista
      if (typeof client.openSessionAsync !== 'function') {
        log.error('[Namirial] Metodo openSessionAsync non trovato sul client!');
        log.info('[Namirial] Metodi async disponibili:', Object.keys(client).filter(k => k.endsWith('Async')));
        throw new Error('Metodo openSessionAsync non disponibile nel servizio SOAP');
      }

      let result: any;
      let rawRequest: any;
      try {
        const response = await client.openSessionAsync(openSessionArgs);
        result = response[0];
        rawRequest = response[3];
        log.info('[Namirial] Risposta openSession ricevuta');
      } catch (soapError: any) {
        log.error('[Namirial] Errore chiamata SOAP openSession:', soapError.message || soapError);
        log.error('[Namirial] Errore completo:', JSON.stringify(soapError, Object.getOwnPropertyNames(soapError), 2));
        throw soapError;
      }

      log.info('[Namirial] Risposta openSession:', JSON.stringify(result, null, 2));

      // Log SOAP request/response per debug (solo in caso di problemi)
      if (!result || (result?.return?.code && result.return.code !== '0')) {
        log.debug('[Namirial] Raw SOAP request:', rawRequest);
      }

      // Controlla errori nella risposta
      if (result?.return?.code && result.return.code !== '0') {
        throw new RemoteSignError(
          result.return.description || `Errore openSession: ${result.return.code}`,
          result.return.code,
          this.providerId,
          false
        );
      }

      const sessionKey = result?.sessionKey || result?.return?.sessionKey;
      if (!sessionKey) {
        throw new RemoteSignError(
          'SessionKey non ricevuto da SWS',
          'NO_SESSION_KEY',
          this.providerId,
          false
        );
      }

      // Salva credenziali per eventuale rinnovo
      this.currentCredentials = { ...swsCredentials, sessionKey };

      // La sessione SWS dura 3 minuti
      const expiresAt = new Date(Date.now() + 3 * 60 * 1000);

      const session: RemoteSignSession = {
        sessionId: sessionKey,
        providerId: this.providerId,
        userId: credentials.username,
        expiresAt,
        certificate: {
          cn: credentials.username,
          serialNumber: 'N/A',
          issuer: 'Namirial S.p.A.'
        },
        accessToken: sessionKey,
        metadata: {
          isAutomatic: false,
          credentials: swsCredentials
        }
      };

      log.info(`[Namirial] Sessione OTP creata: ${sessionKey}, scade: ${expiresAt.toISOString()}`);

      return session;
    } catch (error: any) {
      // Log dettagliato dell'errore
      log.error('[Namirial] Errore autenticazione:', error.message || error);
      if (error.root?.Envelope?.Body?.Fault) {
        log.error('[Namirial] SOAP Fault:', JSON.stringify(error.root.Envelope.Body.Fault, null, 2));
      }
      if (error.cause) {
        log.error('[Namirial] Error cause:', error.cause);
      }
      if (error.stack) {
        log.debug('[Namirial] Stack trace:', error.stack);
      }
      throw this.handleAuthError(error);
    }
  }

  async validateSession(session: RemoteSignSession): Promise<boolean> {
    // Verifica scadenza locale
    const now = new Date();
    if (now >= session.expiresAt) {
      log.info('[Namirial] Sessione scaduta localmente');
      return false;
    }

    // Verifica con SWS
    try {
      const client = await this.getClient();
      const [result] = await client.getRemainingTimeForSessionAsync({
        sessionKey: session.sessionId
      });

      const remainingSeconds = result?.remainingTime || 0;
      log.info(`[Namirial] Tempo residuo sessione: ${remainingSeconds} secondi`);

      return remainingSeconds > 0;
    } catch (error) {
      log.warn('[Namirial] Errore verifica sessione:', error);
      return false;
    }
  }

  async refreshSession(session: RemoteSignSession): Promise<RemoteSignSession> {
    log.info('[Namirial] Tentativo rinnovo sessione...');

    // SWS non supporta refresh - bisogna riaprire la sessione
    const isAutomatic = session.metadata?.isAutomatic;
    const credentials = session.metadata?.credentials as SwsCredentials;

    if (!credentials) {
      throw new RemoteSignError(
        'Credenziali sessione non disponibili per il rinnovo',
        'NO_CREDENTIALS',
        this.providerId,
        false
      );
    }

    // Se la sessione originale richiedeva OTP, non possiamo rinnovare automaticamente
    if (!isAutomatic) {
      throw new RemoteSignError(
        'Impossibile rinnovare sessione: richiede nuovo OTP',
        'REFRESH_REQUIRES_OTP',
        this.providerId,
        false
      );
    }

    // Riapri sessione con le stesse credenziali (senza OTP per firma automatica)
    return this.authenticate({
      username: credentials.username,
      password: credentials.password,
      pin: credentials.password
    });
  }

  async closeSession(session: RemoteSignSession): Promise<void> {
    log.info('[Namirial] Chiusura sessione');

    try {
      const client = await this.getClient();
      await client.closeSessionAsync({
        sessionKey: session.sessionId
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

    const isAutomatic = session.metadata?.isAutomatic === true;
    log.info(`[Namirial] Modalità firma: ${isAutomatic ? 'AUTOMATICA' : 'con SessionKey'}`);

    // Verifica sessione ancora valida (solo per non-automatica)
    if (!isAutomatic) {
      const status = this.getSessionStatus(session);
      if (!status.active) {
        throw new RemoteSignError(
          'Sessione scaduta. Richiede nuovo OTP.',
          'SESSION_EXPIRED',
          this.providerId,
          false
        );
      }
    }

    try {
      const client = await this.getClient();

      // Prepara credenziali in base alla modalità
      let credentials: SwsCredentials;

      if (isAutomatic) {
        // Modalità AUTOMATICA: passa username + password direttamente
        // Le credenziali sono salvate nei metadata della sessione
        const savedCreds = session.metadata?.credentials as SwsCredentials;
        if (!savedCreds) {
          throw new RemoteSignError(
            'Credenziali non disponibili per firma automatica',
            'NO_CREDENTIALS',
            this.providerId,
            false
          );
        }
        credentials = {
          username: savedCreds.username,
          password: savedCreds.password
          // NON includiamo sessionKey per firma automatica
        };
        log.info(`[Namirial] Usando credenziali dirette per firma automatica: ${credentials.username}`);
      } else {
        // Modalità con OTP: usa sessionKey
        credentials = {
          username: session.userId,
          password: '',  // Non serve con sessionKey
          sessionKey: session.sessionId
        };
        log.info(`[Namirial] Usando sessionKey: ${session.sessionId}`);
      }

      // Prepara le preferenze PAdES
      const preferences: PadesPreferences = {
        level: 'B',
        hashAlgorithm: 'SHA256'
      };

      // Determina il formato di firma
      const signatureFormat = request.signatureFormat || 'PAdES';

      let result: any;

      if (signatureFormat === 'PAdES' && request.documentPayload) {
        // Firma PAdES - richiede il PDF completo
        log.info(`[Namirial] Chiamata SOAP signPAdES su endpoint: ${this.activeBaseUrl}`);
        log.info(`[Namirial] Modalità: ${this.isOnPremise ? 'ON-PREMISES' : 'SaaS'}, WSDL: ${this.wsdlUrl}`);

        // IMPORTANTE: Il nome del parametro WSDL è "PAdESPreferences", non "preferences"
        const args = {
          credentials,
          buffer: request.documentPayload,  // PDF in base64
          PAdESPreferences: preferences      // Nome corretto dal WSDL
        };

        log.info('[Namirial] Args signPAdES:', JSON.stringify({
          credentials: {
            username: credentials.username,
            password: credentials.password ? '***' : '',
            sessionKey: credentials.sessionKey || undefined
          },
          bufferLength: request.documentPayload.length,
          PAdESPreferences: preferences
        }, null, 2));

        [result] = await client.signPAdESAsync(args);

        // Debug: logga la struttura completa della risposta
        log.info('[Namirial] Struttura risposta signPAdES:', Object.keys(result || {}));
        if (result) {
          for (const key of Object.keys(result)) {
            const val = result[key];
            if (typeof val === 'string' && val.length > 100) {
              log.info(`[Namirial] Campo '${key}': stringa di ${val.length} caratteri (primi 50: ${val.substring(0, 50)}...)`);
            } else if (typeof val === 'object' && val !== null) {
              log.info(`[Namirial] Campo '${key}': oggetto con chiavi: ${Object.keys(val)}`);
            } else {
              log.info(`[Namirial] Campo '${key}':`, val);
            }
          }
        }
      } else if (request.documentHash) {
        // Firma hash
        log.info('[Namirial] Chiamata SOAP signHash...');

        const args = {
          credentials,
          buffer: request.documentHash,  // Hash in base64
          preferences: {
            hashAlgorithm: request.hashAlgorithm || 'SHA256'
          }
        };

        [result] = await client.signPkcs1Async(args);
      } else {
        throw new RemoteSignError(
          'Documento o hash richiesto per la firma',
          'MISSING_DOCUMENT',
          this.providerId,
          false
        );
      }

      // Log risposta (solo struttura, non contenuto)
      if (result?.return?.code) {
        log.info('[Namirial] Risposta firma return:', JSON.stringify(result.return));
      }

      // Controlla errori
      if (result?.return?.code && result.return.code !== '0') {
        throw new RemoteSignError(
          result.return.description || 'Errore firma',
          result.return.code,
          this.providerId,
          false
        );
      }

      // Cerca il buffer firmato in tutti i possibili campi
      // Il nome del campo può variare in base alla versione SWS
      // NOTA: SWS SaaS restituisce il PDF firmato direttamente in 'return' (non in signedBuffer)
      let signedBuffer = result?.return  // Campo principale per SWS SaaS
                      || result?.signedBuffer
                      || result?.return?.signedBuffer
                      || result?.buffer
                      || result?.return?.buffer
                      || result?.signedPDF
                      || result?.return?.signedPDF
                      || result?.pdfSigned
                      || result?.return?.pdfSigned;

      // Se non trovato nei campi standard, cerca qualsiasi campo stringa che sembri un PDF base64
      if (!signedBuffer && result) {
        for (const key of Object.keys(result)) {
          const val = result[key];
          if (typeof val === 'string' && val.length > 1000) {
            // Verifica se inizia con header PDF in base64 (JVBERi0 = %PDF-)
            if (val.startsWith('JVBERi0') || val.startsWith('/9j/')) {
              log.info(`[Namirial] Buffer firmato trovato nel campo '${key}' (${val.length} caratteri)`);
              signedBuffer = val;
              break;
            }
          }
        }
      }

      // Ultimo tentativo: controlla se result stesso è una stringa (buffer diretto)
      if (!signedBuffer && typeof result === 'string' && result.length > 1000) {
        log.info(`[Namirial] Risposta è direttamente il buffer (${result.length} caratteri)`);
        signedBuffer = result;
      }

      if (!signedBuffer) {
        log.error('[Namirial] Documento firmato non trovato. Campi disponibili:', Object.keys(result || {}));
        throw new RemoteSignError(
          'Documento firmato non ricevuto',
          'NO_SIGNED_DOCUMENT',
          this.providerId,
          false
        );
      }

      log.info(`[Namirial] Buffer firmato estratto: ${signedBuffer.length} caratteri`);

      log.info('[Namirial] Documento firmato con successo');

      return {
        signature: signedBuffer,
        signedBy: session.certificate?.cn || session.userId,
        signatureTimestamp: new Date().toISOString(),
        documentId: request.documentId
      };
    } catch (error: any) {
      log.error('[Namirial] Errore firma:', error.message);
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

        // Se sessione scaduta e non può essere rinnovata, interrompi
        if (error.code === 'SESSION_EXPIRED' || error.code === 'REFRESH_REQUIRES_OTP') {
          log.warn('[Namirial] Sessione scaduta, interruzione batch');
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
    // SWS non fornisce un endpoint per recuperare info certificato
    return session.certificate || {
      cn: session.userId,
      serialNumber: 'N/A',
      issuer: 'Namirial S.p.A.'
    };
  }

  // ===========================================================================
  // UTILITY
  // ===========================================================================

  isConfigured(): boolean {
    return Boolean(this.config.baseUrl);
  }

  async testConnection(): Promise<boolean> {
    try {
      // Forza ricreazione client per test pulito
      this.soapClient = null;
      const client = await this.getClient();
      // Prova a chiamare healthCheck
      const [result] = await client.healthCheckAsync({});
      log.info('[Namirial] Health check:', result);
      return true;
    } catch (error: any) {
      log.error('[Namirial] Test connessione fallito:', error.message);
      // Se riusciamo a creare il client, la connessione funziona
      return this.soapClient !== null;
    }
  }

  /**
   * Reset del client SOAP (utile per forzare riconnessione)
   */
  resetClient(): void {
    this.soapClient = null;
    log.info('[Namirial] Client SOAP resettato');
  }

  /**
   * Cambia modalità endpoint (SaaS <-> On-Premises) a runtime.
   * Utile per permettere all'utente di scegliere l'endpoint dalla UI.
   *
   * @param useOnPremise true per On-Premises, false per SaaS
   * @returns true se il cambio è avvenuto con successo
   */
  switchEndpoint(useOnPremise: boolean): boolean {
    // Verifica che l'endpoint richiesto sia configurato
    if (useOnPremise && !this.config.onPremiseBaseUrl) {
      log.error('[Namirial] Impossibile passare a On-Premises: URL non configurato');
      return false;
    }

    if (!useOnPremise && !this.config.baseUrl) {
      log.error('[Namirial] Impossibile passare a SaaS: URL non configurato');
      return false;
    }

    // Aggiorna stato
    this.isOnPremise = useOnPremise;

    // Aggiorna URL
    const baseUrl = useOnPremise ? this.config.onPremiseBaseUrl! : this.config.baseUrl;
    this.activeBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.wsdlUrl = `${this.activeBaseUrl}/sign-services?wsdl`;

    // Reset client per forzare riconnessione con nuovo endpoint
    this.soapClient = null;

    log.info(`[Namirial] Endpoint cambiato a ${useOnPremise ? 'On-Premises' : 'SaaS'}: ${this.wsdlUrl}`);
    return true;
  }

  /**
   * Ottiene informazioni sull'endpoint corrente
   */
  getEndpointInfo(): { isOnPremise: boolean; baseUrl: string; hasSaaS: boolean; hasOnPremise: boolean } {
    return {
      isOnPremise: this.isOnPremise,
      baseUrl: this.activeBaseUrl,
      hasSaaS: Boolean(this.config.baseUrl),
      hasOnPremise: Boolean(this.config.onPremiseBaseUrl)
    };
  }

  // ===========================================================================
  // HELPER PRIVATI
  // ===========================================================================

  private handleAuthError(error: any): RemoteSignError {
    if (error instanceof RemoteSignError) {
      return error;
    }

    // Estrai messaggio da SOAP fault se presente
    let message = error.message || 'Errore autenticazione';
    let errorCode = 'AUTH_ERROR';

    // Controlla SOAP Fault
    const soapFault = error.root?.Envelope?.Body?.Fault;
    if (soapFault) {
      const faultString = soapFault.faultstring || soapFault.detail?.message;
      if (faultString) {
        message = faultString;
      }
    }

    // Errori specifici SWS
    if (message.includes('ENOTFOUND') || message.includes('ECONNREFUSED')) {
      return new RemoteSignError(
        'Impossibile connettersi al server Namirial. Verificare la connessione.',
        'NETWORK_ERROR',
        this.providerId,
        true
      );
    }

    if (message.includes('ETIMEDOUT')) {
      return new RemoteSignError(
        'Timeout connessione al server Namirial. Verificare la connessione di rete.',
        'TIMEOUT_ERROR',
        this.providerId,
        true
      );
    }

    if (message.includes('-1') || message.toLowerCase().includes('invalid') ||
        message.toLowerCase().includes('wrong') || message.toLowerCase().includes('incorrect')) {
      return new RemoteSignError(
        'Credenziali non valide. Verificare codice dispositivo, password e OTP.',
        'INVALID_CREDENTIALS',
        this.providerId,
        false
      );
    }

    // Errore 1001: Dispositivo non trovato sul server
    // IMPORTANTE: questo check deve essere PRIMA di quello generico per "otp"
    if (message.includes('1001') || message.toLowerCase().includes('non esistente') ||
        message.toLowerCase().includes('dispositivo') && message.toLowerCase().includes('sistema')) {
      return new RemoteSignError(
        'Dispositivo non trovato sul server. Verificare che il codice dispositivo (RHI) sia corretto e che il certificato sia registrato su questo endpoint. Potrebbe essere necessario usare un endpoint diverso (es. sws.firmacerta.it vs sws.namirial.it).',
        'DEVICE_NOT_FOUND',
        this.providerId,
        false
      );
    }

    // OTP non valido (ma il dispositivo esiste)
    if (message.toLowerCase().includes('otp') || message.toLowerCase().includes('token')) {
      return new RemoteSignError(
        'OTP non valido o scaduto. Generare un nuovo codice OTP.',
        'INVALID_OTP',
        this.providerId,
        false
      );
    }

    if (message.toLowerCase().includes('session') || message.toLowerCase().includes('expired')) {
      return new RemoteSignError(
        'Sessione scaduta. Effettuare nuovamente l\'autenticazione.',
        'SESSION_EXPIRED',
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

    if (message.includes('-10') || message.toLowerCase().includes('session')) {
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
