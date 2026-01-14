/**
 * remoteSignIpcHandlers.ts
 * IPC handlers per la firma remota massiva.
 * Da importare e registrare in src/main/index.ts
 */

import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';
import { createHash } from 'crypto';

import { getProviderFactory, RemoteSignProviderFactory } from './RemoteSignProviderFactory';
import { getSessionManager, RemoteSignSessionManager } from './RemoteSignSessionManager';
import { ArubaRemoteSignProvider } from './providers/ArubaRemoteSignProvider';
import { InfoCertRemoteSignProvider } from './providers/InfoCertRemoteSignProvider';
import { NamirialRemoteSignProvider } from './providers/NamirialRemoteSignProvider';
import { OpenApiRemoteSignProvider } from './providers/OpenApiRemoteSignProvider';
import {
  ArubaProviderConfig,
  InfoCertProviderConfig,
  NamirialProviderConfig,
  OpenApiProviderConfig
} from './IRemoteSignProvider';
import { RemoteSignProvidersConfig } from './RemoteSignProviderFactory';

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
  // AUTHENTICATE
  // =========================================================================
  ipcMain.handle('remote-sign:authenticate', async (_event, params: {
    providerId: string;
    username: string;
    pin: string;
    otp: string;
    sessionMinutes?: number;
  }) => {
    log.info(`[RemoteSign] Richiesta autenticazione provider: ${params.providerId}`);

    try {
      const sessionManager = getSessionManager();

      const session = await sessionManager.createSession(
        params.providerId,
        {
          username: params.username,
          pin: params.pin,
          otp: params.otp
        },
        {
          durationMinutes: params.sessionMinutes || 45
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
      return status;
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
      examinationId: number;
      examResultId: number;
      patientLastName: string;
      patientFirstName: string;
      companyId: string;
    }>;
    providerId: string;
  }) => {
    log.info(`[RemoteSign] Avvio firma batch di ${params.reports.length} referti`);

    const sessionManager = getSessionManager();
    const sessions = sessionManager.getActiveSessions();
    const session = sessions.find(s => s.providerId.toUpperCase() === params.providerId.toUpperCase());

    if (!session) {
      log.error('[RemoteSign] Nessuna sessione attiva per il provider');
      return {
        success: false,
        error: 'Nessuna sessione attiva. Autenticarsi nuovamente.'
      };
    }

    const results: Array<{
      examinationId: number;
      success: boolean;
      error?: string;
    }> = [];

    let completed = 0;
    let failed = 0;

    for (let i = 0; i < params.reports.length; i++) {
      const report = params.reports[i];
      const patientName = `${report.patientLastName} ${report.patientFirstName}`.trim();

      // Notifica progresso
      event.sender.send('remote-sign:progress', {
        completed,
        failed,
        total: params.reports.length,
        currentPatient: patientName
      });

      try {
        // TODO: Implementare la logica completa di firma
        // 1. Recuperare il PDF del referto tramite API backend
        // 2. Calcolare hash SHA-256
        // 3. Firmare con il provider
        // 4. Assemblare CMS
        // 5. Salvare nel database

        // Per ora, simuliamo la firma con un delay
        // In produzione, questa parte deve essere sostituita con la logica reale
        log.info(`[RemoteSign] Firmando referto ${report.examinationId} - ${patientName}`);

        // Simulazione: in produzione rimuovere e implementare firma reale
        await new Promise(resolve => setTimeout(resolve, 500));

        // Placeholder per firma reale:
        /*
        const pdfBuffer = await fetchReportPdf(report.examinationId);
        const hash = createHash('sha256').update(pdfBuffer).digest('base64');

        const signResult = await sessionManager.signDocument(
          `${session.providerId}_${session.userId}`,
          {
            documentHash: hash,
            signatureFormat: 'CAdES',
            documentId: report.examinationId.toString()
          }
        );

        // Assembla CMS con timestamp
        const cms = assembleCms(pdfBuffer, signResult.signature);
        const tspCms = await timestampCms(cms, settings);

        // Salva nel database
        await saveSignedReport(report.examinationId, pdfBuffer, tspCms);
        */

        completed++;

        // Notifica singolo referto completato
        event.sender.send('remote-sign:report-completed', {
          examinationId: report.examinationId,
          success: true
        });

        results.push({
          examinationId: report.examinationId,
          success: true
        });

      } catch (error: any) {
        log.error(`[RemoteSign] Errore firma referto ${report.examinationId}:`, error);
        failed++;

        event.sender.send('remote-sign:report-completed', {
          examinationId: report.examinationId,
          success: false,
          error: error.message || 'Errore firma'
        });

        results.push({
          examinationId: report.examinationId,
          success: false,
          error: error.message
        });

        // Se errore di sessione, interrompi
        if (error.code === 'SESSION_EXPIRED' || error.code === 'INVALID_SESSION') {
          log.warn('[RemoteSign] Sessione scaduta, interruzione batch');
          break;
        }
      }
    }

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
