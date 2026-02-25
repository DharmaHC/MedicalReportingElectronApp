# Gestione Release - Versione Windows 7

## Problema Risolto

Prima della configurazione dei canali, **entrambe le versioni** (MAIN e W7) controllavano lo stesso repository GitHub per gli aggiornamenti, causando che:
- ❌ I client W7 ricevevano notifiche di aggiornamento per le release MAIN
- ❌ Le release MAIN e W7 erano indistinguibili
- ❌ Non era possibile rilasciare versioni separate

## Soluzione: Canali Separati

Ora le versioni usano **canali separati**:

| Versione | Canale | File Cercato | Descrizione |
|----------|--------|--------------|-------------|
| **MAIN** | `latest` | `latest.yml` o `latest-windows.yml` | Versione standard per Windows 10/11 |
| **W7** | `win7` | `win7.yml` o `win7-windows.yml` | Versione compatibile Windows 7 |

## Configurazione Applicata

### 1. Package.json (W7)
```json
"publish": [
  {
    "provider": "github",
    "owner": "DharmaHC",
    "repo": "MedicalReportingElectronApp",
    "channel": "win7"  // ← Canale separato!
  }
]
```

### 2. src/main/index.ts (W7)
```typescript
function setupAutoUpdater() {
  // ...

  // Configura il canale "win7" per cercare aggiornamenti separati
  autoUpdater.channel = 'win7';
  log.info(`AutoUpdater configurato per il canale: ${autoUpdater.channel}`);

  autoUpdater.checkForUpdatesAndNotify();
  // ...
}
```

## Come Pubblicare le Release

### Release MAIN (Windows 10/11)

1. **Build** nella directory principale:
   ```bash
   cd D:\Lavoro\Sviluppo\MedicalReportingAPP\MedReportAndSign\MedReportAndSign
   npm run build
   npm run dist
   ```

2. **Publish** su GitHub:
   ```bash
   # Il file viene caricato come "latest"
   # I client MAIN cercheranno "latest.yml"
   ```

3. **Creare Release su GitHub**:
   - Tag: `v1.0.37` (versione normale)
   - Title: `Release v1.0.37`
   - Caricare il file `.exe` generato

### Release W7 (Windows 7)

1. **Build** nella directory W7:
   ```bash
   cd D:\Lavoro\Sviluppo\MedicalReportingAPP\MedReportAndSign\MedReportAndSignW7
   npm run build
   npm run dist
   ```

2. **Publish** su GitHub:
   ```bash
   # Il file viene caricato come "win7"
   # I client W7 cercheranno "win7.yml"
   ```

3. **Creare Release su GitHub**:
   - Tag: `v1.0.37-win7` (versione con suffisso)
   - Title: `Release v1.0.37 - Windows 7`
   - Caricare il file `.exe` generato

## Struttura Release su GitHub

Dopo aver pubblicato entrambe le versioni, il repository GitHub avrà:

```
Repository: DharmaHC/MedicalReportingElectronApp
├── Releases
│   ├── v1.0.37 (MAIN)
│   │   ├── MedReportAndSign-Setup-1.0.37.exe
│   │   └── latest.yml (generato da electron-builder)
│   │
│   └── v1.0.37-win7 (W7)
│       ├── MedReportAndSign-Setup-1.0.37.exe
│       └── win7.yml (generato da electron-builder)
```

## Come Funziona l'Aggiornamento

### Client MAIN
1. Avvia l'app
2. `autoUpdater` controlla il canale `"latest"` (default)
3. Scarica `latest.yml` da GitHub
4. Confronta versione locale con versione remota
5. Se disponibile, scarica e installa l'aggiornamento

### Client W7
1. Avvia l'app
2. `autoUpdater` controlla il canale `"win7"`
3. Scarica `win7.yml` da GitHub
4. Confronta versione locale con versione remota
5. Se disponibile, scarica e installa l'aggiornamento

## Verifica Configurazione

Per verificare che la configurazione sia corretta:

### W7
```bash
# Controlla che channel sia impostato
grep -A 5 "autoUpdater.channel" src/main/index.ts

# Output atteso:
# autoUpdater.channel = 'win7';
```

### MAIN
```bash
# Controlla che NON ci sia channel impostato (usa default "latest")
grep -A 5 "autoUpdater.checkForUpdatesAndNotify" src/main/index.ts

# Output atteso: NO "autoUpdater.channel" prima di checkForUpdatesAndNotify
```

## Test in Locale

### Testare W7
1. Build dell'app W7
2. Installare l'app
3. Controllare i log in `%APPDATA%/MedReportAndSign/logs/main.log`:
   ```
   AutoUpdater configurato per il canale: win7
   Checking for update...
   ```

### Testare MAIN
1. Build dell'app MAIN
2. Installare l'app
3. Controllare i log - NON deve apparire "canale: win7"

## Note Importanti

⚠️ **ATTENZIONE**:
- Le versioni MAIN e W7 **devono avere version number diversi** nei tag GitHub
- Usa sempre il suffisso `-win7` per i tag W7 (es. `v1.0.37-win7`)
- I file `.yml` vengono generati automaticamente da electron-builder durante il build
- NON modificare manualmente i file `.yml`

✅ **Vantaggi**:
- Release separate per MAIN e W7
- Nessuna interferenza tra versioni
- Stesso repository GitHub
- Gestione semplificata

## Rollback

Se serve fare rollback a una versione precedente:

1. **Eliminare la release problematica** da GitHub
2. **Creare una nuova release** con version number incrementato
3. I client scaricheranno automaticamente la nuova versione

## Troubleshooting

### W7 sta scaricando release MAIN

**Problema**: La configurazione del canale non è corretta

**Soluzione**:
1. Verifica che `autoUpdater.channel = 'win7'` sia presente in `src/main/index.ts`
2. Rebuild l'app W7
3. Reinstalla sui client

### Release non trovata

**Problema**: Il file `.yml` non è presente su GitHub

**Soluzione**:
1. Verifica che electron-builder abbia generato il file
2. Controlla che la release sia pubblica (non draft)
3. Verifica il nome del file yml (`win7.yml` o `win7-windows.yml`)

## Data Configurazione
**5 Dicembre 2025**

## Versione Attuale
- **MAIN**: 1.0.37
- **W7**: 1.0.37 (canale: win7)
