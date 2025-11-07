/**
 * Config Manager - Gestione centralizzata dei file di configurazione
 *
 * PROBLEMA: I file di configurazione nella cartella di installazione (Program Files)
 * vengono sovrascritti ad ogni aggiornamento, perdendo le personalizzazioni.
 *
 * SOLUZIONE: Sistema a due livelli:
 * - File DEFAULT: nella cartella di installazione (sovrascritti ad ogni update)
 * - File PERSONALIZZATI: in C:\ProgramData\MedReportAndSign (persistenti tra gli update)
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
 * Windows: C:\ProgramData\MedReportAndSign\config
 * Questa cartella NON viene toccata dagli aggiornamenti
 */
export function getCustomConfigDir(): string {
  // ProgramData è la cartella standard per dati condivisi tra tutti gli utenti
  // su Windows è C:\ProgramData
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  return path.join(programData, 'MedReportAndSign', 'config');
}

/**
 * Assicura che la cartella di configurazione personalizzata esista
 */
export function ensureCustomConfigDir(): void {
  const customDir = getCustomConfigDir();
  if (!fs.existsSync(customDir)) {
    fs.mkdirSync(customDir, { recursive: true });
    console.log(`✓ Creata cartella configurazione personalizzata: ${customDir}`);
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
 * Inizializza tutti i file di configurazione personalizzati al primo avvio
 * Questa funzione va chiamata all'avvio dell'app (nel main)
 */
export function initializeAllConfigs(): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Inizializzazione file di configurazione');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const configFiles = [
    'sign-settings.json',
    'company-ui-settings.json',
    'company-footer-settings.json'
  ];

  let copiedFiles = 0;
  configFiles.forEach(filename => {
    if (initializeCustomConfig(filename)) {
      copiedFiles++;
    }
  });

  if (copiedFiles > 0) {
    console.log(`\n✓ ${copiedFiles} file copiati nella cartella personalizzata`);
    console.log(`📂 Cartella configurazione: ${getCustomConfigDir()}`);
    console.log('\n💡 IMPORTANTE: Per personalizzare la configurazione, modifica i file in:');
    console.log(`   ${getCustomConfigDir()}`);
    console.log('   Questi file NON verranno sovrascritti durante gli aggiornamenti!\n');
  } else {
    console.log('\n✓ Tutti i file personalizzati già presenti');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

/**
 * Carica un file JSON di configurazione
 *
 * @param filename Nome del file (es. "sign-settings.json")
 * @param fallbackValue Valore di default se il file non esiste o è corrotto
 * @returns Il contenuto del file parsato, o fallbackValue in caso di errore
 */
export function loadConfigJson<T>(filename: string, fallbackValue: T): T {
  try {
    const configPath = getConfigPath(filename);

    if (!fs.existsSync(configPath)) {
      console.warn(`⚠️ File non trovato: ${configPath}, uso fallback`);
      return fallbackValue;
    }

    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`✗ Errore caricamento ${filename}:`, err);
    console.log('  Uso valori fallback');
    return fallbackValue;
  }
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
