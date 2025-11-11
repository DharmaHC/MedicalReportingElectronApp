# Build Cross-Platform: Come Creare Build per Mac da Windows

## 🚫 Il Problema

**Non puoi fare build per macOS direttamente da Windows.**

Electron-builder richiede un sistema macOS per creare pacchetti `.dmg` e `.app` per Mac, a causa delle limitazioni di Apple e degli strumenti nativi necessari.

```
❌ Da Windows → macOS build: NON SUPPORTATO
✅ Da Windows → Windows build: OK
✅ Da Windows → Linux build: OK (con Docker)
✅ Da macOS → Tutti i sistemi: OK
```

---

## ✅ Soluzioni Disponibili

### Soluzione 1: GitHub Actions (CONSIGLIATA) 🌟

**Vantaggi**:
- ✅ Completamente gratuito
- ✅ Build automatiche su ogni push/tag
- ✅ Supporta tutte le piattaforme (Windows, Mac, Linux)
- ✅ Artifact scaricabili
- ✅ Rilasci automatici su GitHub

#### Setup Rapido

1. **I workflow sono già pronti!** Li ho creati in `.github/workflows/`:
   - `build-mac.yml` - Solo macOS
   - `build-all-platforms.yml` - Windows + Mac + Linux

2. **Pusha il codice su GitHub**:
   ```bash
   git add .github/workflows/
   git commit -m "Add GitHub Actions workflows for multi-platform builds"
   git push
   ```

3. **Avvia il build manualmente**:
   - Vai su GitHub → Actions
   - Seleziona "Build All Platforms" o "Build macOS"
   - Clicca "Run workflow"
   - Scegli se firmare l'app Mac (opzionale)
   - Clicca "Run workflow"

4. **Scarica i build**:
   - Aspetta che il workflow finisca (5-10 minuti)
   - Clicca sul workflow completato
   - Sezione "Artifacts" in basso
   - Scarica `macos-builds.zip`, `windows-builds.zip`, ecc.

#### Build Automatici con Tag

Per creare una release automatica:

```bash
# Incrementa versione in package.json
npm version patch  # o minor, o major

# Crea un tag
git tag v1.0.38
git push --tags

# GitHub Actions farà automaticamente:
# 1. Build per Windows, Mac e Linux
# 2. Crea una GitHub Release
# 3. Carica tutti i file .exe, .dmg, .deb, .AppImage
```

---

### Soluzione 2: Accesso a un Mac Fisico

Se hai accesso a un Mac (tuo, di un amico, dell'ufficio):

1. **Clona il repository sul Mac**:
   ```bash
   git clone https://github.com/DharmaHC/MedicalReportingElectronApp.git
   cd MedicalReportingElectronApp
   ```

2. **Installa dipendenze**:
   ```bash
   npm install
   ```

3. **Build**:
   ```bash
   npm run build
   export CSC_IDENTITY_AUTO_DISCOVERY=false
   npx electron-builder --mac
   ```

4. **Recupera i file** da `dist/`:
   - Copia via USB/rete
   - O carica su cloud storage
   - O committa su GitHub release

---

### Soluzione 3: VM macOS (Hackintosh)

**⚠️ Attenzione**: Viola i termini di servizio di Apple!

Puoi installare macOS in una VM su Windows usando:
- VMware Workstation + macOS Unlocker
- VirtualBox + guide online

**Svantaggi**:
- ❌ Illegale secondo i ToS Apple
- ❌ Prestazioni scarse
- ❌ Configurazione complicata
- ❌ Instabile
- ❌ Non consigliato per produzione

---

### Soluzione 4: Servizi Cloud a Pagamento

Se hai budget e vuoi soluzione professionale:

#### a) MacStadium / MacinCloud
- Mac reali in cloud
- ~$50-100/mese
- Accesso SSH o desktop remoto

#### b) CircleCI / Travis CI
- Include runner macOS gratuiti (limitati)
- Simile a GitHub Actions

---

## 📊 Confronto Soluzioni

| Soluzione | Costo | Legalità | Difficoltà | Tempo Setup |
|-----------|-------|----------|------------|-------------|
| **GitHub Actions** | 🆓 Gratis | ✅ Legale | ⭐ Facile | 5 min |
| **Mac fisico** | Mac esistente | ✅ Legale | ⭐⭐ Medio | 10 min |
| **VM macOS** | 🆓 Gratis | ❌ Illegale | ⭐⭐⭐⭐ Difficile | 2-3 ore |
| **Cloud Mac** | 💰 $50-100/mese | ✅ Legale | ⭐⭐ Medio | 30 min |

---

## 🎯 Raccomandazione

**Per il tuo caso, usa GitHub Actions**:

1. È gratis
2. È legale
3. È automatico
4. Supporta tutte le piattaforme
5. Non richiede hardware aggiuntivo

### Setup Immediato

```bash
# 1. Committa i workflow
git add .github/
git commit -m "Add cross-platform build workflows"
git push

# 2. Vai su GitHub → Actions → Run workflow
# 3. Aspetta 10 minuti
# 4. Scarica i build da Artifacts
```

---

## 📖 Documentazione GitHub Actions

### Come Vedere i Logs

1. Vai su **GitHub** → **Actions**
2. Clicca sul workflow in esecuzione
3. Clicca su un job (es: "build-macos")
4. Espandi gli step per vedere i log

### Come Configurare Code Signing (Opzionale)

Per firmare l'app Mac automaticamente su GitHub Actions:

1. Vai su **GitHub** → **Settings** → **Secrets and variables** → **Actions**
2. Aggiungi i seguenti secrets:
   - `APPLE_ID`
   - `APPLE_APP_SPECIFIC_PASSWORD`
   - `APPLE_TEAM_ID`
3. Quando avvii il workflow, seleziona "Sign macOS app: true"

### Limiti GitHub Actions (Free)

- ✅ **2000 minuti/mese** per runner Linux/Windows
- ✅ **1000 minuti/mese** per runner macOS (contano 10x)
- ✅ Un build completo (Windows + Mac + Linux) usa ~15-20 minuti macOS
- ✅ Circa **50 build/mese** con piano gratuito

Se hai account a pagamento GitHub Pro/Team:
- 3000 minuti macOS/mese (Pro)
- 5000 minuti macOS/mese (Team)

---

## 🔧 Troubleshooting

### "Workflow not found"

**Soluzione**: Assicurati di aver committato e pushato i file `.github/workflows/`.

### "npm ci failed"

**Soluzione**: Verifica che `package-lock.json` sia committato.

### "Build failed on macOS"

**Soluzione**: Controlla i log. Potrebbe essere:
- Dipendenze native incompatibili
- Certificati mancanti (se provi a firmare)
- Errori di build TypeScript

### "Artifacts expired"

**Soluzione**: Gli artifacts durano 30 giorni. Scaricali prima che scadano, o crea una GitHub Release per conservarli permanentemente.

---

## 📦 Build Locale per Altre Piattaforme

Puoi comunque fare build locale per le piattaforme compatibili:

```bash
# Da Windows
npm run build
npx electron-builder --win        # ✅ OK
npx electron-builder --linux      # ✅ OK (con Docker)
npx electron-builder --mac        # ❌ ERRORE

# Da macOS
npm run build
npx electron-builder --mac        # ✅ OK
npx electron-builder --win        # ✅ OK
npx electron-builder --linux      # ✅ OK

# Da Linux
npm run build
npx electron-builder --linux      # ✅ OK
npx electron-builder --win        # ✅ OK (con wine)
npx electron-builder --mac        # ❌ ERRORE
```

---

## 🚀 Quick Start: Il Modo Più Veloce

```bash
# 1. Committa i workflow
git add .github/workflows/
git commit -m "Add multi-platform build workflows"
git push origin main

# 2. Vai su GitHub
#    → Repository → Actions → "Build All Platforms" → "Run workflow"

# 3. Aspetta 10 minuti ☕

# 4. Scarica i build
#    → Workflow completato → Artifacts → Download
```

---

## 📞 Supporto

Per problemi con GitHub Actions:
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Electron Builder CI Documentation](https://www.electron.build/multi-platform-build)

Per problemi specifici del progetto:
- Repository: [MedicalReportingElectronApp](https://github.com/DharmaHC/MedicalReportingElectronApp)
- Email: info@dharmahealthcare.net

---

**TL;DR**: Non puoi fare build per Mac da Windows. Usa GitHub Actions (gratis) per build automatici su Mac in cloud.
