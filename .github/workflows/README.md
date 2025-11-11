# GitHub Actions Workflows

Questo progetto include workflow automatici per build multi-piattaforma.

## 📋 Workflow Disponibili

### 1. Build All Platforms
**File**: `build-all-platforms.yml`

Crea build per **Windows, macOS e Linux** in parallelo.

**Trigger**:
- Push di tag (es: `v1.0.38`)
- Manuale da GitHub Actions UI

**Uso manuale**:
1. Vai su **Actions** → **Build All Platforms**
2. Clicca **Run workflow**
3. (Opzionale) Spunta "Sign macOS app" se hai configurato i secrets
4. Clicca **Run workflow**

**Output**:
- `windows-builds` → `.exe`
- `macos-builds` → `.dmg` + `.zip`
- `linux-builds` → `.AppImage` + `.deb`

---

### 2. Build macOS Only
**File**: `build-mac.yml`

Crea build solo per **macOS** (utile per test rapidi).

**Trigger**:
- Push di tag (es: `v1.0.38`)
- Manuale da GitHub Actions UI

**Uso manuale**:
1. Vai su **Actions** → **Build macOS**
2. Clicca **Run workflow**
3. (Opzionale) Spunta "Enable code signing"
4. Clicca **Run workflow**

**Output**:
- `macos-builds` → `.dmg` + `.zip`

---

## 🚀 Quick Start

### Build Manuale

```bash
# 1. Vai su GitHub
open https://github.com/DharmaHC/MedicalReportingElectronApp/actions

# 2. Seleziona un workflow
# 3. Click "Run workflow" → "Run workflow"
# 4. Aspetta 10 minuti
# 5. Scarica gli artifacts
```

### Build Automatica con Tag

```bash
# Incrementa versione
npm version patch  # oppure: minor, major

# Pusha il tag
git push --tags

# GitHub Actions farà automaticamente:
# - Build per tutte le piattaforme
# - Crea GitHub Release
# - Upload dei file
```

---

## 🔐 Code Signing per macOS

Per abilitare il code signing automatico per macOS:

1. **Aggiungi secrets su GitHub**:
   - Settings → Secrets → Actions → New repository secret

   Crea questi 3 secrets:
   - `APPLE_ID` → La tua email Apple Developer
   - `APPLE_APP_SPECIFIC_PASSWORD` → Password app-specific
   - `APPLE_TEAM_ID` → Il tuo Team ID Apple

2. **Avvia il workflow con "Sign macOS app: true"**

Senza questi secrets, l'app verrà creata ma non firmata (va bene per test).

---

## ⏱️ Tempo di Esecuzione

Tempi approssimativi:

- **Build All Platforms**: ~10-15 minuti
  - Windows: ~5 min
  - macOS: ~8 min (+ notarizzazione se abilitata)
  - Linux: ~4 min

- **Build macOS Only**: ~8 min
  - Senza firma: ~6 min
  - Con firma + notarizzazione: ~12-15 min

---

## 📦 Dove Trovare i Build

### Artifacts (Build Manuali)

1. Vai su **Actions**
2. Clicca sul workflow completato
3. Scorri fino a **Artifacts**
4. Scarica gli zip

**Nota**: Gli artifacts scadono dopo 30 giorni.

### Releases (Build con Tag)

1. Vai su **Releases**
2. Trova la release con il tag (es: `v1.0.38`)
3. Scarica i file dalla sezione **Assets**

**Nota**: Le release non scadono mai.

---

## 🐛 Troubleshooting

### Build Fallisce su macOS

**Errore: "No signing identity found"**
- Se NON vuoi firmare: assicurati che `CSC_IDENTITY_AUTO_DISCOVERY=false` sia impostato
- Se vuoi firmare: configura i secrets come indicato sopra

**Errore: "Notarization failed"**
- Verifica che i secrets `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` siano corretti
- Controlla i log del workflow per dettagli

### Build Fallisce su Windows

**Errore: "npm ci failed"**
- Assicurati che `package-lock.json` sia committato

### Build Fallisce su Linux

**Errore: "Cannot build deb package"**
- Verifica che tutte le dipendenze siano compatibili con Linux

---

## 📚 Documentazione Completa

Per maggiori dettagli, vedi:
- [BUILD_CROSS_PLATFORM.md](../../BUILD_CROSS_PLATFORM.md) - Come fare build cross-platform
- [MAC_CODE_SIGNING_SETUP.md](../../MAC_CODE_SIGNING_SETUP.md) - Setup code signing per macOS
- [BUILD_MAC_WITHOUT_SIGNING.md](../../BUILD_MAC_WITHOUT_SIGNING.md) - Build Mac senza account developer

---

## 💰 Limiti GitHub Actions

**Piano Free**:
- 2000 minuti/mese per Windows/Linux
- 1000 minuti/mese per macOS (contano 10x)
- ~50 build completi al mese

**Se superi i limiti**:
- Upgrade a GitHub Pro ($4/mese)
- O fai build meno frequenti
- O disabilita alcune piattaforme

---

## 🎯 Best Practices

1. **Usa tag per release pubbliche**:
   ```bash
   git tag v1.0.38
   git push --tags
   ```

2. **Usa workflow manuali per test**:
   - Build All Platforms → Test prima di release
   - Build macOS Only → Test rapidi Mac

3. **Scarica gli artifacts subito**:
   - Scadono dopo 30 giorni
   - O crea una release per conservarli

4. **Verifica i build localmente prima di pushare**:
   - Windows: `npx electron-builder --win`
   - Evita build falliti su GitHub Actions

---

Per domande: info@dharmahealthcare.net
