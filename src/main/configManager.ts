/**
 * Config Manager - Gestione centralizzata dei file di configurazione
 *
 * PROBLEMA: I file di configurazione nella cartella di installazione
 * vengono sovrascritti ad ogni aggiornamento, perdendo le personalizzazioni.
 *
 * SOLUZIONE: Sistema a due livelli:
 * - File DEFAULT: nella cartella di installazione (sovrascritti ad ogni update)
 * - File PERSONALIZZATI: in cartella dati utente (persistenti tra gli update)
 *   * Windows: C:\ProgramData\MedReportAndSign\assets
 *   * macOS: ~/Library/Application Support/MedReportAndSign/assets
 *   * Linux: ~/.config/MedReportAndSign/assets
 *
 * LOGICA: Cerca prima il file personalizzato, se non esiste usa il default
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * Ottiene la cartella base per i file DEFAULT (dentro l'installazione)
 */
export function getDefaultConfigDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(process.cwd(), 'src/renderer/assets');
}

/**
 * Ottiene la cartella per i file PERSONALIZZATI (persistenti tra update)
 *
 * Windows: C:\ProgramData\MedReportAndSign\assets
 * macOS: ~/Library/Application Support/MedReportAndSign/assets
 * Linux: ~/.config/MedReportAndSign/assets
 *
 * Questa cartella NON viene toccata dagli aggiornamenti
 *
 * NOTA: Stessa struttura di resources/assets nell'installazione
 */
export function getCustomConfigDir(): string {
  let baseDir: string;

  if (process.platform === 'darwin') {
    // macOS: ~/Library/Application Support/MedReportAndSign/assets
    baseDir = path.join(app.getPath('appData'), 'MedReportAndSign', 'assets');
  } else if (process.platform === 'win32') {
    // Windows: C:\ProgramData\MedReportAndSign\assets (condiviso tra tutti gli utenti)
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    baseDir = path.join(programData, 'MedReportAndSign', 'assets');
  } else {
    // Linux: ~/.config/MedReportAndSign/assets
    baseDir = path.join(app.getPath('appData'), 'MedReportAndSign', 'assets');
  }

  return baseDir;
}

/**
 * Ottiene la cartella per le IMMAGINI PERSONALIZZATE (persistenti tra update)
 *
 * Windows: C:\ProgramData\MedReportAndSign\assets\Images
 * macOS: ~/Library/Application Support/MedReportAndSign/assets/Images
 * Linux: ~/.config/MedReportAndSign/assets/Images
 *
 * Questa cartella NON viene toccata dagli aggiornamenti
 *
 * NOTA: Stessa struttura di resources/assets/Images nell'installazione
 */
export function getCustomImagesDir(): string {
  return path.join(getCustomConfigDir(), 'Images');
}

/**
 * Ottiene la cartella base per le immagini DEFAULT (dentro l'installazione)
 */
export function getDefaultImagesDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'Images')
    : path.join(process.cwd(), 'src/renderer/assets/Images');
}

/**
 * Assicura che la cartella di configurazione personalizzata esista
 */
export function ensureCustomConfigDir(): void {
  const customDir = getCustomConfigDir();
  console.log(`🔍 Verifico cartella configurazione: ${customDir}`);
  if (!fs.existsSync(customDir)) {
    try {
      fs.mkdirSync(customDir, { recursive: true });
      console.log(`✓ Creata cartella configurazione personalizzata: ${customDir}`);
    } catch (err) {
      console.error(`❌ ERRORE creazione cartella: ${err}`);
      throw err;
    }
  } else {
    console.log(`✓ Cartella configurazione già esistente: ${customDir}`);
  }
}

/**
 * Assicura che la cartella immagini personalizzate esista
 */
export function ensureCustomImagesDir(): void {
  const customDir = getCustomImagesDir();
  console.log(`🔍 Verifico cartella immagini: ${customDir}`);
  if (!fs.existsSync(customDir)) {
    try {
      fs.mkdirSync(customDir, { recursive: true });
      console.log(`✓ Creata cartella immagini personalizzate: ${customDir}`);
    } catch (err) {
      console.error(`❌ ERRORE creazione cartella immagini: ${err}`);
      throw err;
    }
  } else {
    console.log(`✓ Cartella immagini già esistente: ${customDir}`);
  }
}

/**
 * Ottiene il path completo di un file di configurazione
 *
 * LOGICA:
 * 1. Se esiste il file personalizzato in ProgramData, usa quello
 * 2. Altrimenti usa il file default dall'installazione
 *
 * @param filename Nome del file (es. "sign-settings.json")
 * @returns Path completo del file da usare
 */
export function getConfigPath(filename: string): string {
  const customPath = path.join(getCustomConfigDir(), filename);
  const defaultPath = path.join(getDefaultConfigDir(), filename);

  // Se esiste il file personalizzato, usalo
  if (fs.existsSync(customPath)) {
    console.log(`📁 Caricamento ${filename} personalizzato da: ${customPath}`);
    return customPath;
  }

  // Altrimenti usa il default
  console.log(`📁 Caricamento ${filename} default da: ${defaultPath}`);
  return defaultPath;
}

/**
 * Copia un file di configurazione default nella cartella personalizzata
 * se non esiste già
 *
 * @param filename Nome del file (es. "sign-settings.json")
 * @returns true se il file è stato copiato, false se esisteva già
 */
export function initializeCustomConfig(filename: string): boolean {
  ensureCustomConfigDir();

  const customPath = path.join(getCustomConfigDir(), filename);
  const defaultPath = path.join(getDefaultConfigDir(), filename);

  // Se il file personalizzato esiste già, non fare nulla
  if (fs.existsSync(customPath)) {
    console.log(`✓ File personalizzato già esistente: ${customPath}`);
    return false;
  }

  // Se il file default non esiste, non possiamo copiarlo
  if (!fs.existsSync(defaultPath)) {
    console.warn(`⚠️ File default non trovato: ${defaultPath}`);
    return false;
  }

  // Copia il file default nella cartella personalizzata
  try {
    fs.copyFileSync(defaultPath, customPath);
    console.log(`✓ Copiato ${filename} da default a personalizzato`);
    console.log(`  Sorgente: ${defaultPath}`);
    console.log(`  Destinazione: ${customPath}`);
    return true;
  } catch (err) {
    console.error(`✗ Errore copia ${filename}:`, err);
    return false;
  }
}

/**
 * Verifica se esiste il file marker per forzare il reset delle configurazioni
 *
 * Per forzare il reset, creare un file vuoto:
 * C:\ProgramData\MedReportAndSign\RESET_CONFIG
 *
 * @returns true se il file marker esiste
 */
export function shouldForceReset(): boolean {
  if (process.platform === 'win32') {
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    const markerPath = path.join(programData, 'MedReportAndSign', 'RESET_CONFIG');
    return fs.existsSync(markerPath);
  }
  return false;
}

/**
 * Rimuove il file marker per il reset
 */
export function clearResetMarker(): void {
  if (process.platform === 'win32') {
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    const markerPath = path.join(programData, 'MedReportAndSign', 'RESET_CONFIG');
    if (fs.existsSync(markerPath)) {
      try {
        fs.unlinkSync(markerPath);
        console.log('✓ File marker RESET_CONFIG rimosso');
      } catch (err) {
        console.error('✗ Errore rimozione marker:', err);
      }
    }
  }
}

/**
 * Forza la ricreazione di tutti i file di configurazione personalizzati
 * sovrascrivendoli con quelli default più recenti
 */
export function resetAllConfigs(): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 RESET FORZATO: Sovrascrivo tutti i file personalizzati');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  ensureCustomConfigDir();
  ensureCustomImagesDir();

  // Reset file di configurazione JSON
  const configFiles = [
    'sign-settings.json',
    'company-ui-settings.json',
    'company-footer-settings.json'
  ];

  configFiles.forEach(filename => {
    const customPath = path.join(getCustomConfigDir(), filename);
    const defaultPath = path.join(getDefaultConfigDir(), filename);

    if (fs.existsSync(defaultPath)) {
      try {
        fs.copyFileSync(defaultPath, customPath);
        console.log(`✓ Reset ${filename}`);
      } catch (err) {
        console.error(`✗ Errore reset ${filename}:`, err);
      }
    }
  });

  // Reset immagini
  const imageFiles = [
    'LogoAster.png',
    'FooterAster.png',
    'FooterHW.png',
    'FooterCin.png'
  ];

  imageFiles.forEach(filename => {
    const customPath = path.join(getCustomImagesDir(), filename);
    const defaultPath = path.join(getDefaultImagesDir(), filename);

    if (fs.existsSync(defaultPath)) {
      try {
        fs.copyFileSync(defaultPath, customPath);
        console.log(`✓ Reset ${filename}`);
      } catch (err) {
        console.error(`✗ Errore reset ${filename}:`, err);
      }
    }
  });

  console.log('\n✓ Reset completato!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

/**
 * Inizializza tutti i file di configurazione e immagini personalizzati al primo avvio
 * Questa funzione va chiamata all'avvio dell'app (nel main)
 */
export function initializeAllConfigs(): void {
  // Verifica se è stato richiesto un reset forzato
  if (shouldForceReset()) {
    console.log('\n⚠️ RILEVATO FILE MARKER: C:\\ProgramData\\MedReportAndSign\\RESET_CONFIG');
    console.log('   Eseguo reset forzato delle configurazioni...\n');
    resetAllConfigs();
    clearResetMarker();
    return;
  }
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Inizializzazione file di configurazione e immagini');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Inizializza file di configurazione JSON
  const configFiles = [
    'sign-settings.json',
    'company-ui-settings.json',
    'company-footer-settings.json'
  ];

  let copiedConfigs = 0;
  configFiles.forEach(filename => {
    if (initializeCustomConfig(filename)) {
      copiedConfigs++;
    }
  });

  // Inizializza immagini
  const imageFiles = [
    'LogoAster.png',
    'FooterAster.png',
    'FooterHW.png',
    'FooterCin.png'
  ];

  let copiedImages = 0;
  imageFiles.forEach(filename => {
    if (initializeCustomImage(filename)) {
      copiedImages++;
    }
  });

  // Report risultati
  if (copiedConfigs > 0 || copiedImages > 0) {
    if (copiedConfigs > 0) {
      console.log(`\n✓ ${copiedConfigs} file di configurazione copiati`);
      console.log(`📂 Cartella: ${getCustomConfigDir()}`);
    }
    if (copiedImages > 0) {
      console.log(`\n✓ ${copiedImages} immagini copiate`);
      console.log(`🖼️ Cartella: ${getCustomImagesDir()}`);
    }
    console.log('\n💡 IMPORTANTE: Per personalizzare, modifica i file in:');
    console.log(`   ${getCustomConfigDir()}`);
    console.log('   Questi file NON verranno sovrascritti durante gli aggiornamenti!\n');
  } else {
    console.log('\n✓ Tutti i file personalizzati già presenti');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

/**
 * Carica un file JSON di configurazione con MERGE INTELLIGENTE
 *
 * LOGICA:
 * 1. Carica il file DEFAULT (con tutti i nuovi campi)
 * 2. Se esiste il file PERSONALIZZATO, fa un merge (deep merge per oggetti nested)
 * 3. Risultato: tutti i campi nuovi + personalizzazioni mantenute
 *
 * ESEMPIO:
 * Default:        { "a": 1, "b": 2, "c": 3 }  (versione nuova)
 * Personalizzato: { "a": 999 }                (vecchia versione, solo "a" modificato)
 * Risultato:      { "a": 999, "b": 2, "c": 3 } (merge: "a" personalizzato, "b" e "c" dai default)
 *
 * @param filename Nome del file (es. "sign-settings.json")
 * @param fallbackValue Valore di default se il file non esiste o è corrotto
 * @returns Il contenuto del file con merge, o fallbackValue in caso di errore
 */
export function loadConfigJson<T>(filename: string, fallbackValue: T): T {
  try {
    const defaultPath = path.join(getDefaultConfigDir(), filename);
    const customPath = path.join(getCustomConfigDir(), filename);

    // 1. Carica il file DEFAULT (base con tutti i campi più recenti)
    let baseConfig: T = fallbackValue;
    if (fs.existsSync(defaultPath)) {
      const defaultRaw = fs.readFileSync(defaultPath, 'utf8');
      baseConfig = JSON.parse(defaultRaw) as T;
      console.log(`📁 Caricato ${filename} default da: ${defaultPath}`);
    } else {
      console.warn(`⚠️ File default non trovato: ${defaultPath}, uso fallback`);
    }

    // 2. Se esiste il file PERSONALIZZATO, fa il merge
    if (fs.existsSync(customPath)) {
      const customRaw = fs.readFileSync(customPath, 'utf8');
      const customConfig = JSON.parse(customRaw) as T;
      console.log(`📁 Trovato ${filename} personalizzato da: ${customPath}`);

      // Deep merge: customConfig sovrascrive baseConfig
      const merged = deepMerge(baseConfig, customConfig);
      console.log(`✓ Merge completato: default + personalizzazioni`);
      return merged;
    }

    // 3. Se non esiste personalizzato, usa solo il default
    return baseConfig;
  } catch (err) {
    console.error(`✗ Errore caricamento ${filename}:`, err);
    console.log('  Uso valori fallback');
    return fallbackValue;
  }
}

/**
 * Deep merge di due oggetti (ricorsivo per oggetti nested)
 * customConfig sovrascrive baseConfig, ma mantiene i campi di baseConfig non presenti in custom
 */
function deepMerge<T>(base: T, custom: Partial<T>): T {
  if (typeof base !== 'object' || base === null) {
    return custom as T;
  }

  const result = { ...base };

  for (const key in custom) {
    if (custom.hasOwnProperty(key)) {
      const customValue = custom[key];
      const baseValue = (base as any)[key];

      // Se entrambi sono oggetti, merge ricorsivo
      if (
        typeof customValue === 'object' &&
        customValue !== null &&
        !Array.isArray(customValue) &&
        typeof baseValue === 'object' &&
        baseValue !== null &&
        !Array.isArray(baseValue)
      ) {
        (result as any)[key] = deepMerge(baseValue, customValue);
      } else {
        // Altrimenti sovrascrivi con il valore custom
        (result as any)[key] = customValue;
      }
    }
  }

  return result;
}

/**
 * Salva un file JSON di configurazione nella cartella personalizzata
 *
 * @param filename Nome del file (es. "sign-settings.json")
 * @param data Dati da salvare
 * @returns true se salvato con successo, false altrimenti
 */
export function saveConfigJson<T>(filename: string, data: T): boolean {
  ensureCustomConfigDir();

  const customPath = path.join(getCustomConfigDir(), filename);

  try {
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(customPath, json, 'utf8');
    console.log(`✓ Salvato ${filename} in: ${customPath}`);
    return true;
  } catch (err) {
    console.error(`✗ Errore salvataggio ${filename}:`, err);
    return false;
  }
}

/* ██████ GESTIONE IMMAGINI ██████ */

/**
 * Ottiene il path completo di un'immagine
 *
 * LOGICA (identica a getConfigPath):
 * 1. Se esiste l'immagine personalizzata in ProgramData, usa quella
 * 2. Altrimenti usa l'immagine default dall'installazione
 *
 * @param filename Nome del file immagine (es. "FooterHW.png")
 * @returns Path completo dell'immagine da usare
 */
export function getImagePath(filename: string): string {
  const customPath = path.join(getCustomImagesDir(), filename);
  const defaultPath = path.join(getDefaultImagesDir(), filename);

  // Se esiste l'immagine personalizzata, usala
  if (fs.existsSync(customPath)) {
    console.log(`🖼️ Caricamento ${filename} personalizzato da: ${customPath}`);
    return customPath;
  }

  // Altrimenti usa il default
  console.log(`🖼️ Caricamento ${filename} default da: ${defaultPath}`);
  return defaultPath;
}

/**
 * Copia un'immagine default nella cartella personalizzata se non esiste già
 *
 * @param filename Nome del file immagine (es. "FooterHW.png")
 * @returns true se l'immagine è stata copiata, false se esisteva già
 */
export function initializeCustomImage(filename: string): boolean {
  ensureCustomImagesDir();

  const customPath = path.join(getCustomImagesDir(), filename);
  const defaultPath = path.join(getDefaultImagesDir(), filename);

  // Se l'immagine personalizzata esiste già, non fare nulla
  if (fs.existsSync(customPath)) {
    return false;
  }

  // Se l'immagine default non esiste, non possiamo copiarla
  if (!fs.existsSync(defaultPath)) {
    console.warn(`⚠️ Immagine default non trovata: ${defaultPath}`);
    return false;
  }

  // Copia l'immagine default nella cartella personalizzata
  try {
    fs.copyFileSync(defaultPath, customPath);
    console.log(`✓ Copiata immagine ${filename} in cartella personalizzata`);
    return true;
  } catch (err) {
    console.error(`✗ Errore copia immagine ${filename}:`, err);
    return false;
  }
}
