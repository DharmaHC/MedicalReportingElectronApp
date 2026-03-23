/**
 * remoteSignIpcHandlers.ts
 * IPC handlers per la firma remota massiva.
 * Da importare e registrare in src/main/index.ts
 */

import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';
import { createHash } from 'crypto';

import { getProviderFactory, RemoteSignProviderFactory } from './RemoteSignProviderFactory';
import { addSignatureNoticeToBuffer } from '../signPdfService';
import { getSessionManager, RemoteSignSessionManager } from './RemoteSignSessionManager';
import { ArubaRemoteSignProvider } from './providers/ArubaRemoteSignProvider';
import { InfoCertRemoteSignProvider } from './providers/InfoCertRemoteSignProvider';
import { NamirialRemoteSignProvider } from './providers/NamirialRemoteSignProvider';
import { LAZIOcreaRemoteSignProvider, LAZIOcreaProviderConfig } from './providers/LAZIOcreaRemoteSignProvider';
import { OpenApiRemoteSignProvider } from './providers/OpenApiRemoteSignProvider';
import {
  ArubaProviderConfig,
  InfoCertProviderConfig,
  NamirialProviderConfig,
  OpenApiProviderConfig
} from './IRemoteSignProvider';
import { RemoteSignProvidersConfig } from './RemoteSignProviderFactory';
import { loadConfigJson, saveConfigJson } from '../configManager';

// Importa funzioni esistenti per firma e timestamp
// (verranno usate per assembrare il CMS)
// import { timestampCms } from '../signPdfService';

/**
 * Inizializza i provider di firma remota dalla configurazione.
 * Chiamare dopo aver caricato le settings.
 */
export function initializeRemoteSignProviders(config: RemoteSignProvidersConfig): void {
  const factory = getProviderFactory();

  log.info('[RemoteSign] Inizializzazione provider...');

  // Registra Aruba
  if (config.aruba?.enabled !== false && config.aruba?.baseUrl) {
    try {
      const arubaProvider = new ArubaRemoteSignProvider(config.aruba as ArubaProviderConfig);
      factory.registerProvider(arubaProvider);
      log.info('[RemoteSign] Provider ARUBA registrato');
    } catch (e) {
      log.error('[RemoteSign] Errore registrazione ARUBA:', e);
    }
  }

  // Registra InfoCert
  if (config.infocert?.enabled !== false && config.infocert?.baseUrl) {
    try {
      const infoCertProvider = new InfoCertRemoteSignProvider(config.infocert as InfoCertProviderConfig);
      factory.registerProvider(infoCertProvider);
      log.info('[RemoteSign] Provider INFOCERT registrato');
    } catch (e) {
      log.error('[RemoteSign] Errore registrazione INFOCERT:', e);
    }
  }

  // Registra Namirial
  if (config.namirial?.enabled !== false && config.namirial?.baseUrl) {
    try {
      const namirialProvider = new NamirialRemoteSignProvider(config.namirial as NamirialProviderConfig);
      factory.registerProvider(namirialProvider);
      log.info('[RemoteSign] Provider NAMIRIAL registrato');
    } catch (e) {
      log.error('[RemoteSign] Errore registrazione NAMIRIAL:', e);
    }
  }

  // Registra LAZIOcrea (wrapper REST sopra Namirial con OAuth2)
  if (config.laziocrea?.enabled !== false && config.laziocrea?.clientId && config.laziocrea?.clientSecret) {
    try {
      const laziocreaProvider = new LAZIOcreaRemoteSignProvider(config.laziocrea as LAZIOcreaProviderConfig);
      factory.registerProvider(laziocreaProvider);
      log.info('[RemoteSign] Provider LAZIOCREA registrato');
    } catch (e) {
      log.error('[RemoteSign] Errore registrazione LAZIOCREA:', e);
    }
  }

  // Registra OpenAPI.com (supporta apiKey, token, o OAuth2)
  const openapiConfig = config.openapi;
  const hasOpenApiAuth = openapiConfig?.apiKey ||
                         openapiConfig?.token ||
                         (openapiConfig?.clientId && openapiConfig?.clientSecret);

  if (openapiConfig?.enabled !== false && hasOpenApiAuth && openapiConfig?.baseUrl) {
    try {
      const openApiProvider = new OpenApiRemoteSignProvider(openapiConfig as OpenApiProviderConfig);
      factory.registerProvider(openApiProvider);
      log.info('[RemoteSign] Provider OPENAPI registrato');
    } catch (e) {
      log.error('[RemoteSign] Errore registrazione OPENAPI:', e);
    }
  }

  factory.initialize(config);

  const stats = factory.getStats();
  log.info(`[RemoteSign] Inizializzazione completata: ${stats.configuredProviders}/${stats.totalProviders} provider configurati`);
}

/**
 * Registra tutti gli IPC handlers per la firma remota.
 */
export function registerRemoteSignIpcHandlers(): void {
  log.info('[RemoteSign] Registrazione IPC handlers...');

  // =========================================================================
  // GET PROVIDERS
  // =========================================================================
  ipcMain.handle('remote-sign:get-providers', async () => {
    try {
      const factory = getProviderFactory();
      return factory.getEnabledProviders();
    } catch (error: any) {
      log.error('[RemoteSign] Errore get-providers:', error);
      return [];
    }
  });

  // =========================================================================
  // GET STORED CREDENTIALS (per firma automatica)
  // =========================================================================
  ipcMain.handle('remote-sign:get-stored-credentials', async (_event, params: {
    token: string;
    apiBaseUrl: string;
    username: string;  // Username per identificare l'utente (il token API non contiene claims utente)
  }) => {
    log.info('[RemoteSign] Richiesta credenziali salvate per firma automatica, username:', params.username);

    try {
      // Chiama l'API backend per ottenere password e PIN decriptati
      // Passa username come query param perché il token non contiene claims utente
      const url = `${params.apiBaseUrl}Account/manage/signature-password?username=${encodeURIComponent(params.username)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${params.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Errore recupero credenziali: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as { password?: string; pin?: string };

      // Per Namirial servono sia password che PIN
      // Per altri provider basta la password
      if (!result.password && !result.pin) {
        return {
          success: false,
          error: 'Credenziali non configurate'
        };
      }

      log.info('[RemoteSign] Credenziali recuperate con successo (password: ' +
        (result.password ? 'si' : 'no') + ', pin: ' + (result.pin ? 'si' : 'no') + ')');

      return {
        success: true,
        password: result.password || undefined,
        pin: result.pin || undefined  // PIN separato per Namirial
      };
    } catch (error: any) {
      log.error('[RemoteSign] Errore recupero credenziali:', error);
      return {
        success: false,
        error: error.message || 'Errore recupero credenziali'
      };
    }
  });

  // =========================================================================
  // AUTHENTICATE
  // =========================================================================
  ipcMain.handle('remote-sign:authenticate', async (_event, params: {
    providerId: string;
    username: string;
    password?: string;  // Password certificato (Namirial la richiede separata dal PIN)
    pin: string;
    otp: string;
    sessionMinutes?: number;
    isAutomatic?: boolean; // true per firma automatica senza OTP
  }) => {
    log.info(`[RemoteSign] Richiesta autenticazione provider: ${params.providerId} (automatica: ${params.isAutomatic || false})`);

    try {
      const sessionManager = getSessionManager();

      const session = await sessionManager.createSession(
        params.providerId,
        {
          username: params.username,
          password: params.password,  // Password per Namirial
          pin: params.pin,
          otp: params.isAutomatic ? undefined : params.otp // OTP non necessario per firma automatica
        },
        {
          durationMinutes: params.sessionMinutes || 45,
          isAutomatic: params.isAutomatic
        }
      );

      return {
        success: true,
        sessionId: session.sessionId,
        expiresAt: session.expiresAt.toISOString(),
        signedBy: session.certificate?.cn || params.username
      };
    } catch (error: any) {
      log.error('[RemoteSign] Errore autenticazione:', error);
      return {
        success: false,
        error: error.message || 'Autenticazione fallita'
      };
    }
  });

  // =========================================================================
  // GET NAMIRIAL ENDPOINT INFO
  // =========================================================================
  ipcMain.handle('remote-sign:get-namirial-endpoint-info', async () => {
    try {
      const factory = getProviderFactory();
      const provider = factory.getProvider('NAMIRIAL') as NamirialRemoteSignProvider;

      if (!provider) {
        return {
          success: false,
          error: 'Provider Namirial non configurato'
        };
      }

      const info = provider.getEndpointInfo();
      return {
        success: true,
        ...info
      };
    } catch (error: any) {
      log.error('[RemoteSign] Errore get-namirial-endpoint-info:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // =========================================================================
  // SWITCH NAMIRIAL ENDPOINT (SaaS <-> On-Premises)
  // =========================================================================
  ipcMain.handle('remote-sign:switch-namirial-endpoint', async (_event, params: {
    useOnPremise: boolean;
  }) => {
    log.info(`[RemoteSign] Switch endpoint Namirial: useOnPremise=${params.useOnPremise}`);

    try {
      const factory = getProviderFactory();
      const provider = factory.getProvider('NAMIRIAL') as NamirialRemoteSignProvider;

      if (!provider) {
        return { success: false, error: 'Provider Namirial non configurato' };
      }

      // (A) Blocca se c'è una sessione Namirial attiva
      const sessionManager = getSessionManager();
      const activeSessions = sessionManager.getActiveSessions();
      const hasActiveNamirialSession = activeSessions.some(
        s => s.providerId.toUpperCase() === 'NAMIRIAL'
      );
      if (hasActiveNamirialSession) {
        log.warn('[RemoteSign] Impossibile cambiare endpoint: sessione Namirial attiva');
        return {
          success: false,
          error: 'Impossibile cambiare endpoint mentre è attiva una sessione di firma. Chiudere la sessione e riprovare.'
        };
      }

      // Cambia endpoint in memoria
      const previousEndpoint = provider.getEndpointInfo();
      const switched = provider.switchEndpoint(params.useOnPremise);

      if (!switched) {
        return {
          success: false,
          error: params.useOnPremise
            ? 'URL On-Premises non configurato in sign-settings.json'
            : 'URL SaaS non configurato in sign-settings.json'
        };
      }

      // (B) Valida la connettività al nuovo endpoint prima di confermare
      log.info('[RemoteSign] Test connettività nuovo endpoint Namirial...');
      const reachable = await provider.testConnection();

      if (!reachable) {
        // Ripristina endpoint precedente
        provider.switchEndpoint(previousEndpoint.isOnPremise);
        log.warn('[RemoteSign] Connettività fallita, endpoint ripristinato a quello precedente');
        return {
          success: false,
          error: `Impossibile raggiungere l'endpoint ${params.useOnPremise ? 'On-Premises' : 'SaaS'}. Verificare URL e connettività di rete.`
        };
      }

      log.info('[RemoteSign] Connettività verificata, endpoint cambiato con successo');
      const info = provider.getEndpointInfo();
      return { success: true, ...info };

    } catch (error: any) {
      log.error('[RemoteSign] Errore switch-namirial-endpoint:', error);
      return { success: false, error: error.message };
    }
  });

  // =========================================================================
  // SAVE NAMIRIAL ENDPOINT CONFIG (persiste useOnPremise in sign-settings.json)
  // Chiamato solo dopo che switch-namirial-endpoint ha già verificato sessione e connettività
  // =========================================================================
  ipcMain.handle('remote-sign:save-namirial-endpoint-config', async (_event, params: {
    useOnPremise: boolean;
  }) => {
    log.info(`[RemoteSign] Salvataggio configurazione endpoint Namirial: useOnPremise=${params.useOnPremise}`);

    try {
      // Carica le impostazioni attuali
      const settings = loadConfigJson<any>('sign-settings.json', {});

      // Aggiorna useOnPremise
      if (!settings.remoteSign) {
        settings.remoteSign = {};
      }
      if (!settings.remoteSign.namirial) {
        settings.remoteSign.namirial = {};
      }

      settings.remoteSign.namirial.useOnPremise = params.useOnPremise;

      // Salva nella cartella corretta (ProgramData o AppData in base all'installazione)
      const saved = saveConfigJson('sign-settings.json', settings);

      if (!saved) {
        return {
          success: false,
          error: 'Errore durante il salvataggio della configurazione'
        };
      }

      log.info('[RemoteSign] Configurazione endpoint salvata correttamente');
      return { success: true };
    } catch (error: any) {
      log.error('[RemoteSign] Errore save-namirial-endpoint-config:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // =========================================================================
  // GET SESSION STATUS
  // =========================================================================
  ipcMain.handle('remote-sign:get-session-status', async (_event, params: {
    providerId: string;
  }) => {
    try {
      const sessionManager = getSessionManager();
      const sessions = sessionManager.getActiveSessions();

      // Trova sessione per questo provider
      const session = sessions.find(s => s.providerId.toUpperCase() === params.providerId.toUpperCase());

      if (!session) {
        return { active: false };
      }

      const status = sessionManager.getSessionStatus(session.providerId, session.userId);
      // Converti Date in ISO string per serializzazione IPC/Redux
      return {
        ...status,
        expiresAt: status.expiresAt instanceof Date ? status.expiresAt.toISOString() : status.expiresAt
      };
    } catch (error: any) {
      log.error('[RemoteSign] Errore get-session-status:', error);
      return { active: false };
    }
  });

  // =========================================================================
  // CLOSE SESSION
  // =========================================================================
  ipcMain.handle('remote-sign:close-session', async (_event, params: {
    providerId: string;
  }) => {
    try {
      const sessionManager = getSessionManager();
      await sessionManager.closeProviderSessions(params.providerId);
      return { success: true };
    } catch (error: any) {
      log.error('[RemoteSign] Errore close-session:', error);
      return { success: false, error: error.message };
    }
  });

  // =========================================================================
  // BULK SIGN
  // =========================================================================
  ipcMain.handle('remote-sign:bulk-sign', async (event, params: {
    reports: Array<{
      digitalReportId: string;  // GUID from DigitalSignedReports
      examinationId: number;
      linkedResultIds: number[];
      patientLastName: string;
      patientFirstName: string;
      companyId: string;
      doctorCode: string;
    }>;
    providerId: string;
    token: string;
    apiBaseUrl: string;
    signedByName: string;  // Nome del firmatario per la dicitura firma
  }) => {
    log.info(`[RemoteSign] Avvio firma batch di ${params.reports.length} referti`);
    log.info(`[RemoteSign] API Base URL: ${params.apiBaseUrl}`);
    log.info(`[RemoteSign] Firmato da: ${params.signedByName}`);

    const sessionManager = getSessionManager();
    const factory = getProviderFactory();
    const sessions = sessionManager.getActiveSessions();
    const session = sessions.find(s => s.providerId.toUpperCase() === params.providerId.toUpperCase());

    if (!session) {
      log.error('[RemoteSign] Nessuna sessione attiva per il provider');
      return {
        success: false,
        error: 'Nessuna sessione attiva. Autenticarsi nuovamente.'
      };
    }

    // Ottieni il provider
    const provider = factory.getProvider(params.providerId);
    if (!provider) {
      log.error('[RemoteSign] Provider non trovato:', params.providerId);
      return {
        success: false,
        error: `Provider ${params.providerId} non trovato`
      };
    }

    // Legge la concorrenza dalla config (default: 5)
    const signSettings = loadConfigJson<any>('sign-settings.json', {});
    const concurrency: number = signSettings?.remoteSign?.bulkSignConcurrency ?? 5;
    log.info(`[RemoteSign] Concorrenza firma batch: ${concurrency} worker paralleli`);

    const results: Array<{
      examinationId: number;
      digitalReportId: string;
      success: boolean;
      error?: string;
    }> = [];

    let completed = 0;
    let failed = 0;
    let sessionAborted = false; // flag condiviso: true quando la sessione scade

    // -----------------------------------------------------------------------
    // Funzione per firmare un singolo referto (eseguita in parallelo dai worker)
    // -----------------------------------------------------------------------
    const signSingleReport = async (report: typeof params.reports[0]): Promise<void> => {
      const patientName = `${report.patientLastName} ${report.patientFirstName}`.trim();

      if (sessionAborted) {
        failed++;
        results.push({ examinationId: report.examinationId, digitalReportId: report.digitalReportId, success: false, error: 'Batch interrotto (sessione scaduta)' });
        event.sender.send('remote-sign:report-completed', { examinationId: report.examinationId, digitalReportId: report.digitalReportId, success: false, error: 'Batch interrotto' });
        event.sender.send('remote-sign:progress', { completed, failed, total: params.reports.length, currentPatient: patientName });
        return;
      }

      try {
        log.info(`[RemoteSign] Firmando referto ${report.digitalReportId} - ${patientName}`);

        // 1. Recupera il PDF non firmato da DigitalSignedReports usando il GUID
        const pdfUrl = `${params.apiBaseUrl}ExamResults/GetUnsignedPdf/${report.digitalReportId}`;
        log.info(`[RemoteSign] Fetching unsigned PDF from: ${pdfUrl}`);

        const pdfResponse = await fetch(pdfUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${params.token}`
          }
        });

        if (!pdfResponse.ok) {
          const errorText = await pdfResponse.text();
          throw new Error(`Errore recupero PDF: ${pdfResponse.status} - ${errorText}`);
        }

        let pdfBase64 = await pdfResponse.text();
        if (!pdfBase64 || pdfBase64.length === 0) {
          throw new Error('PDF vuoto o non disponibile');
        }

        log.info(`[RemoteSign] PDF recuperato: ${pdfBase64.length} caratteri`);
        log.info(`[RemoteSign] Primi 100 caratteri risposta: ${pdfBase64.substring(0, 100)}`);

        // Pulisci il base64 da eventuali wrapper
        // 1. Rimuovi virgolette JSON se presente (es. "base64string")
        if (pdfBase64.startsWith('"') && pdfBase64.endsWith('"')) {
          pdfBase64 = pdfBase64.slice(1, -1);
          log.info('[RemoteSign] Rimosso wrapper JSON virgolette');
        }

        // 2. Rimuovi data URI prefix se presente (es. data:application/pdf;base64,)
        if (pdfBase64.startsWith('data:')) {
          const commaIndex = pdfBase64.indexOf(',');
          if (commaIndex > -1) {
            pdfBase64 = pdfBase64.substring(commaIndex + 1);
            log.info('[RemoteSign] Rimosso prefisso data URI');
          }
        }

        // 3. Prova a parsare come JSON se inizia con { o [
        if (pdfBase64.startsWith('{') || pdfBase64.startsWith('[')) {
          try {
            const jsonData = JSON.parse(pdfBase64);
            // Cerca il campo base64 in vari possibili nomi
            pdfBase64 = jsonData.data || jsonData.base64 || jsonData.pdfBase64 || jsonData.content || jsonData;
            log.info('[RemoteSign] Estratto base64 da risposta JSON');
          } catch {
            log.warn('[RemoteSign] Risposta inizia con { ma non è JSON valido');
          }
        }

        // Verifica che il base64 decodificato sia un PDF valido
        try {
          const testBuffer = Buffer.from(pdfBase64.substring(0, 20), 'base64');
          const header = testBuffer.toString('ascii');
          if (!header.startsWith('%PDF')) {
            log.warn(`[RemoteSign] WARNING: Il contenuto decodificato non sembra un PDF. Header: ${header}`);
          } else {
            log.info('[RemoteSign] Verificato: il contenuto è un PDF valido');
          }
        } catch (e) {
          log.warn('[RemoteSign] Impossibile verificare header PDF');
        }

        log.info(`[RemoteSign] PDF base64 finale: ${pdfBase64.length} caratteri`);

        // 2. Aggiungi la dicitura firma al PDF
        log.info(`[RemoteSign] Aggiungendo dicitura firma: ${params.signedByName}`);
        const noticeResult = await addSignatureNoticeToBuffer({
          pdfBase64: pdfBase64,
          signedByName: params.signedByName
        });
        pdfBase64 = noticeResult.pdfWithNoticeBase64;
        log.info(`[RemoteSign] Dicitura firma aggiunta`);

        // 3. Firma con il provider (PAdES - firma embedded nel PDF)
        const signResult = await provider.signDocument(session, {
          documentId: report.digitalReportId,
          documentPayload: pdfBase64,
          documentName: `referto_${report.examinationId}.pdf`,
          documentDescription: `Referto paziente ${patientName}`,
          signatureFormat: 'PAdES'
        });

        if (!signResult.signature) {
          throw new Error('Firma non restituita dal provider');
        }

        log.info(`[RemoteSign] Documento firmato correttamente da: ${signResult.signedBy}`);

        // 4. Salva il PDF firmato usando UpdateSignedReport
        const saveUrl = `${params.apiBaseUrl}ExamResults/UpdateSignedReport`;
        log.info(`[RemoteSign] Saving signed PDF to: ${saveUrl}`);

        // NOTA: ASP.NET Core System.Text.Json usa camelCase di default
        const saveBody = {
          id: report.digitalReportId,
          signedPdfBase64: signResult.signature,
          doctorCode: report.doctorCode,
          // Audit trail (D.Lgs. 82/2005)
          signatureMode: 'BULK',
          signatureType: 'REMOTE',
          provider: params.providerId,
          certificateCN: session.certificate?.cn ?? null,
          bypassActive: false
        };

        // Log body senza il base64 completo
        log.info(`[RemoteSign] SaveBody: id=${saveBody.id}, doctorCode=${saveBody.doctorCode}, signedPdfLength=${saveBody.signedPdfBase64?.length || 0}`);

        const saveResponse = await fetch(saveUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${params.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(saveBody)
        });

        if (!saveResponse.ok) {
          const errorText = await saveResponse.text();
          throw new Error(`Errore salvataggio PDF firmato: ${saveResponse.status} - ${errorText}`);
        }

        log.info(`[RemoteSign] PDF firmato salvato con successo`);

        // Cleanup esplicito delle stringhe base64 per favorire il garbage collection (evita memory leak)
        // @ts-ignore - assegnazione a null intenzionale per rilascio memoria
        pdfBase64 = null;
        // @ts-ignore
        saveBody.signedPdfBase64 = null;

        completed++;
        results.push({ examinationId: report.examinationId, digitalReportId: report.digitalReportId, success: true });
        event.sender.send('remote-sign:report-completed', { examinationId: report.examinationId, digitalReportId: report.digitalReportId, success: true });
        event.sender.send('remote-sign:progress', { completed, failed, total: params.reports.length, currentPatient: patientName });

      } catch (error: any) {
        log.error(`[RemoteSign] Errore firma referto ${report.digitalReportId}:`, error);
        failed++;
        results.push({ examinationId: report.examinationId, digitalReportId: report.digitalReportId, success: false, error: error.message });
        event.sender.send('remote-sign:report-completed', { examinationId: report.examinationId, digitalReportId: report.digitalReportId, success: false, error: error.message || 'Errore firma' });
        event.sender.send('remote-sign:progress', { completed, failed, total: params.reports.length, currentPatient: patientName });

        if (error.code === 'SESSION_EXPIRED' || error.code === 'INVALID_SESSION') {
          log.warn('[RemoteSign] Sessione scaduta, interruzione batch');
          sessionAborted = true;
        }
      }
    };

    // -----------------------------------------------------------------------
    // Worker pool: N worker paralleli che pescano referti dalla coda
    // JS è single-thread quindi nextIndex++ è atomico tra gli await
    // -----------------------------------------------------------------------
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const i = nextIndex++;
        if (i >= params.reports.length || sessionAborted) break;
        await signSingleReport(params.reports[i]);
      }
    };

    const workerCount = Math.min(concurrency, params.reports.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    // Notifica completamento
    event.sender.send('remote-sign:completed', {
      total: params.reports.length,
      successful: completed,
      failed
    });

    log.info(`[RemoteSign] Firma batch completata: ${completed} successi, ${failed} errori`);

    return {
      success: failed === 0,
      results,
      summary: {
        total: params.reports.length,
        successful: completed,
        failed
      }
    };
  });

  // =========================================================================
  // SIGN SINGLE OTP
  // Firma un singolo documento con OTP (per flusso "Termina Referto").
  // Crea una sessione effimera, firma, chiude la sessione.
  // =========================================================================
  ipcMain.handle('remote-sign:sign-single-otp', async (_event, params: {
    pdfBase64: string;
    providerId: string;
    username: string;
    password: string;
    pin: string;
    otp: string;
    signedByName: string;
  }) => {
    log.info(`[RemoteSign] Firma singola OTP - provider: ${params.providerId}, utente: ${params.username}`);

    const factory = getProviderFactory();
    const provider = factory.getProvider(params.providerId);
    if (!provider) {
      return { success: false, error: `Provider ${params.providerId} non trovato o non configurato` };
    }

    const sessionManager = getSessionManager();
    let sessionCreated = false;

    try {
      // 1. Apri sessione con OTP (sessione breve, solo per questa firma)
      const session = await sessionManager.createSession(
        params.providerId,
        {
          username: params.username,
          password: params.password,
          pin: params.pin,
          otp: params.otp
        },
        { durationMinutes: 5, isAutomatic: false }
      );
      sessionCreated = true;
      log.info(`[RemoteSign] Sessione OTP aperta: ${session.sessionId}`);

      // 2. Aggiungi dicitura firma al PDF
      const noticeResult = await addSignatureNoticeToBuffer({
        pdfBase64: params.pdfBase64,
        signedByName: params.signedByName
      });

      // 3. Firma il documento (PAdES)
      const activeSessions = sessionManager.getActiveSessions();
      const activeSession = activeSessions.find(
        s => s.providerId.toUpperCase() === params.providerId.toUpperCase() &&
             s.userId === params.username
      );
      if (!activeSession) {
        throw new Error('Sessione non trovata dopo autenticazione OTP');
      }

      const signResult = await provider.signDocument(activeSession, {
        documentId: `single_otp_${Date.now()}`,
        documentPayload: noticeResult.pdfWithNoticeBase64,
        documentName: 'referto.pdf',
        documentDescription: `Firma referto - ${params.signedByName}`,
        signatureFormat: 'PAdES'
      });

      if (!signResult.signature) {
        throw new Error('Firma non ricevuta dal provider remoto');
      }

      log.info('[RemoteSign] Firma singola OTP completata con successo');
      return { success: true, signedPdfBase64: signResult.signature };

    } catch (error: any) {
      log.error('[RemoteSign] Errore firma singola OTP:', error);
      return { success: false, error: error.message || 'Errore durante la firma OTP' };
    } finally {
      // Chiudi sempre la sessione dopo la firma singola
      if (sessionCreated) {
        try {
          await sessionManager.closeProviderSessions(params.providerId);
          log.info('[RemoteSign] Sessione OTP chiusa dopo firma singola');
        } catch (e) {
          log.warn('[RemoteSign] Errore chiusura sessione OTP:', e);
        }
      }
    }
  });

  log.info('[RemoteSign] IPC handlers registrati');
}

/**
 * Cleanup delle risorse alla chiusura dell'app.
 */
export async function cleanupRemoteSign(): Promise<void> {
  log.info('[RemoteSign] Cleanup...');

  try {
    const sessionManager = getSessionManager();
    await sessionManager.closeAllSessions();
  } catch (e) {
    log.warn('[RemoteSign] Errore cleanup:', e);
  }

  log.info('[RemoteSign] Cleanup completato');
}
