/**
 * remoteSignAdminIpcHandlers.ts
 * IPC handlers per le operazioni amministrative sui provider di firma remota.
 * Accessibili solo agli utenti admin.
 */

import { ipcMain } from 'electron';
import log from 'electron-log';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// Path del file di configurazione
const getSignSettingsPath = (): string => {
  // In production usa ProgramData, in dev usa assets locali
  const programDataPath = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'MedReportAndSign', 'assets', 'sign-settings.json');
  const devPath = path.join(__dirname, '..', '..', 'renderer', 'assets', 'sign-settings.json');

  if (fs.existsSync(programDataPath)) {
    return programDataPath;
  }
  return devPath;
};

// Legge la configurazione corrente
const readSignSettings = (): any => {
  try {
    const settingsPath = getSignSettingsPath();
    const content = fs.readFileSync(settingsPath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    log.error('[RemoteSignAdmin] Errore lettura sign-settings:', e);
    return {};
  }
};

// Salva la configurazione
const writeSignSettings = (settings: any): void => {
  try {
    const settingsPath = getSignSettingsPath();
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    log.info('[RemoteSignAdmin] Configurazione salvata:', settingsPath);
  } catch (e) {
    log.error('[RemoteSignAdmin] Errore salvataggio sign-settings:', e);
    throw e;
  }
};

// Cache per token OAuth2
let cachedAccessToken: string | null = null;
let tokenExpiresAt: Date | null = null;

/**
 * Ottiene il token di autenticazione per OpenAPI.
 * Supporta 3 metodi:
 * 1. Token pre-configurato (token)
 * 2. API Key usata come Bearer (apiKey)
 * 3. OAuth2 client_credentials (clientId + clientSecret)
 */
async function getOpenApiAccessToken(openapi: any): Promise<string> {
  // Metodo 1: Token pre-configurato
  if (openapi.token) {
    log.debug('[RemoteSignAdmin] Usando token pre-configurato');
    return openapi.token;
  }

  // Metodo 2: API Key diretta
  if (openapi.apiKey && !openapi.clientId) {
    log.debug('[RemoteSignAdmin] Usando API Key come Bearer token');
    return openapi.apiKey;
  }

  // Metodo 3: OAuth2 - genera access token
  if (openapi.clientId && openapi.clientSecret) {
    // Se abbiamo un token valido, riutilizzalo
    if (cachedAccessToken && tokenExpiresAt && new Date() < tokenExpiresAt) {
      log.debug('[RemoteSignAdmin] Riutilizzo token OAuth2 in cache');
      return cachedAccessToken;
    }

    log.info('[RemoteSignAdmin] Richiesta nuovo access token OAuth2');

    const oauthUrl = openapi.oauthUrl || 'https://console.openapi.com/oauth/token';

    // Scope per admin operations
    const scopes = [
      'GET:esignature/certificates',
      'POST:esignature/certificates',
      'PATCH:esignature/certificates',
      'GET:esignature/signatures',
      'DELETE:esignature/signatures',
      'POST:esignature/verify',
      'POST:esignature/EU-QES_otp',
      'POST:esignature/EU-QES_automatic',
      'POST:esignature/EU-QES_eseal',
      'POST:esignature/EU-SES'
    ].join(' ');

    const response = await fetch(oauthUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: openapi.clientId,
        client_secret: openapi.clientSecret,
        scope: scopes
      }).toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error('[RemoteSignAdmin] Errore OAuth:', response.status, errorText);
      throw new Error(`OAuth authentication failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    cachedAccessToken = data.access_token;
    tokenExpiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);

    log.info('[RemoteSignAdmin] Access token ottenuto, scade tra', data.expires_in, 'secondi');
    return cachedAccessToken;
  }

  throw new Error('Nessun metodo di autenticazione configurato. Configura token, apiKey, o clientId+clientSecret.');
}

// ============================================================================
// OPENAPI ADMIN HANDLERS
// ============================================================================

/**
 * Registra tutti gli IPC handlers per le operazioni admin di OpenAPI
 */
export function registerRemoteSignAdminHandlers(): void {
  log.info('[RemoteSignAdmin] ========================================');
  log.info('[RemoteSignAdmin] REGISTRAZIONE HANDLERS ADMIN IN CORSO...');
  log.info('[RemoteSignAdmin] ========================================');
  console.log('[RemoteSignAdmin] REGISTRAZIONE HANDLERS ADMIN IN CORSO...');

  // =========================================================================
  // CONFIGURAZIONE
  // =========================================================================

  /**
   * Ottiene la configurazione OpenAPI corrente
   */
  ipcMain.handle('remote-sign-admin:get-openapi-config', async () => {
    log.info('[RemoteSignAdmin] === get-openapi-config HANDLER CALLED ===');
    console.log('[RemoteSignAdmin] === get-openapi-config HANDLER CALLED ===');
    try {
      const settings = readSignSettings();
      log.info('[RemoteSignAdmin] Settings loaded:', JSON.stringify(settings.remoteSign?.openapi || {}).substring(0, 200));
      const openapi = settings.remoteSign?.openapi || {};
      const result = {
        success: true,
        config: {
          baseUrl: openapi.baseUrl || 'https://test.esignature.openapi.com',
          apiKey: openapi.apiKey || '',
          token: openapi.token || '',
          certificateType: openapi.certificateType || 'EU-QES_otp'
        }
      };
      log.info('[RemoteSignAdmin] Returning config result');
      return result;
    } catch (e: any) {
      log.error('[RemoteSignAdmin] Errore get config:', e);
      return { success: false, error: e.message };
    }
  });

  /**
   * Salva la configurazione OpenAPI
   */
  ipcMain.handle('remote-sign-admin:save-openapi-config', async (_event, config: {
    baseUrl: string;
    apiKey: string;
    token: string;
    certificateType: string;
  }) => {
    log.info('[RemoteSignAdmin] Salvataggio configurazione OpenAPI');
    try {
      const settings = readSignSettings();
      if (!settings.remoteSign) {
        settings.remoteSign = {};
      }
      if (!settings.remoteSign.openapi) {
        settings.remoteSign.openapi = {};
      }

      settings.remoteSign.openapi.baseUrl = config.baseUrl;
      settings.remoteSign.openapi.apiKey = config.apiKey;
      settings.remoteSign.openapi.token = config.token;
      settings.remoteSign.openapi.certificateType = config.certificateType;
      settings.remoteSign.openapi.enabled = true;

      writeSignSettings(settings);

      // Invalida la cache del token se è stato cambiato
      cachedAccessToken = null;
      tokenExpiresAt = null;

      return { success: true };
    } catch (e: any) {
      log.error('[RemoteSignAdmin] Errore save config:', e);
      return { success: false, error: e.message };
    }
  });

  // =========================================================================
  // CERTIFICATES API
  // =========================================================================

  /**
   * GET /certificates - Lista certificati disponibili
   */
  ipcMain.handle('remote-sign-admin:openapi-get-certificates', async () => {
    log.info('[RemoteSignAdmin] === openapi-get-certificates HANDLER CALLED ===');
    console.log('[RemoteSignAdmin] === openapi-get-certificates HANDLER CALLED ===');
    try {
      const settings = readSignSettings();
      const openapi = settings.remoteSign?.openapi;
      log.info('[RemoteSignAdmin] OpenAPI config:', JSON.stringify(openapi || {}).substring(0, 200));

      if (!openapi) {
        log.error('[RemoteSignAdmin] Configurazione OpenAPI mancante!');
        return { success: false, error: 'Configurazione OpenAPI mancante' };
      }

      // Ottieni access token (supporta apiKey, token, OAuth2)
      log.info('[RemoteSignAdmin] Getting access token...');
      const accessToken = await getOpenApiAccessToken(openapi);

      const url = `${openapi.baseUrl}/certificates`;
      log.info('[RemoteSignAdmin] Calling:', url);
      log.info('[RemoteSignAdmin] Token (first 10 chars):', accessToken.substring(0, 10) + '...');
      console.log('[RemoteSignAdmin] Fetching:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      const responseText = await response.text();
      log.info('[RemoteSignAdmin] Response status:', response.status);
      log.info('[RemoteSignAdmin] Response:', responseText.substring(0, 300));
      console.log('[RemoteSignAdmin] Response status:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }

      const data = JSON.parse(responseText);
      log.info('[RemoteSignAdmin] Certificati recuperati:', data);

      return { success: true, data };
    } catch (e: any) {
      log.error('[RemoteSignAdmin] Errore GET certificates:', e);
      console.error('[RemoteSignAdmin] Errore GET certificates:', e);
      return { success: false, error: e.message };
    }
  });

  /**
   * POST /certificates/namirial-automatic - Acquista certificato Namirial Automatico
   * Valido 3 anni, per firme massive senza OTP.
   * Restituisce un certificateLink per la procedura di identificazione.
   */
  ipcMain.handle('remote-sign-admin:openapi-register-certificate', async (_event, params?: {
    certificateOwner: string;
    customReference?: string;
  }) => {
    log.info('[RemoteSignAdmin] === openapi-register-certificate HANDLER CALLED ===');
    console.log('[RemoteSignAdmin] === openapi-register-certificate HANDLER CALLED ===');
    console.log('[RemoteSignAdmin] Params received:', params);
    try {
      const settings = readSignSettings();
      const openapi = settings.remoteSign?.openapi;

      if (!openapi) {
        log.error('[RemoteSignAdmin] Configurazione OpenAPI mancante!');
        return { success: false, error: 'Configurazione OpenAPI mancante' };
      }

      // Validazione parametri
      if (!params || !params.certificateOwner) {
        log.error('[RemoteSignAdmin] Parametro certificateOwner mancante');
        return {
          success: false,
          error: 'Parametro obbligatorio mancante: certificateOwner (nome e cognome)'
        };
      }

      log.info('[RemoteSignAdmin] Getting access token...');
      const accessToken = await getOpenApiAccessToken(openapi);

      // Endpoint per certificati Namirial Automatic (per firme massive)
      const url = `${openapi.baseUrl}/certificates/namirial-automatic`;
      log.info('[RemoteSignAdmin] POST to:', url);
      console.log('[RemoteSignAdmin] POST to:', url);

      // Body secondo specifiche API OpenAPI
      const requestBody: any = {
        certificateOwner: params.certificateOwner
      };

      // Aggiungi customReference se presente
      if (params.customReference) {
        requestBody.customReference = params.customReference;
      }

      log.info('[RemoteSignAdmin] Request body:', JSON.stringify(requestBody));
      console.log('[RemoteSignAdmin] Request body:', JSON.stringify(requestBody));

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      log.info('[RemoteSignAdmin] Response status:', response.status);
      log.info('[RemoteSignAdmin] Response body:', responseText.substring(0, 500));
      console.log('[RemoteSignAdmin] Response status:', response.status);
      console.log('[RemoteSignAdmin] Response body:', responseText);

      // Parse response per errori più dettagliati
      let responseData: any = null;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        // Response non è JSON
      }

      if (!response.ok) {
        // Costruisci messaggio di errore dettagliato
        let errorMsg = `HTTP ${response.status}`;
        if (responseData) {
          if (responseData.message) errorMsg += `: ${responseData.message}`;
          if (responseData.error) errorMsg += ` (${responseData.error})`;
          if (responseData.errorCode) errorMsg += ` [Codice: ${responseData.errorCode}]`;
        } else {
          errorMsg += `: ${responseText}`;
        }

        log.error('[RemoteSignAdmin] API Error:', errorMsg);
        return {
          success: false,
          error: errorMsg,
          details: {
            status: response.status,
            errorCode: responseData?.errorCode || responseData?.error,
            message: responseData?.message,
            raw: responseText.substring(0, 300)
          }
        };
      }

      log.info('[RemoteSignAdmin] Certificato registrato:', responseData);

      return { success: true, data: responseData };
    } catch (e: any) {
      log.error('[RemoteSignAdmin] Errore POST certificates:', e);
      return { success: false, error: e.message };
    }
  });

  /**
   * PATCH /certificates - Modifica certificato
   */
  ipcMain.handle('remote-sign-admin:openapi-patch-certificate', async (_event, params: {
    certificateId: string;
    updates: any;
  }) => {
    log.info('[RemoteSignAdmin] OpenAPI PATCH /certificates');
    try {
      const settings = readSignSettings();
      const openapi = settings.remoteSign?.openapi;

      if (!openapi) {
        return { success: false, error: 'Configurazione OpenAPI mancante' };
      }

      const accessToken = await getOpenApiAccessToken(openapi);

      const response = await fetch(`${openapi.baseUrl}/certificates`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          certificateId: params.certificateId,
          ...params.updates
        })
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }

      const data = JSON.parse(responseText);
      log.info('[RemoteSignAdmin] Certificato modificato:', data);

      return { success: true, data };
    } catch (e: any) {
      log.error('[RemoteSignAdmin] Errore PATCH certificates:', e);
      return { success: false, error: e.message };
    }
  });

  // =========================================================================
  // SIGNATURES API
  // =========================================================================

  /**
   * GET /signatures - Storico firme
   */
  ipcMain.handle('remote-sign-admin:openapi-get-signatures', async () => {
    log.info('[RemoteSignAdmin] OpenAPI GET /signatures');
    try {
      const settings = readSignSettings();
      const openapi = settings.remoteSign?.openapi;

      if (!openapi) {
        return { success: false, error: 'Configurazione OpenAPI mancante' };
      }

      const accessToken = await getOpenApiAccessToken(openapi);

      const response = await fetch(`${openapi.baseUrl}/signatures`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }

      const data = JSON.parse(responseText);
      log.info('[RemoteSignAdmin] Firme recuperate:', data);

      return { success: true, data };
    } catch (e: any) {
      log.error('[RemoteSignAdmin] Errore GET signatures:', e);
      return { success: false, error: e.message };
    }
  });

  /**
   * DELETE /signatures - Elimina firma
   */
  ipcMain.handle('remote-sign-admin:openapi-delete-signature', async (_event, params: {
    signatureId: string;
  }) => {
    log.info('[RemoteSignAdmin] OpenAPI DELETE /signatures', params.signatureId);
    try {
      const settings = readSignSettings();
      const openapi = settings.remoteSign?.openapi;

      if (!openapi) {
        return { success: false, error: 'Configurazione OpenAPI mancante' };
      }

      const accessToken = await getOpenApiAccessToken(openapi);

      const response = await fetch(`${openapi.baseUrl}/signatures?id=${params.signatureId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      log.info('[RemoteSignAdmin] Firma eliminata:', params.signatureId);

      return { success: true };
    } catch (e: any) {
      log.error('[RemoteSignAdmin] Errore DELETE signatures:', e);
      return { success: false, error: e.message };
    }
  });

  // =========================================================================
  // VERIFY API
  // =========================================================================

  /**
   * POST /verify - Verifica documento firmato
   */
  ipcMain.handle('remote-sign-admin:openapi-verify-document', async (_event, params: {
    documentBase64: string;
    documentName: string;
  }) => {
    log.info('[RemoteSignAdmin] OpenAPI POST /verify');
    try {
      const settings = readSignSettings();
      const openapi = settings.remoteSign?.openapi;

      if (!openapi) {
        return { success: false, error: 'Configurazione OpenAPI mancante' };
      }

      const accessToken = await getOpenApiAccessToken(openapi);

      const response = await fetch(`${openapi.baseUrl}/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          document: params.documentBase64,
          documentName: params.documentName
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      log.info('[RemoteSignAdmin] Verifica completata:', data);

      return { success: true, data };
    } catch (e: any) {
      log.error('[RemoteSignAdmin] Errore POST verify:', e);
      return { success: false, error: e.message };
    }
  });

  // =========================================================================
  // SIGN TEST APIs
  // =========================================================================

  /**
   * POST /EU-QES_otp - Test firma con OTP
   */
  ipcMain.handle('remote-sign-admin:openapi-test-sign-otp', async (_event, params: {
    otp: string;
  }) => {
    log.info('[RemoteSignAdmin] OpenAPI POST /EU-QES_otp (test)');
    try {
      const settings = readSignSettings();
      const openapi = settings.remoteSign?.openapi;

      if (!openapi) {
        return { success: false, error: 'Configurazione OpenAPI mancante' };
      }

      const accessToken = await getOpenApiAccessToken(openapi);

      // Documento di test (piccolo PDF vuoto in base64)
      const testDocument = 'JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDYxMiA3OTJdL1BhcmVudCAyIDAgUi9SZXNvdXJjZXM8PD4+Pj4KZW5kb2JqCnhyZWYKMCA0CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDUyIDAwMDAwIG4gCjAwMDAwMDAxMDIgMDAwMDAgbiAKdHJhaWxlcgo8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxODMKJSVFT0YK';

      const response = await fetch(`${openapi.baseUrl}/EU-QES_otp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          document: testDocument,
          otp: params.otp,
          documentName: 'test_document.pdf'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      log.info('[RemoteSignAdmin] Test firma OTP completato:', data);

      return { success: true, data };
    } catch (e: any) {
      log.error('[RemoteSignAdmin] Errore POST EU-QES_otp:', e);
      return { success: false, error: e.message };
    }
  });

  /**
   * POST /EU-QES_automatic - Test firma automatica
   */
  ipcMain.handle('remote-sign-admin:openapi-test-sign-automatic', async () => {
    log.info('[RemoteSignAdmin] OpenAPI POST /EU-QES_automatic (test)');
    try {
      const settings = readSignSettings();
      const openapi = settings.remoteSign?.openapi;

      if (!openapi) {
        return { success: false, error: 'Configurazione OpenAPI mancante' };
      }

      const accessToken = await getOpenApiAccessToken(openapi);

      // Documento di test
      const testDocument = 'JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDYxMiA3OTJdL1BhcmVudCAyIDAgUi9SZXNvdXJjZXM8PD4+Pj4KZW5kb2JqCnhyZWYKMCA0CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDUyIDAwMDAwIG4gCjAwMDAwMDAxMDIgMDAwMDAgbiAKdHJhaWxlcgo8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxODMKJSVFT0YK';

      const response = await fetch(`${openapi.baseUrl}/EU-QES_automatic`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          document: testDocument,
          documentName: 'test_automatic.pdf'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      log.info('[RemoteSignAdmin] Test firma automatica completato:', data);

      return { success: true, data };
    } catch (e: any) {
      log.error('[RemoteSignAdmin] Errore POST EU-QES_automatic:', e);
      return { success: false, error: e.message };
    }
  });

  /**
   * POST /EU-QES_eseal - Test e-seal
   */
  ipcMain.handle('remote-sign-admin:openapi-test-eseal', async () => {
    log.info('[RemoteSignAdmin] OpenAPI POST /EU-QES_eseal (test)');
    try {
      const settings = readSignSettings();
      const openapi = settings.remoteSign?.openapi;

      if (!openapi) {
        return { success: false, error: 'Configurazione OpenAPI mancante' };
      }

      const accessToken = await getOpenApiAccessToken(openapi);

      const testDocument = 'JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDYxMiA3OTJdL1BhcmVudCAyIDAgUi9SZXNvdXJjZXM8PD4+Pj4KZW5kb2JqCnhyZWYKMCA0CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDUyIDAwMDAwIG4gCjAwMDAwMDAxMDIgMDAwMDAgbiAKdHJhaWxlcgo8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxODMKJSVFT0YK';

      const response = await fetch(`${openapi.baseUrl}/EU-QES_eseal`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          document: testDocument,
          documentName: 'test_eseal.pdf'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      log.info('[RemoteSignAdmin] Test e-seal completato:', data);

      return { success: true, data };
    } catch (e: any) {
      log.error('[RemoteSignAdmin] Errore POST EU-QES_eseal:', e);
      return { success: false, error: e.message };
    }
  });

  /**
   * POST /EU-SES - Test firma semplice
   */
  ipcMain.handle('remote-sign-admin:openapi-test-ses', async () => {
    log.info('[RemoteSignAdmin] OpenAPI POST /EU-SES (test)');
    try {
      const settings = readSignSettings();
      const openapi = settings.remoteSign?.openapi;

      if (!openapi) {
        return { success: false, error: 'Configurazione OpenAPI mancante' };
      }

      const accessToken = await getOpenApiAccessToken(openapi);

      const testDocument = 'JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDYxMiA3OTJdL1BhcmVudCAyIDAgUi9SZXNvdXJjZXM8PD4+Pj4KZW5kb2JqCnhyZWYKMCA0CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDUyIDAwMDAwIG4gCjAwMDAwMDAxMDIgMDAwMDAgbiAKdHJhaWxlcgo8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxODMKJSVFT0YK';

      const response = await fetch(`${openapi.baseUrl}/EU-SES`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          document: testDocument,
          documentName: 'test_ses.pdf'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      log.info('[RemoteSignAdmin] Test SES completato:', data);

      return { success: true, data };
    } catch (e: any) {
      log.error('[RemoteSignAdmin] Errore POST EU-SES:', e);
      return { success: false, error: e.message };
    }
  });

  log.info('[RemoteSignAdmin] ========================================');
  log.info('[RemoteSignAdmin] HANDLERS ADMIN REGISTRATI CON SUCCESSO!');
  log.info('[RemoteSignAdmin] ========================================');
  console.log('[RemoteSignAdmin] HANDLERS ADMIN REGISTRATI CON SUCCESSO!');
}
