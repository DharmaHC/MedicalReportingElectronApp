/**
 * RemoteSignSessionManager.ts
 * Gestisce le sessioni di firma remota con timeout automatico.
 * Permette di firmare multipli documenti senza reinserire OTP.
 */

import {
  IRemoteSignProvider,
  RemoteSignSession,
  RemoteSignCredentials,
  SessionStatus,
  SignDocumentRequest,
  SignDocumentResponse,
  BatchSignResult,
  RemoteSignError
} from './IRemoteSignProvider';
import { RemoteSignProviderFactory, getProviderFactory } from './RemoteSignProviderFactory';
import log from 'electron-log';

/**
 * Sessione attiva con riferimento al provider
 */
export interface ActiveSession extends RemoteSignSession {
  /** Riferimento al provider */
  provider: IRemoteSignProvider;
  /** Timestamp ultima attività */
  lastActivity: Date;
  /** Contatore firme effettuate */
  signaturesCount: number;
}

/**
 * Evento di sessione
 */
export type SessionEvent =
  | 'created'
  | 'refreshed'
  | 'expired'
  | 'closed'
  | 'signature_completed';

/**
 * Listener per eventi di sessione
 */
export type SessionEventListener = (
  event: SessionEvent,
  sessionKey: string,
  data?: any
) => void;

/**
 * Opzioni per la creazione di una sessione
 */
export interface CreateSessionOptions {
  /** Durata sessione in minuti (default: 45) */
  durationMinutes?: number;
  /** Numero massimo di firme consentite (se supportato dal provider) */
  maxSignatures?: number;
  /** Auto-refresh della sessione prima della scadenza */
  autoRefresh?: boolean;
}

/**
 * Manager per le sessioni di firma remota.
 * Gestisce il ciclo di vita delle sessioni e il loro timeout.
 */
export class RemoteSignSessionManager {
  private sessions: Map<string, ActiveSession> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private eventListeners: Set<SessionEventListener> = new Set();
  private readonly DEFAULT_TIMEOUT_MS = 45 * 60 * 1000; // 45 minuti
  private readonly CLEANUP_INTERVAL_MS = 60 * 1000; // Ogni minuto
  private readonly AUTO_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minuti prima della scadenza

  constructor() {
    this.startCleanupInterval();
  }

  // =========================================================================
  // GESTIONE SESSIONI
  // =========================================================================

  /**
   * Crea una nuova sessione di firma.
   * @param providerId ID del provider (ARUBA, INFOCERT, NAMIRIAL)
   * @param credentials Credenziali (username, PIN, OTP)
   * @param options Opzioni sessione
   * @returns Sessione attiva
   */
  async createSession(
    providerId: string,
    credentials: RemoteSignCredentials,
    options: CreateSessionOptions = {}
  ): Promise<ActiveSession> {
    const {
      durationMinutes = 45,
      maxSignatures,
      autoRefresh = true
    } = options;

    log.info(`[SessionManager] Creazione sessione per provider ${providerId}`);

    // Ottieni il provider dalla factory
    const factory = getProviderFactory();
    const provider = factory.getProvider(providerId);

    // Chiudi eventuale sessione esistente per lo stesso utente
    const existingKey = this.findSessionKey(providerId, credentials.username);
    if (existingKey) {
      log.info(`[SessionManager] Chiusura sessione esistente: ${existingKey}`);
      await this.closeSession(existingKey);
    }

    // Autentica con il provider
    const session = await provider.authenticate(credentials, durationMinutes);

    // Crea la sessione attiva
    const activeSession: ActiveSession = {
      ...session,
      provider,
      lastActivity: new Date(),
      signaturesCount: 0,
      expiresAt: new Date(Date.now() + durationMinutes * 60 * 1000)
    };

    // Genera la chiave della sessione
    const sessionKey = this.generateSessionKey(providerId, session.userId);
    this.sessions.set(sessionKey, activeSession);

    // Emetti evento
    this.emitEvent('created', sessionKey, { providerId, userId: session.userId });

    log.info(`[SessionManager] Sessione creata: ${sessionKey}, scade: ${activeSession.expiresAt}`);

    return activeSession;
  }

  /**
   * Ottiene una sessione esistente.
   * @param providerId ID del provider
   * @param userId ID utente
   * @returns Sessione attiva o null se non trovata/scaduta
   */
  async getSession(providerId: string, userId: string): Promise<ActiveSession | null> {
    const sessionKey = this.generateSessionKey(providerId, userId);
    const session = this.sessions.get(sessionKey);

    if (!session) {
      return null;
    }

    // Verifica scadenza locale
    if (this.isSessionExpired(session)) {
      log.info(`[SessionManager] Sessione scaduta localmente: ${sessionKey}`);
      await this.closeSession(sessionKey);
      return null;
    }

    // Verifica validità con il provider
    try {
      const isValid = await session.provider.validateSession(session);
      if (!isValid) {
        log.info(`[SessionManager] Sessione invalidata dal provider: ${sessionKey}`);
        await this.closeSession(sessionKey);
        return null;
      }
    } catch (error) {
      log.warn(`[SessionManager] Errore validazione sessione: ${error}`);
      // Non chiudiamo la sessione per errori di rete temporanei
    }

    // Aggiorna lastActivity
    session.lastActivity = new Date();

    return session;
  }

  /**
   * Ottiene una sessione tramite chiave diretta.
   * @param sessionKey Chiave della sessione
   */
  getSessionByKey(sessionKey: string): ActiveSession | null {
    const session = this.sessions.get(sessionKey);
    if (!session || this.isSessionExpired(session)) {
      return null;
    }
    return session;
  }

  /**
   * Chiude una sessione.
   * @param sessionKey Chiave della sessione
   */
  async closeSession(sessionKey: string): Promise<void> {
    const session = this.sessions.get(sessionKey);

    if (session) {
      try {
        await session.provider.closeSession(session);
      } catch (error) {
        log.warn(`[SessionManager] Errore chiusura sessione remota: ${error}`);
      }

      this.sessions.delete(sessionKey);
      this.emitEvent('closed', sessionKey);
      log.info(`[SessionManager] Sessione chiusa: ${sessionKey}`);
    }
  }

  /**
   * Chiude tutte le sessioni di un provider.
   * @param providerId ID del provider
   */
  async closeProviderSessions(providerId: string): Promise<void> {
    const keysToClose: string[] = [];

    for (const [key, session] of this.sessions) {
      if (session.providerId.toUpperCase() === providerId.toUpperCase()) {
        keysToClose.push(key);
      }
    }

    for (const key of keysToClose) {
      await this.closeSession(key);
    }
  }

  /**
   * Chiude tutte le sessioni attive.
   */
  async closeAllSessions(): Promise<void> {
    const keys = Array.from(this.sessions.keys());
    for (const key of keys) {
      await this.closeSession(key);
    }
  }

  /**
   * Rinnova una sessione esistente.
   * @param sessionKey Chiave della sessione
   */
  async refreshSession(sessionKey: string): Promise<ActiveSession | null> {
    const session = this.sessions.get(sessionKey);

    if (!session) {
      return null;
    }

    try {
      const refreshedSession = await session.provider.refreshSession(session);

      const activeSession: ActiveSession = {
        ...refreshedSession,
        provider: session.provider,
        lastActivity: new Date(),
        signaturesCount: session.signaturesCount
      };

      this.sessions.set(sessionKey, activeSession);
      this.emitEvent('refreshed', sessionKey);

      log.info(`[SessionManager] Sessione rinnovata: ${sessionKey}`);
      return activeSession;
    } catch (error) {
      log.warn(`[SessionManager] Impossibile rinnovare sessione: ${error}`);
      return null;
    }
  }

  // =========================================================================
  // STATO SESSIONE
  // =========================================================================

  /**
   * Ottiene lo stato di una sessione.
   * @param providerId ID del provider
   * @param userId ID utente
   */
  getSessionStatus(providerId: string, userId: string): SessionStatus {
    const sessionKey = this.generateSessionKey(providerId, userId);
    const session = this.sessions.get(sessionKey);

    if (!session) {
      return { active: false };
    }

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

  /**
   * Verifica se esiste una sessione attiva per il provider.
   * @param providerId ID del provider
   */
  hasActiveSession(providerId: string): boolean {
    for (const session of this.sessions.values()) {
      if (
        session.providerId.toUpperCase() === providerId.toUpperCase() &&
        !this.isSessionExpired(session)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Ottiene tutte le sessioni attive.
   */
  getActiveSessions(): ActiveSession[] {
    return Array.from(this.sessions.values()).filter(s => !this.isSessionExpired(s));
  }

  // =========================================================================
  // OPERAZIONI DI FIRMA
  // =========================================================================

  /**
   * Firma un documento usando una sessione esistente.
   * @param sessionKey Chiave della sessione
   * @param request Richiesta di firma
   */
  async signDocument(
    sessionKey: string,
    request: SignDocumentRequest
  ): Promise<SignDocumentResponse> {
    const session = this.sessions.get(sessionKey);

    if (!session) {
      throw new RemoteSignError(
        'Sessione non trovata',
        'SESSION_NOT_FOUND',
        'UNKNOWN',
        false
      );
    }

    if (this.isSessionExpired(session)) {
      await this.closeSession(sessionKey);
      throw new RemoteSignError(
        'Sessione scaduta',
        'SESSION_EXPIRED',
        session.providerId,
        false
      );
    }

    // Esegui la firma
    const response = await session.provider.signDocument(session, request);

    // Aggiorna contatori
    session.signaturesCount++;
    session.lastActivity = new Date();
    if (session.remainingSignatures !== undefined) {
      session.remainingSignatures--;
    }

    this.emitEvent('signature_completed', sessionKey, {
      documentId: request.documentId,
      signaturesCount: session.signaturesCount
    });

    return response;
  }

  /**
   * Firma multipli documenti in batch.
   * @param sessionKey Chiave della sessione
   * @param requests Array di richieste
   * @param onProgress Callback per progresso
   */
  async signMultipleDocuments(
    sessionKey: string,
    requests: SignDocumentRequest[],
    onProgress?: (completed: number, total: number, current?: string) => void
  ): Promise<BatchSignResult[]> {
    const session = this.sessions.get(sessionKey);

    if (!session) {
      throw new RemoteSignError(
        'Sessione non trovata',
        'SESSION_NOT_FOUND',
        'UNKNOWN',
        false
      );
    }

    if (this.isSessionExpired(session)) {
      await this.closeSession(sessionKey);
      throw new RemoteSignError(
        'Sessione scaduta',
        'SESSION_EXPIRED',
        session.providerId,
        false
      );
    }

    // Delega al provider
    const results = await session.provider.signMultipleDocuments(
      session,
      requests,
      onProgress
    );

    // Aggiorna contatori
    const successCount = results.filter(r => r.success).length;
    session.signaturesCount += successCount;
    session.lastActivity = new Date();
    if (session.remainingSignatures !== undefined) {
      session.remainingSignatures -= successCount;
    }

    return results;
  }

  // =========================================================================
  // EVENT HANDLING
  // =========================================================================

  /**
   * Aggiunge un listener per gli eventi di sessione.
   * @param listener Funzione listener
   */
  addEventListener(listener: SessionEventListener): void {
    this.eventListeners.add(listener);
  }

  /**
   * Rimuove un listener.
   * @param listener Funzione listener
   */
  removeEventListener(listener: SessionEventListener): void {
    this.eventListeners.delete(listener);
  }

  /**
   * Emette un evento a tutti i listener.
   */
  private emitEvent(event: SessionEvent, sessionKey: string, data?: any): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event, sessionKey, data);
      } catch (error) {
        log.error(`[SessionManager] Errore in event listener: ${error}`);
      }
    }
  }

  // =========================================================================
  // UTILITY PRIVATE
  // =========================================================================

  /**
   * Genera la chiave univoca per una sessione.
   */
  private generateSessionKey(providerId: string, userId: string): string {
    return `${providerId.toUpperCase()}_${userId}`;
  }

  /**
   * Trova la chiave di sessione per un utente.
   */
  private findSessionKey(providerId: string, userId: string): string | null {
    const key = this.generateSessionKey(providerId, userId);
    return this.sessions.has(key) ? key : null;
  }

  /**
   * Verifica se una sessione è scaduta.
   */
  private isSessionExpired(session: ActiveSession): boolean {
    return new Date() > session.expiresAt;
  }

  /**
   * Avvia l'intervallo di pulizia delle sessioni scadute.
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.CLEANUP_INTERVAL_MS);

    log.info('[SessionManager] Avviato cleanup interval');
  }

  /**
   * Ferma l'intervallo di pulizia.
   */
  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Pulisce le sessioni scadute.
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    const keysToRemove: string[] = [];

    for (const [key, session] of this.sessions) {
      if (now > session.expiresAt) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      log.info(`[SessionManager] Rimozione sessione scaduta: ${key}`);
      this.sessions.delete(key);
      this.emitEvent('expired', key);
    }
  }

  // =========================================================================
  // LIFECYCLE
  // =========================================================================

  /**
   * Distrugge il manager e pulisce le risorse.
   */
  async destroy(): Promise<void> {
    this.stopCleanupInterval();
    await this.closeAllSessions();
    this.eventListeners.clear();
    log.info('[SessionManager] Distrutto');
  }

  /**
   * Ottiene statistiche sul manager.
   */
  getStats(): {
    activeSessions: number;
    totalSignatures: number;
    sessionsByProvider: Record<string, number>;
  } {
    const stats = {
      activeSessions: 0,
      totalSignatures: 0,
      sessionsByProvider: {} as Record<string, number>
    };

    for (const session of this.sessions.values()) {
      if (!this.isSessionExpired(session)) {
        stats.activeSessions++;
        stats.totalSignatures += session.signaturesCount;

        const pid = session.providerId;
        stats.sessionsByProvider[pid] = (stats.sessionsByProvider[pid] || 0) + 1;
      }
    }

    return stats;
  }
}

// Singleton instance
let sessionManagerInstance: RemoteSignSessionManager | null = null;

/**
 * Ottiene l'istanza singleton del SessionManager.
 */
export const getSessionManager = (): RemoteSignSessionManager => {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new RemoteSignSessionManager();
  }
  return sessionManagerInstance;
};

/**
 * Distrugge l'istanza singleton (per testing o cleanup).
 */
export const destroySessionManager = async (): Promise<void> => {
  if (sessionManagerInstance) {
    await sessionManagerInstance.destroy();
    sessionManagerInstance = null;
  }
};
