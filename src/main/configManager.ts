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
 * Rileva se l'installazione è perMachine o perUser su Windows
 *
 * perMachine: Installato in C:\Program Files o C:\Program Files (x86)
 * perUser: Installato in %LOCALAPPDATA%\Programs
 *
 * @returns true se perMachine, false se perUser
 */
export function isPerMachineInstallation(): boolean {
  if (process.platform !== 'win32') {
    return false; // Non applicabile su altri OS
  }

  const exePath = app.getPath('exe').toLowerCase();

  // Installazioni perMachine tipicamente in Program Files
  if (exePath.includes('\\program files\\') || exePath.includes('\\program files (x86)\\')) {
    return true;
  }

  // Installazioni perUser tipicamente in %LOCALAPPDATA%\Programs
  if (exePath.includes('\\appdata\\local\\programs\\')) {
    return false;
  }

  // Fallback: considera perMachine se non siamo sicuri
  return true;
}

/**
 * Ottiene la cartella per i file PERSONALIZZATI (persistenti tra update)
 *
 * Windows perMachine: C:\ProgramData\MedReportAndSign\assets (condiviso tra utenti)
 * Windows perUser: %APPDATA%\MedReportAndSign\assets (specifico utente)
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
    // Windows: distingue tra perMachine e perUser
    if (isPerMachineInstallation()) {
      // perMachine: C:\ProgramData\MedReportAndSign\assets (condiviso tra tutti gli utenti)
      const programData = process.env.ProgramData || 'C:\\ProgramData';
      baseDir = path.join(programData, 'MedReportAndSign', 'assets');
      console.log(`🔍 Rilevata installazione perMachine, configurazioni in: ${baseDir}`);
    } else {
      // perUser: %APPDATA%\MedReportAndSign\assets (specifico per l'utente corrente)
      baseDir = path.join(app.getPath('appData'), 'MedReportAndSign', 'assets');
      console.log(`🔍 Rilevata installazione perUser, configurazioni in: ${baseDir}`);
    }
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
 * Ottiene la vecchia cartella di configurazione (struttura precedente con subfolder 'config')
 *
 * Windows (perMachine): C:\ProgramData\MedReportAndSign\config
 * Windows (perUser): %APPDATA%\MedReportAndSign\config
 * macOS: ~/Library/Application Support/MedReportAndSign/config
 * Linux: ~/.config/MedReportAndSign/config
 */
function getOldConfigDir(): string {
  if (process.platform === 'darwin') {
    return path.join(app.getPath('appData'), 'MedReportAndSign', 'config');
  } else if (process.platform === 'win32') {
    // Windows: usa la cartella appropriata in base al tipo di installazione
    if (isPerMachineInstallation()) {
      const programData = process.env.ProgramData || 'C:\\ProgramData';
      return path.join(programData, 'MedReportAndSign', 'config');
    } else {
      return path.join(app.getPath('appData'), 'MedReportAndSign', 'config');
    }
  } else {
    return path.join(app.getPath('appData'), 'MedReportAndSign', 'config');
  }
}

/**
 * Ottiene la vecchia cartella immagini (struttura precedente)
 */
function getOldImagesDir(): string {
  return path.join(getOldConfigDir(), 'Images');
}

/**
 * Su Windows, controlla la cartella utente (perUser) per la vecchia struttura
 * Restituisce sempre %APPDATA%\MedReportAndSign\config
 */
function getOldConfigDirPerUser(): string | null {
  if (process.platform === 'win32') {
    return path.join(app.getPath('appData'), 'MedReportAndSign', 'config');
  }
  return null;
}

/**
 * Su Windows, controlla la cartella condivisa (perMachine) per la vecchia struttura
 * Restituisce sempre C:\ProgramData\MedReportAndSign\config
 *
 * IMPORTANTE: Questa funzione restituisce SEMPRE la posizione ProgramData,
 * indipendentemente dal tipo di installazione corrente. Serve per migrare
 * i file da una vecchia installazione perMachine a una nuova perUser.
 */
function getOldConfigDirPerMachine(): string | null {
  if (process.platform === 'win32') {
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    return path.join(programData, 'MedReportAndSign', 'config');
  }
  return null;
}

/**
 * Migra un singolo file dalla vecchia alla nuova struttura
 *
 * @param oldPath Path del file nella vecchia struttura
 * @param newPath Path del file nella nuova struttura
 * @param filename Nome del file (per logging)
 * @returns true se migrato con successo, false altrimenti
 */
function migrateFile(oldPath: string, newPath: string, filename: string): boolean {
  try {
    // Se il file nuovo esiste già, non sovrascrivere (preserva personalizzazioni più recenti)
    if (fs.existsSync(newPath)) {
      console.log(`  ⏭️  ${filename} già esistente nella nuova posizione, skip`);
      return false;
    }

    // Se il file vecchio non esiste, niente da migrare
    if (!fs.existsSync(oldPath)) {
      return false;
    }

    // Copia il file nella nuova posizione
    fs.copyFileSync(oldPath, newPath);
    console.log(`  ✓ Migrato: ${filename}`);
    console.log(`    Da: ${oldPath}`);
    console.log(`    A:  ${newPath}`);
    return true;
  } catch (err) {
    console.error(`  ✗ Errore migrazione ${filename}:`, err);
    return false;
  }
}

/**
 * Migra tutti i file di configurazione e immagini dalla vecchia struttura
 *
 * VECCHIA STRUTTURA:
 * - Windows perMachine: C:\ProgramData\MedReportAndSign\config\*.json
 * - Windows perUser: %APPDATA%\MedReportAndSign\config\*.json
 * - macOS: ~/Library/Application Support/MedReportAndSign/config\*.json
 *
 * NUOVA STRUTTURA:
 * - Windows perMachine: C:\ProgramData\MedReportAndSign\assets\*.json
 * - Windows perUser: %APPDATA%\MedReportAndSign\assets\*.json
 * - macOS: ~/Library/Application Support/MedReportAndSign/assets\*.json
 *
 * NOTA: Su Windows, controlla entrambe le posizioni (perMachine e perUser)
 * per gestire i casi di aggiornamento da un tipo di installazione all'altro
 *
 * @returns true se è stata effettuata una migrazione, false altrimenti
 */
export function migrateOldConfigStructure(): boolean {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Verifica presenza vecchia struttura configurazioni');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  let migrationPerformed = false;
  const oldDirs: Array<{ path: string; type: string }> = [];

  // 1. Su Windows, controlla SEMPRE la cartella ProgramData (vecchia installazione perMachine)
  //    Questo è importante per migrare da perMachine a perUser
  const oldConfigDirMachine = getOldConfigDirPerMachine();
  if (oldConfigDirMachine && fs.existsSync(oldConfigDirMachine)) {
    console.log(`\n📂 Trovata vecchia struttura (perMachine): ${oldConfigDirMachine}`);
    oldDirs.push({ path: oldConfigDirMachine, type: 'perMachine (ProgramData)' });
  }

  // 2. Su Windows, controlla SEMPRE la cartella AppData (vecchia installazione perUser)
  //    Questo è importante per migrare da perUser a perMachine o per upgrade perUser
  const oldConfigDirUser = getOldConfigDirPerUser();
  if (oldConfigDirUser && fs.existsSync(oldConfigDirUser) && oldConfigDirUser !== oldConfigDirMachine) {
    console.log(`\n📂 Trovata vecchia struttura (perUser): ${oldConfigDirUser}`);
    oldDirs.push({ path: oldConfigDirUser, type: 'perUser (AppData)' });
  }

  // 3. Controlla anche la posizione basata sull'installazione corrente (fallback)
  const oldConfigDirCurrent = getOldConfigDir();
  const alreadyChecked = oldDirs.some(d => d.path === oldConfigDirCurrent);
  if (!alreadyChecked && fs.existsSync(oldConfigDirCurrent)) {
    console.log(`\n📂 Trovata vecchia struttura (corrente): ${oldConfigDirCurrent}`);
    oldDirs.push({ path: oldConfigDirCurrent, type: 'current' });
  }

  // Se non ci sono vecchie strutture, niente da migrare
  if (oldDirs.length === 0) {
    console.log('\n✓ Nessuna vecchia struttura trovata, niente da migrare');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    return false;
  }

  // Assicura che le nuove directory esistano
  ensureCustomConfigDir();
  ensureCustomImagesDir();

  // 3. Migra i file da ciascuna vecchia directory
  for (const oldDir of oldDirs) {
    console.log(`\n🔄 Migrazione da ${oldDir.type}: ${oldDir.path}`);
    console.log('─────────────────────────────────────────────────');

    let filesMigrated = 0;

    // Lista dei file di configurazione da migrare
    const configFiles = [
      'sign-settings.json',
      'company-ui-settings.json',
      'company-footer-settings.json'
    ];

    // Migra file JSON
    console.log('\n📄 File di configurazione:');
    for (const filename of configFiles) {
      const oldPath = path.join(oldDir.path, filename);
      const newPath = path.join(getCustomConfigDir(), filename);
      if (migrateFile(oldPath, newPath, filename)) {
        filesMigrated++;
        migrationPerformed = true;
      }
    }

    // Lista delle immagini da migrare
    const imageFiles = [
      'LogoAster.png',
      'FooterAster.png',
      'FooterHW.png',
      'FooterCin.png'
    ];

    // Migra immagini
    console.log('\n🖼️  Immagini:');
    const oldImagesDir = path.join(oldDir.path, 'Images');
    if (fs.existsSync(oldImagesDir)) {
      for (const filename of imageFiles) {
        const oldPath = path.join(oldImagesDir, filename);
        const newPath = path.join(getCustomImagesDir(), filename);
        if (migrateFile(oldPath, newPath, filename)) {
          filesMigrated++;
          migrationPerformed = true;
        }
      }
    } else {
      console.log('  ℹ️  Cartella Images non trovata nella vecchia struttura');
    }

    // 4. Se la migrazione è andata a buon fine, rimuovi la vecchia directory
    if (filesMigrated > 0) {
      console.log(`\n🗑️  Rimozione vecchia struttura: ${oldDir.path}`);
      try {
        // Rimuovi ricorsivamente la vecchia directory
        fs.rmSync(oldDir.path, { recursive: true, force: true });
        console.log(`  ✓ Vecchia directory rimossa con successo`);
      } catch (err) {
        console.error(`  ⚠️  Impossibile rimuovere la vecchia directory:`, err);
        console.log(`  ℹ️  Puoi rimuoverla manualmente: ${oldDir.path}`);
      }
    } else {
      console.log(`\n  ℹ️  Nessun file migrato da ${oldDir.type}, directory lasciata invariata`);
    }
  }

  // 5. Report finale
  if (migrationPerformed) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ MIGRAZIONE COMPLETATA CON SUCCESSO');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📂 Nuova posizione configurazioni:');
    console.log(`   ${getCustomConfigDir()}`);
    console.log('\n🖼️  Nuova posizione immagini:');
    console.log(`   ${getCustomImagesDir()}`);
    console.log('\n💡 Le personalizzazioni sono state preservate!\n');
  } else {
    console.log('\n✓ Nessuna migrazione necessaria');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  return migrationPerformed;
}

/**
 * Inizializza tutti i file di configurazione e immagini personalizzati al primo avvio
 * Questa funzione va chiamata all'avvio dell'app (nel main)
 */
export function initializeAllConfigs(): void {
  // STEP 0: Migra la vecchia struttura se esiste
  migrateOldConfigStructure();

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

/**
 * Sincronizza un singolo file di configurazione con i nuovi default
 *
 * Se il file personalizzato esiste ma manca di alcuni parametri presenti nel default,
 * li aggiunge e salva il file aggiornato.
 *
 * @param filename Nome del file (es. "sign-settings.json")
 * @returns true se il file è stato aggiornato, false se non necessario o errore
 */
function syncSingleConfigWithDefaults(filename: string): boolean {
  try {
    const defaultPath = path.join(getDefaultConfigDir(), filename);
    const customPath = path.join(getCustomConfigDir(), filename);

    // Se non esiste il file default, niente da fare
    if (!fs.existsSync(defaultPath)) {
      return false;
    }

    // Se non esiste il file personalizzato, niente da sincronizzare
    if (!fs.existsSync(customPath)) {
      return false;
    }

    // Carica entrambi i file
    const defaultRaw = fs.readFileSync(defaultPath, 'utf8');
    const defaultConfig = JSON.parse(defaultRaw);

    const customRaw = fs.readFileSync(customPath, 'utf8');
    const customConfig = JSON.parse(customRaw);

    // Conta i parametri prima del merge
    const defaultKeys = Object.keys(defaultConfig);
    const customKeys = Object.keys(customConfig);

    // Trova i parametri mancanti nel file personalizzato
    const missingKeys = defaultKeys.filter(key => !(key in customConfig));

    if (missingKeys.length === 0) {
      console.log(`  ✓ ${filename}: già sincronizzato (${customKeys.length} parametri)`);
      return false;
    }

    // Esegui il merge: default come base, custom sovrascrive
    const merged = deepMerge(defaultConfig, customConfig);

    // Salva il file aggiornato
    const json = JSON.stringify(merged, null, 2);
    fs.writeFileSync(customPath, json, 'utf8');

    console.log(`  ✓ ${filename}: aggiunti ${missingKeys.length} nuovi parametri`);
    console.log(`    Nuovi: ${missingKeys.join(', ')}`);

    return true;
  } catch (err) {
    console.error(`  ✗ Errore sync ${filename}:`, err);
    return false;
  }
}

/**
 * Sincronizza TUTTI i file di configurazione personalizzati con i nuovi default
 *
 * Questa funzione:
 * 1. Controlla ogni file personalizzato esistente
 * 2. Lo confronta con il corrispondente default
 * 3. Aggiunge eventuali nuovi parametri dal default
 * 4. Salva il file aggiornato su disco
 *
 * IMPORTANTE: Preserva tutte le personalizzazioni esistenti!
 * Solo i parametri MANCANTI vengono aggiunti dai default.
 *
 * @returns Numero di file aggiornati
 */
export function syncAllConfigsWithDefaults(): number {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 Sincronizzazione configurazioni con nuovi default');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const configFiles = [
    'sign-settings.json',
    'company-ui-settings.json',
    'company-footer-settings.json',
    'api-config.json'
  ];

  let updatedCount = 0;

  for (const filename of configFiles) {
    if (syncSingleConfigWithDefaults(filename)) {
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    console.log(`\n✅ ${updatedCount} file aggiornati con nuovi parametri`);
    console.log(`📂 Cartella: ${getCustomConfigDir()}`);
  } else {
    console.log('\n✓ Tutti i file già sincronizzati');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return updatedCount;
}

/**
 * Migrazione: corregge URL Namirial errati nei file di configurazione.
 * eSignAnyWhere (api.esignanywhere.net) è un prodotto DIVERSO da Namirial SWS.
 * L'URL corretto per firma remota è sws.firmacerta.it.
 */
export function migrateNamirialUrl(): boolean {
  const customPath = path.join(getCustomConfigDir(), 'sign-settings.json');

  if (!fs.existsSync(customPath)) {
    return false;
  }

  try {
    const raw = fs.readFileSync(customPath, 'utf8');
    const settings = JSON.parse(raw);

    // Controlla se l'URL Namirial è quello errato (eSignAnyWhere)
    const currentUrl = settings?.remoteSign?.namirial?.baseUrl || '';
    const wrongUrls = [
      'api.esignanywhere.net',
      'esignanywhere.net',
      'esignanywhere.com'
    ];

    const isWrongUrl = wrongUrls.some(wrong => currentUrl.includes(wrong));

    let needsSave = false;

    if (isWrongUrl) {
      console.log('🔧 Migrazione URL Namirial: correzione URL errato');
      console.log(`   Vecchio: ${currentUrl}`);

      // Correggi l'URL
      if (!settings.remoteSign) settings.remoteSign = {};
      if (!settings.remoteSign.namirial) settings.remoteSign.namirial = {};

      settings.remoteSign.namirial.baseUrl = 'https://sws.firmacerta.it/SignEngineWeb';

      console.log(`   Nuovo: ${settings.remoteSign.namirial.baseUrl}`);
      needsSave = true;
    }

    // Aggiungi opzioni proxy se mancanti
    if (settings.remoteSign?.namirial) {
      if (settings.remoteSign.namirial.proxyUrl === undefined) {
        settings.remoteSign.namirial.proxyUrl = '';
        console.log('   Aggiunto: proxyUrl (vuoto = usa proxy sistema)');
        needsSave = true;
      }
      if (settings.remoteSign.namirial.noProxy === undefined) {
        settings.remoteSign.namirial.noProxy = false;
        console.log('   Aggiunto: noProxy (false = usa proxy se configurato)');
        needsSave = true;
      }
    }

    if (needsSave) {
      fs.writeFileSync(customPath, JSON.stringify(settings, null, 2), 'utf8');
      console.log('✅ Configurazione Namirial aggiornata!');
      return true;
    }
  } catch (err) {
    console.error('Errore migrazione URL Namirial:', err);
  }

  return false;
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
