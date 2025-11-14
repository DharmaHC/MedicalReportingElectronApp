# Installazione macOS - Procedura Rapida

## 📦 Download

Scarica da GitHub Actions → Artifacts → "macos-builds":
- `MedReportAndSign-[versione]-mac-universal.zip` **(consigliato)**
- `launch-macos.sh`

## ⚡ Installazione Veloce

```bash
# 1. Estrai ZIP
cd ~/Downloads
unzip MedReportAndSign-*.zip

# 2. Rimuovi quarantena
sudo xattr -cr MedReportAndSign.app

# 3. Sposta in Applicazioni
sudo mv MedReportAndSign.app /Applications/

# 4. Lancia
open /Applications/MedReportAndSign.app
```

**Alternativa con script:**
```bash
chmod +x launch-macos.sh
./launch-macos.sh
```

## 🔧 Configurazione Smart Card

Dopo il primo avvio, modifica il path della libreria PKCS#11:

```bash
# Apri file configurazione
open -a TextEdit ~/Library/Application\ Support/MedReportAndSign/assets/sign-settings.json
```

Modifica la riga `pkcs11Lib` con il path corretto per la tua smart card:

**Bit4id:**
```json
"pkcs11Lib": "/usr/local/lib/libbit4xpki.dylib"
```

**Aruba:**
```json
"pkcs11Lib": "/usr/local/lib/libbit4ipki.dylib"
```

**InfoCert:**
```json
"pkcs11Lib": "/usr/local/lib/libASEP11.dylib"
```

## 📍 Posizioni File

**Configurazioni:**
```
~/Library/Application Support/MedReportAndSign/assets/
```

**Log:**
```
~/Library/Logs/MedReportAndSign/main.log
```

## ⚠️ Problemi Comuni

**App non si apre dal Finder:**
```bash
sudo xattr -cr /Applications/MedReportAndSign.app
/Applications/MedReportAndSign.app/Contents/MacOS/MedReportAndSign
```

**Smart card non rilevata:**
- Verifica driver smart card installati
- Controlla path `pkcs11Lib` in `sign-settings.json`
- Testa con: `pkcs11-tool --module /percorso/libreria.dylib --list-slots`

## 🎯 Configurazioni Pantamedica

Questa build include preset Pantamedica:
- ✅ Logo e colori Pantamedica
- ✅ Server API: `http://ORTASA-DHARMA-SRV:8090/api/`
- ✅ LogiPACS: `http://192.9.200.102:81/LPW/Display`
- ✅ Sistema ID esterno: RemoteEyeLite

Per modificare, edita:
```bash
~/Library/Application Support/MedReportAndSign/assets/company-ui-settings.json
```

---

**Supporto:** info@dharmahealthcare.net
