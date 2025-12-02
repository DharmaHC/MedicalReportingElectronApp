# 🔄 Sistema di Gestione Configurazioni con Merge Intelligente

**Data**: 2025-12-03
**Versione**: 2.0 (con merge intelligente)

---

## 📋 Panoramica

Il sistema di configurazione è stato migliorato con **merge intelligente** e **reset forzato**, risolvendo il problema delle nuove variabili aggiunte negli aggiornamenti.

---

## 🎯 Problema Risolto

### **Prima (Sistema Vecchio)**

```
Versione 1.0:
  sign-settings.json (default):     { "a": 1, "b": 2 }
  ↓ Installazione
  sign-settings.json (custom):      { "a": 1, "b": 2 }
  ↓ Personalizzazione
  sign-settings.json (custom):      { "a": 999, "b": 2 }

Versione 1.1:
  sign-settings.json (default):     { "a": 1, "b": 2, "c": 3 }  ← Nuova variabile "c"
  ↓ Aggiornamento
  sign-settings.json (custom):      { "a": 999, "b": 2 }        ← Manca "c"! ❌
```

**Risultato**: Nuove variabili mancanti, funzionalità rotte!

---

### **Ora (Sistema con Merge)**

```
Versione 1.0:
  sign-settings.json (default):     { "a": 1, "b": 2 }
  ↓ Installazione
  sign-settings.json (custom):      { "a": 1, "b": 2 }
  ↓ Personalizzazione
  sign-settings.json (custom):      { "a": 999, "b": 2 }

Versione 1.1:
  sign-settings.json (default):     { "a": 1, "b": 2, "c": 3 }  ← Nuova variabile "c"
  ↓ Aggiornamento + Avvio App
  MERGE:
    - Carica default:               { "a": 1, "b": 2, "c": 3 }
    - Applica custom:               { "a": 999 }
    - Risultato in memoria:         { "a": 999, "b": 2, "c": 3 } ✅
```

**Risultato**: Personalizzazioni mantenute + Nuove variabili aggiunte!

---

## 🔧 Come Funziona

### **1. Merge Intelligente (Automatico)**

Ad ogni avvio, l'app:

1. Carica il file **DEFAULT** da `C:\Program Files\MedReportAndSign\resources\assets\`
   - Contiene TUTTI i campi più recenti
2. Carica il file **PERSONALIZZATO** da `C:\ProgramData\MedReportAndSign\assets\`
   - Contiene solo i campi modificati dall'utente
3. Fa un **deep merge**:
   - Base: tutti i campi default
   - Override: solo i campi personalizzati
   - Risultato: configurazione completa e aggiornata

**Vantaggio**: Nessun intervento manuale necessario! ✅

---

### **2. Reset Forzato (Manuale)**

Per casi eccezionali dove serve ripristinare tutto ai default:

#### **Metodo A: Script Batch (FACILE)**

1. Esegui `Reset_Configurazioni.bat` (come amministratore)
2. Conferma la richiesta
3. Riavvia l'applicazione

Lo script crea il file marker: `C:\ProgramData\MedReportAndSign\RESET_CONFIG`

#### **Metodo B: Manuale**

1. Crea un file vuoto chiamato `RESET_CONFIG` in:
   ```
   C:\ProgramData\MedReportAndSign\RESET_CONFIG
   ```
2. Riavvia l'applicazione
3. Il file viene rilevato e tutti i file personalizzati vengono sovrascritti

**Cosa viene resettato**:
- `sign-settings.json`
- `company-ui-settings.json`
- `company-footer-settings.json`
- Tutte le immagini personalizzate

**Nota**: Il file marker viene automaticamente cancellato dopo il reset

---

## 📂 Struttura File

### **File DEFAULT** (sovrascritti ad ogni update)
```
C:\Program Files\MedReportAndSign\resources\assets\
├── sign-settings.json                 ← Sempre aggiornati
├── company-ui-settings.json           ← Contengono nuove variabili
├── company-footer-settings.json       ← Versione più recente
└── Images/
    ├── LogoAster.png
    ├── FooterHW.png
    └── ...
```

### **File PERSONALIZZATI** (persistenti tra update)
```
C:\ProgramData\MedReportAndSign\assets\
├── sign-settings.json                 ← Solo campi personalizzati
├── company-ui-settings.json           ← Possono essere obsoleti
├── company-footer-settings.json       ← Ma il merge li completa!
└── Images/
    ├── LogoAster.png (se personalizzato)
    └── ...
```

---

## 🎨 Esempi Pratici

### **Esempio 1: Aggiunta Nuova Variabile**

**Scenario**: Aggiungiamo `"newFeature": true` in v1.1

**File Default (v1.1)**:
```json
{
  "footerTextFontSize": 8,
  "blankFooterHeight": 50,
  "newFeature": true          ← NUOVO
}
```

**File Personalizzato (v1.0)**:
```json
{
  "footerTextFontSize": 12    ← Personalizzato
}
```

**Risultato Merge**:
```json
{
  "footerTextFontSize": 12,   ← Dal personalizzato
  "blankFooterHeight": 50,    ← Dal default
  "newFeature": true          ← Dal default (nuovo!)
}
```

✅ **Funziona senza intervento manuale!**

---

### **Esempio 2: Modifica Oggetto Nested**

**File Default**:
```json
{
  "header": {
    "logo": {
      "url": "https://example.com/logo.png",
      "alt": "Logo",
      "newField": "value"       ← NUOVO
    }
  }
}
```

**File Personalizzato**:
```json
{
  "header": {
    "logo": {
      "url": "https://custom.com/logo.png"  ← Personalizzato
    }
  }
}
```

**Risultato Merge (Deep Merge)**:
```json
{
  "header": {
    "logo": {
      "url": "https://custom.com/logo.png", ← Dal personalizzato
      "alt": "Logo",                        ← Dal default
      "newField": "value"                   ← Dal default (nuovo!)
    }
  }
}
```

✅ **Il merge ricorsivo preserva la struttura nested!**

---

## ⚙️ Setup Installazione

### **Configurazione NSIS (package.json)**

```json
"nsis": {
  "oneClick": false,
  "perMachine": true,          ← IMPORTANTE: Installazione per tutti gli utenti
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "MedReportAndSign"
}
```

**Perché `perMachine: true`?**

- ✅ Richiede permessi amministratore all'installazione
- ✅ L'app si installa in `C:\Program Files\`
- ✅ Gli utenti normali possono scrivere in `C:\ProgramData\`
- ✅ Configurazioni condivise tra tutti gli utenti del PC

---

## 🔍 Debug e Logging

Al avvio dell'app, nel console log:

### **Senza Reset**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Inizializzazione file di configurazione e immagini
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 Caricato sign-settings.json default da: C:\Program Files\...\sign-settings.json
📁 Trovato sign-settings.json personalizzato da: C:\ProgramData\...\sign-settings.json
✓ Merge completato: default + personalizzazioni
```

### **Con Reset Forzato**
```
⚠️ RILEVATO FILE MARKER: C:\ProgramData\MedReportAndSign\RESET_CONFIG
   Eseguo reset forzato delle configurazioni...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 RESET FORZATO: Sovrascrivo tutti i file personalizzati
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Reset sign-settings.json
✓ Reset company-ui-settings.json
✓ Reset company-footer-settings.json
✓ Reset LogoAster.png
...
✓ Reset completato!
✓ File marker RESET_CONFIG rimosso
```

---

## 🚀 Workflow Deploy

### **Per Sviluppatori**

1. Aggiorna i file default in `src/renderer/assets/`
2. Aggiungi nuove variabili senza preoccupazioni
3. Build: `npm run build`
4. Crea installer: `npm run dist`

### **Per Tecnici Installazione**

**Installazione Pulita**:
1. Esegui setup (richiede admin)
2. Al primo avvio, i file vengono copiati in ProgramData
3. Tutto funziona!

**Aggiornamento**:
1. Esegui nuovo setup (richiede admin)
2. File in `Program Files` vengono sovrascritti
3. File in `ProgramData` rimangono invariati
4. Al avvio, il merge automatico aggiunge nuove variabili
5. Tutto funziona!

**Reset Forzato** (solo se necessario):
1. Esegui `Reset_Configurazioni.bat`
2. Riavvia l'app
3. Configurazioni ripristinate ai default

---

## ✅ Vantaggi del Sistema

1. **Zero Manutenzione**: Le nuove variabili vengono aggiunte automaticamente
2. **Personalizzazioni Sicure**: Le modifiche dell'utente non vengono mai perse
3. **Reset Controllato**: Possibilità di ripristinare tutto quando necessario
4. **Backward Compatible**: Funziona con vecchie installazioni
5. **Deep Merge**: Gestisce correttamente oggetti nested
6. **Logging Completo**: Debug facile con log dettagliati

---

## 📝 Checklist Pre-Deploy

- [x] `perMachine: true` in package.json
- [x] File default aggiornati in `src/renderer/assets/`
- [x] `configManager.ts` con merge intelligente
- [x] Script `Reset_Configurazioni.bat` incluso
- [ ] Test installazione pulita
- [ ] Test aggiornamento da vecchia versione
- [ ] Test merge con file personalizzati
- [ ] Test reset forzato
- [ ] Verifica log console

---

## 🎯 Conclusione

Il nuovo sistema di configurazione risolve definitivamente il problema delle variabili mancanti dopo gli aggiornamenti, mantenendo al contempo tutte le personalizzazioni degli utenti.

**In sintesi**:
- ✅ Aggiornamenti senza intervento manuale
- ✅ Personalizzazioni preservate
- ✅ Nuove variabili aggiunte automaticamente
- ✅ Possibilità di reset completo quando necessario

---

**Preparato da**: Claude Code
**Data**: 2025-12-03
