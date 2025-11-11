# Build per Mac SENZA Apple Developer Account

Questa guida spiega come creare build per macOS **senza** un Apple Developer Account a pagamento.

## ⚠️ Importante: Cosa Devi Sapere

Senza code signing e notarizzazione:
- ✅ L'app **funzionerà** normalmente
- ❌ macOS Gatekeeper **bloccherà** l'apertura dell'app
- 👤 Gli utenti dovranno **manualmente** autorizzare l'app

## 🚀 Come Fare il Build

### Su macOS

```bash
# 1. Installa le dipendenze
npm install

# 2. Build dell'applicazione
npm run build

# 3. Disabilita code signing e build per Mac
export CSC_IDENTITY_AUTO_DISCOVERY=false
npx electron-builder --mac
```

### Su Windows (PowerShell)

```powershell
# 1. Installa le dipendenze
npm install

# 2. Build dell'applicazione
npm run build

# 3. Disabilita code signing e build per Mac
$env:CSC_IDENTITY_AUTO_DISCOVERY="false"
npx electron-builder --mac
```

### Su Windows (CMD)

```cmd
# 1. Installa le dipendenze
npm install

# 2. Build dell'applicazione
npm run build

# 3. Disabilita code signing e build per Mac
set CSC_IDENTITY_AUTO_DISCOVERY=false
npx electron-builder --mac
```

## 📦 File Generati

Troverai i file in `dist/`:

```
dist/
├── MedReportAndSign-1.0.36-mac-x64.dmg     (Intel Mac)
├── MedReportAndSign-1.0.36-mac-arm64.dmg   (Apple Silicon)
└── MedReportAndSign-1.0.36-mac-x64.zip
```

## 👥 Istruzioni per gli Utenti Mac

Quando gli utenti provano ad aprire l'app non firmata, vedranno questo errore:

> **"MedReportAndSign non può essere aperto perché proviene da uno sviluppatore non identificato"**

### Soluzione 1: Tasto Destro + Apri

1. Individua l'app nella cartella Applicazioni
2. **Tasto destro** (o Control+Click) sull'icona
3. Seleziona **"Apri"** dal menu
4. Clicca **"Apri"** nella finestra di conferma
5. L'app si aprirà e macOS la ricorderà per il futuro

### Soluzione 2: Preferenze di Sistema

1. Prova ad aprire l'app (verrà bloccata)
2. Vai in **Preferenze di Sistema** → **Sicurezza e Privacy**
3. Nella scheda **Generale**, vedrai un messaggio sull'app bloccata
4. Clicca su **"Apri comunque"**
5. Conferma cliccando **"Apri"**

### Soluzione 3: Rimuovi Quarantena (Avanzato)

Gli utenti esperti possono rimuovere l'attributo di quarantena dal Terminale:

```bash
xattr -d com.apple.quarantine /Applications/MedReportAndSign.app
```

## 📄 Template Email per gli Utenti

```
Gentile utente,

Per aprire MedReportAndSign su macOS, segui questi passaggi:

1. Sposta l'app nella cartella Applicazioni
2. Fai click destro sull'icona dell'app
3. Seleziona "Apri" dal menu
4. Clicca "Apri" nella finestra di conferma

Questa procedura è necessaria solo la prima volta. macOS ricorderà
la tua scelta per le aperture successive.

L'app non è firmata digitalmente da Apple poiché non disponiamo di
un account Apple Developer, ma è sicura e pienamente funzionante.

Per domande o assistenza: info@dharmahealthcare.net
```

## 🎯 Quando Conviene Questo Approccio

### ✅ Adatto per:

- **Testing interno** del team di sviluppo
- **Distribuzione a clienti specifici** che possono ricevere istruzioni
- **Demo** e presentazioni
- **Ambienti controllati** (es: studi medici con IT proprio)
- **Budget limitato** (risparmio $99/anno)

### ❌ Non adatto per:

- **Distribuzione pubblica** su larga scala
- **App Store** (richiede obbligatoriamente firma)
- **Clienti non tecnici** che potrebbero confondersi
- **Aziende** con policy di sicurezza stricte
- **Conformità** a standard che richiedono app firmate

## 🔒 Sicurezza

⚠️ **Importante**: L'assenza di code signing non rende l'app **insicura**, significa solo che:
- Apple non ha verificato l'identità dello sviluppatore
- macOS non può verificare che l'app non sia stata modificata dopo la build

L'app è sicura se:
- Gli utenti la scaricano da fonte fidata (te)
- Il download avviene tramite HTTPS
- Verifichi l'integrità con checksum (opzionale)

## 📊 Confronto: Con vs Senza Account Developer

| Aspetto | Senza Account | Con Account Developer |
|---------|---------------|------------------------|
| **Costo** | Gratuito | $99/anno |
| **Gatekeeper** | Bloccato | Accettato |
| **Prima apertura** | Procedura manuale | Apre direttamente |
| **Aggiornamenti** | Funzionano | Funzionano meglio |
| **Fiducia utente** | Minore | Maggiore |
| **App Store** | ❌ No | ✅ Sì |
| **Notarizzazione** | ❌ No | ✅ Sì |
| **Tempo build** | Veloce | +5-10 min (notarizzazione) |

## 🔄 Passare al Code Signing in Futuro

Se in futuro decidi di ottenere un Apple Developer Account:

1. Segui le istruzioni in [MAC_CODE_SIGNING_SETUP.md](MAC_CODE_SIGNING_SETUP.md)
2. Configura le variabili d'ambiente nel file `.env`
3. Rimuovi la variabile `CSC_IDENTITY_AUTO_DISCOVERY=false`
4. Rifai il build normalmente: `npx electron-builder --mac`

La transizione è semplice e non richiede modifiche al codice.

## 📞 Supporto

Per problemi o domande:
- Repository: [MedicalReportingElectronApp](https://github.com/DharmaHC/MedicalReportingElectronApp)
- Email: info@dharmahealthcare.net

---

**TL;DR**: Puoi fare build per Mac senza account developer. Gli utenti dovranno solo fare "Tasto destro → Apri" la prima volta.
