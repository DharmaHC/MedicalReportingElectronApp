# Installazione su macOS - Guida Completa

Questa guida spiega come installare MedReportAndSign su macOS quando l'app non è firmata digitalmente.

## ⚠️ IMPORTANTE: Problema Noto

**Se l'applicazione non si apre dal Finder ma funziona dal Terminale**, è un problema di sicurezza macOS.

**Soluzione Rapida:**
```bash
# Rimuovi gli attributi di quarantena
sudo xattr -cr /Applications/MedReportAndSign.app

# Lancia dal Terminale
/Applications/MedReportAndSign.app/Contents/MacOS/MedReportAndSign
```

Oppure usa lo script helper `launch-macos.sh` incluso negli artefatti.

---

## Metodo 1: Script Helper Automatico (CONSIGLIATO)

1. Scarica e installa l'app (da ZIP o DMG)
2. Scarica lo script `launch-macos.sh` dagli artefatti
3. Rendi lo script eseguibile e lancialo:

```bash
cd ~/Downloads
chmod +x launch-macos.sh
./launch-macos.sh
```

Lo script rimuoverà automaticamente gli attributi di quarantena e lancerà l'app.

## Metodo 2: Installazione da ZIP

1. Scarica il file `MedReportAndSign-1.0.37-mac-universal.zip` dagli artefatti
2. Estrai il file ZIP facendo doppio click
3. Apri il Terminale e rimuovi gli attributi di quarantena:

```bash
cd ~/Downloads
sudo xattr -cr MedReportAndSign.app
```

4. Sposta l'app nella cartella Applicazioni:

```bash
sudo mv MedReportAndSign.app /Applications/
```

5. Avvia l'applicazione dal Terminale per il primo avvio:

```bash
open /Applications/MedReportAndSign.app
```

## Metodo 2: Installazione da DMG

1. Scarica il file `MedReportAndSign-1.0.37-mac-universal.dmg`
2. Apri il Terminale e rimuovi gli attributi di quarantena dal DMG:

```bash
cd ~/Downloads
sudo xattr -cr MedReportAndSign-1.0.37-mac-universal.dmg
```

3. Monta il DMG facendo doppio click
4. Trascina MedReportAndSign nella cartella Applicazioni
5. Rimuovi gli attributi di quarantena dall'app installata:

```bash
sudo xattr -cr /Applications/MedReportAndSign.app
```

6. Avvia l'app dal Terminale:

```bash
open /Applications/MedReportAndSign.app
```

## Metodo 3: Disabilitare Gatekeeper Temporaneamente

**ATTENZIONE**: Questo metodo disabilita la sicurezza di sistema. Riabilita Gatekeeper dopo l'installazione.

1. Disabilita Gatekeeper:

```bash
sudo spctl --master-disable
```

2. Verifica che sia disabilitato (dovrebbe mostrare "assessments disabled"):

```bash
spctl --status
```

3. Installa normalmente l'applicazione
4. **IMPORTANTE**: Riabilita Gatekeeper dopo l'installazione:

```bash
sudo spctl --master-enable
```

## Metodo 4: Autorizza l'App Manualmente

1. Prova ad aprire l'app normalmente (fallirà)
2. Vai in **Preferenze di Sistema** → **Sicurezza e Privacy**
3. Nella scheda **Generale**, clicca su **Apri comunque** accanto al messaggio su MedReportAndSign
4. Conferma che vuoi aprire l'applicazione

## Metodo 5: Ctrl+Click per Aprire

1. In Finder, naviga in `/Applications`
2. Tieni premuto **Control** e clicca su **MedReportAndSign.app**
3. Seleziona **Apri** dal menu contestuale
4. Clicca **Apri** nella finestra di dialogo

## Verifica Smart Card (Dopo l'Installazione)

Per verificare che l'app possa accedere alle smart card:

```bash
# Lista le librerie PKCS#11 disponibili
ls -la /usr/local/lib/*.dylib

# Verifica i permessi dell'app
codesign -dvvv /Applications/MedReportAndSign.app
```

## Troubleshooting

### L'app non si apre dopo l'installazione

```bash
# Verifica i log di sistema
log stream --predicate 'process == "MedReportAndSign"' --level debug

# Controlla se ci sono attributi di quarantena residui
xattr -l /Applications/MedReportAndSign.app
```

### Errore "app is damaged"

```bash
# Rimuovi tutti gli attributi estesi
sudo xattr -cr /Applications/MedReportAndSign.app

# Forza la rivalidazione
sudo codesign --force --deep --sign - /Applications/MedReportAndSign.app
```

### Problemi di permessi

```bash
# Ripristina i permessi corretti
sudo chmod -R 755 /Applications/MedReportAndSign.app
sudo chown -R $(whoami):staff /Applications/MedReportAndSign.app
```

## Note sulla Firma Digitale

Quest'app non è attualmente firmata con un certificato Apple Developer. Per una distribuzione in produzione, considera:

1. Registrazione Apple Developer Program ($99/anno)
2. Firma dell'applicazione con certificato valido
3. Notarizzazione dell'app tramite Apple
4. Questo eliminerà tutti gli avvisi di sicurezza

## Supporto

Per problemi di installazione, contatta: info@dharmahealthcare.net
