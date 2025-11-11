# Guida: Code Signing e Notarizzazione per macOS

Questa guida spiega come configurare il code signing e la notarizzazione per distribuire l'applicazione MedReportAndSign su macOS.

## Prerequisiti

### 1. Account Apple Developer
- Iscriviti al programma [Apple Developer](https://developer.apple.com/programs/)
- Costo: $99/anno
- Necessario per ottenere certificati di code signing e per la notarizzazione

### 2. Certificato Developer ID
Devi ottenere un certificato **Developer ID Application** da Apple:

1. Vai su [Apple Developer Certificates](https://developer.apple.com/account/resources/certificates/list)
2. Clicca su "+" per creare un nuovo certificato
3. Seleziona **"Developer ID Application"**
4. Segui le istruzioni per generare una Certificate Signing Request (CSR) dal Keychain Access
5. Carica la CSR e scarica il certificato
6. Importa il certificato nel Keychain Access del Mac

### 3. App-Specific Password
Crea una password specifica per l'app per la notarizzazione:

1. Vai su [appleid.apple.com](https://appleid.apple.com)
2. Sezione "Sicurezza" → "Password specifiche per app"
3. Genera una nuova password con nome "MedReportAndSign Notarization"
4. **Salva questa password** (verrà mostrata una sola volta)

---

## Configurazione Variabili d'Ambiente

### Per Build in Locale

Crea un file `.env` nella root del progetto (NON committare questo file su Git):

```bash
# Apple Developer Account
APPLE_ID=tuo-email@esempio.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX

# Opzionale: specifica l'identità del certificato
# Lascia vuoto o rimuovi per usare il primo certificato "Developer ID Application" trovato
# CSC_NAME="Developer ID Application: Nome Azienda (TEAM_ID)"
```

### Come trovare il TEAM_ID
1. Vai su [Apple Developer Account](https://developer.apple.com/account/)
2. Il Team ID è visibile nella sezione "Membership" (es: A1B2C3D4E5)

### Per Build in CI/CD (GitHub Actions)

Aggiungi questi secrets nel tuo repository GitHub:
- Settings → Secrets and variables → Actions → New repository secret

```
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_TEAM_ID
```

---

## Build dell'Applicazione

### 1. Installa le dipendenze
```bash
npm install
```

### 2. Build dell'applicazione
```bash
npm run build
```

### 3. Build del pacchetto macOS

#### Senza Code Signing (per test)
```bash
# Disabilita temporaneamente la firma
export CSC_IDENTITY_AUTO_DISCOVERY=false
npx electron-builder --mac
```

#### Con Code Signing e Notarizzazione
```bash
# Assicurati che le variabili d'ambiente siano configurate
npx electron-builder --mac
```

Il processo eseguirà automaticamente:
1. ✅ Build dell'applicazione
2. ✅ Code signing con il certificato Developer ID
3. ✅ Creazione del DMG
4. ✅ Notarizzazione con Apple (può richiedere alcuni minuti)
5. ✅ Stapling del ticket di notarizzazione

---

## Architetture Supportate

La configurazione attuale supporta:
- **x64** (Intel Mac)
- **arm64** (Apple Silicon M1/M2/M3)

I file generati saranno:
```
dist/
├── MedReportAndSign-1.0.36-mac-x64.dmg
├── MedReportAndSign-1.0.36-mac-arm64.dmg
└── MedReportAndSign-1.0.36.dmg (universal)
```

---

## Percorsi dei File di Configurazione su Mac

Dopo l'installazione, i file di configurazione si trovano in:

### Application Support (configurazioni persistenti)
```
~/Library/Application Support/MedReportAndSign/assets/
```

Qui troverai:
- `company-ui-settings.json` - Configurazioni UI personalizzate

### Logs
```
~/Library/Logs/MedReportAndSign/
```

### Cache
```
~/Library/Caches/MedReportAndSign/
```

---

## Verifica della Firma e Notarizzazione

### Verifica Code Signing
```bash
codesign -dv --verbose=4 /Applications/MedReportAndSign.app
```

Output atteso:
```
Executable=/Applications/MedReportAndSign.app/Contents/MacOS/MedReportAndSign
...
Authority=Developer ID Application: Dharma Healthcare (TEAM_ID)
...
```

### Verifica Notarizzazione
```bash
spctl -a -vv /Applications/MedReportAndSign.app
```

Output atteso:
```
/Applications/MedReportAndSign.app: accepted
source=Notarized Developer ID
```

---

## Entitlements Configurati

I file `resources/entitlements.mac.plist` includono i seguenti permessi:

- ✅ **Hardened Runtime** - Sicurezza avanzata richiesta da macOS 10.14+
- ✅ **Network Client/Server** - Per comunicazioni API
- ✅ **File Access** - Lettura/scrittura file selezionati dall'utente
- ✅ **USB Device Access** - Per smartcard/token USB (firma digitale)
- ✅ **Print** - Per stampa PDF

---

## Troubleshooting

### Errore: "No signing identity found"
**Soluzione**: Verifica di aver installato correttamente il certificato "Developer ID Application" nel Keychain Access.

```bash
# Verifica certificati disponibili
security find-identity -v -p codesigning
```

### Errore: "Notarization failed"
**Soluzione**:
1. Verifica che `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` e `APPLE_TEAM_ID` siano corretti
2. Controlla i log di notarizzazione:
```bash
xcrun notarytool log <submission-id> --apple-id <APPLE_ID> --password <PASSWORD> --team-id <TEAM_ID>
```

### Build solo per testing (senza firma)
```bash
# Disabilita code signing temporaneamente
export CSC_IDENTITY_AUTO_DISCOVERY=false
npx electron-builder --mac
```

### L'app viene bloccata da Gatekeeper
**Soluzione**: Se l'app non è notarizzata, l'utente deve:
1. Aprire Preferenze di Sistema → Sicurezza e Privacy
2. Cliccare "Apri comunque" nella sezione Generale

---

## CI/CD con GitHub Actions

Esempio di workflow per build automatica su Mac:

```yaml
name: Build Mac

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-mac:
    runs-on: macos-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      run: npm ci

    - name: Build application
      run: npm run build

    - name: Build and notarize Mac app
      env:
        APPLE_ID: ${{ secrets.APPLE_ID }}
        APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
        APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
      run: npx electron-builder --mac

    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: mac-dmg
        path: dist/*.dmg
```

---

## Note di Sicurezza

⚠️ **IMPORTANTE**:
- NON committare mai `.env` su Git
- NON condividere `APPLE_APP_SPECIFIC_PASSWORD`
- Usa GitHub Secrets per CI/CD
- Ruota le password periodicamente

Aggiungi al `.gitignore`:
```
.env
.env.local
*.p12
*.cer
```

---

## Risorse Utili

- [Electron Builder - Code Signing](https://www.electron.build/code-signing)
- [Apple Notarization](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Hardened Runtime](https://developer.apple.com/documentation/security/hardened_runtime)
- [Entitlements](https://developer.apple.com/documentation/bundleresources/entitlements)

---

## Supporto

Per problemi o domande:
- Repository: [MedicalReportingElectronApp](https://github.com/DharmaHC/MedicalReportingElectronApp)
- Email: info@dharmahealthcare.net
