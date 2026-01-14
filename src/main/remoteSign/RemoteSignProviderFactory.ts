/**
 * RemoteSignProviderFactory.ts
 * Factory per la gestione dei provider di firma remota.
 * Implementa il pattern Factory per creare e gestire istanze dei provider.
 */

import {
  IRemoteSignProvider,
  ProviderConfig,
  ArubaProviderConfig,
  InfoCertProviderConfig,
  NamirialProviderConfig,
  OpenApiProviderConfig,
  RemoteSignError
} from './IRemoteSignProvider';

/**
 * Informazioni su un provider registrato
 */
export interface RegisteredProvider {
  id: string;
  name: string;
  enabled: boolean;
  configured: boolean;
  supportsExtendedSession: boolean;
  supportsBatchSigning: boolean;
}

/**
 * Configurazione completa per tutti i provider
 */
export interface RemoteSignProvidersConfig {
  defaultProvider?: string;
  sessionTimeoutMinutes?: number;
  aruba?: ArubaProviderConfig & { enabled?: boolean };
  infocert?: InfoCertProviderConfig & { enabled?: boolean };
  namirial?: NamirialProviderConfig & { enabled?: boolean };
  openapi?: OpenApiProviderConfig & { enabled?: boolean };
}

/**
 * Factory per la creazione e gestione dei provider di firma remota.
 * Singleton pattern per garantire un'unica istanza.
 */
export class RemoteSignProviderFactory {
  private static instance: RemoteSignProviderFactory;
  private providers: Map<string, IRemoteSignProvider> = new Map();
  private config: RemoteSignProvidersConfig = {};

  private constructor() {}

  /**
   * Ottiene l'istanza singleton della factory
   */
  static getInstance(): RemoteSignProviderFactory {
    if (!RemoteSignProviderFactory.instance) {
      RemoteSignProviderFactory.instance = new RemoteSignProviderFactory();
    }
    return RemoteSignProviderFactory.instance;
  }

  /**
   * Inizializza la factory con la configurazione
   * @param config Configurazione dei provider
   */
  initialize(config: RemoteSignProvidersConfig): void {
    this.config = config;
    // I provider verranno registrati dinamicamente al primo utilizzo
    // o tramite chiamate esplicite a registerProvider
  }

  /**
   * Registra un provider nella factory
   * @param provider Istanza del provider da registrare
   */
  registerProvider(provider: IRemoteSignProvider): void {
    if (!provider.providerId) {
      throw new Error('Provider deve avere un providerId valido');
    }
    this.providers.set(provider.providerId.toUpperCase(), provider);
  }

  /**
   * Rimuove un provider dalla factory
   * @param providerId ID del provider da rimuovere
   */
  unregisterProvider(providerId: string): boolean {
    return this.providers.delete(providerId.toUpperCase());
  }

  /**
   * Ottiene un provider per ID
   * @param providerId ID del provider (es. "ARUBA", "INFOCERT", "NAMIRIAL")
   * @returns Istanza del provider
   * @throws RemoteSignError se il provider non è registrato o non è abilitato
   */
  getProvider(providerId: string): IRemoteSignProvider {
    const normalizedId = providerId.toUpperCase();
    const provider = this.providers.get(normalizedId);

    if (!provider) {
      throw new RemoteSignError(
        `Provider "${providerId}" non registrato. Providers disponibili: ${this.getAvailableProviderIds().join(', ')}`,
        'PROVIDER_NOT_FOUND',
        providerId,
        false
      );
    }

    if (!provider.isConfigured()) {
      throw new RemoteSignError(
        `Provider "${providerId}" non configurato correttamente. Verificare le impostazioni.`,
        'PROVIDER_NOT_CONFIGURED',
        providerId,
        false
      );
    }

    return provider;
  }

  /**
   * Ottiene il provider predefinito dalla configurazione
   * @returns Istanza del provider predefinito
   * @throws RemoteSignError se nessun provider predefinito è configurato
   */
  getDefaultProvider(): IRemoteSignProvider {
    if (!this.config.defaultProvider) {
      throw new RemoteSignError(
        'Nessun provider predefinito configurato',
        'NO_DEFAULT_PROVIDER',
        'UNKNOWN',
        false
      );
    }
    return this.getProvider(this.config.defaultProvider);
  }

  /**
   * Verifica se un provider è registrato
   * @param providerId ID del provider
   */
  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId.toUpperCase());
  }

  /**
   * Ottiene la lista degli ID dei provider registrati
   */
  getAvailableProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Ottiene informazioni su tutti i provider registrati
   */
  getAvailableProviders(): RegisteredProvider[] {
    return Array.from(this.providers.entries()).map(([id, provider]) => ({
      id: provider.providerId,
      name: provider.providerName,
      enabled: this.isProviderEnabled(id),
      configured: provider.isConfigured(),
      supportsExtendedSession: provider.supportsExtendedSession,
      supportsBatchSigning: provider.supportsBatchSigning
    }));
  }

  /**
   * Ottiene solo i provider abilitati e configurati
   */
  getEnabledProviders(): RegisteredProvider[] {
    return this.getAvailableProviders().filter(p => p.enabled && p.configured);
  }

  /**
   * Verifica se un provider è abilitato nella configurazione
   * @param providerId ID del provider
   */
  private isProviderEnabled(providerId: string): boolean {
    const normalizedId = providerId.toLowerCase();
    const providerConfig = this.config[normalizedId as keyof RemoteSignProvidersConfig];

    if (typeof providerConfig === 'object' && providerConfig !== null) {
      return (providerConfig as any).enabled !== false;
    }
    return false;
  }

  /**
   * Ottiene la configurazione di un provider specifico
   * @param providerId ID del provider
   */
  getProviderConfig<T extends ProviderConfig>(providerId: string): T | undefined {
    const normalizedId = providerId.toLowerCase();
    return this.config[normalizedId as keyof RemoteSignProvidersConfig] as T | undefined;
  }

  /**
   * Ottiene il timeout di sessione configurato (in minuti)
   */
  getSessionTimeoutMinutes(): number {
    return this.config.sessionTimeoutMinutes || 45;
  }

  /**
   * Testa la connettività di tutti i provider registrati
   * @returns Mappa con risultati per ogni provider
   */
  async testAllConnections(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [id, provider] of this.providers) {
      try {
        const isConnected = await provider.testConnection();
        results.set(id, isConnected);
      } catch {
        results.set(id, false);
      }
    }

    return results;
  }

  /**
   * Pulisce tutti i provider registrati
   */
  clear(): void {
    this.providers.clear();
  }

  /**
   * Ottiene statistiche sui provider
   */
  getStats(): {
    totalProviders: number;
    enabledProviders: number;
    configuredProviders: number;
  } {
    const providers = this.getAvailableProviders();
    return {
      totalProviders: providers.length,
      enabledProviders: providers.filter(p => p.enabled).length,
      configuredProviders: providers.filter(p => p.configured).length
    };
  }
}

// Export singleton instance helper
export const getProviderFactory = (): RemoteSignProviderFactory => {
  return RemoteSignProviderFactory.getInstance();
};
