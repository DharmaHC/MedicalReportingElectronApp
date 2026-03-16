# Guida Rilascio Release su GitHub

## Architettura Branch

| Branch | Electron | Target OS | productName | Installer | Auto-update channel |
|--------|----------|-----------|-------------|-----------|---------------------|
| `main` | ^36.x | Windows 10/11 | MedReport | `MedReport-Setup-X.X.X.exe` | `latest` (latest.yml) |
| `w7` | ^22.3.27 | Windows 7+ | MedReportAndSign | `MedReportAndSign-Setup-X.X.X.exe` | `win7` (win7.yml) |

Entrambi i branch sono nello **stesso repository**. Il branch `w7` usa Electron 22 (ultimo a supportare Windows 7).

---

## Procedura Completa di Release

### 1. Preparazione (branch main)

```bash
cd D:\Lavoro\Sviluppo\MedicalReportingAPP\MedReportAndSign\MedReportAndSign
git checkout main
```

Aggiornare `version` in `package.json` (es. `"1.0.72"` -> `"1.0.73"`).

Se ci sono modifiche al submodule MedicalReportingAPI:
```bash
cd MedicalReportingAPI
git add -A && git commit -m "Descrizione modifiche API"
git push
cd ..
```

### 2. Commit e Push su main

```bash
git add package.json src/ MedicalReportingAPI
git commit -m "v1.0.73: Descrizione modifiche"
git push origin main
```

### 3. Applicare le modifiche a w7

```bash
git checkout w7
git cherry-pick main --no-commit
```

Risolvere eventuali conflitti nel `package.json`:
- Mantenere `"productName": "MedReportAndSign"`
- Mantenere `"channel": "win7"`
- Mantenere `"electron": "^22.3.27"`
- Aggiornare `"version"` alla nuova versione

```bash
git add -A
git commit -m "v1.0.73: Descrizione modifiche"
```

### 4. Build e Installer W7 (ATTENZIONE - LEGGERE SEZIONE CRITICA SOTTO)

```bash
# OBBLIGATORIO: reinstallare node_modules con Electron 22
rm -rf node_modules
npm install --no-package-lock

# OBBLIGATORIO: rimuovere il symlink auto-referenziale creato da npm 10+
rm -f node_modules/medreportandsign

# Verificare la versione di Electron
node -e "console.log(require('electron/package.json').version)"
# DEVE mostrare 22.3.27, NON 36.x!

# Build
npm run build
npm run dist
```

Verifica output: `dist/MedReportAndSign-Setup-1.0.73.exe` e `dist/win7.yml`.
Verifica che il log mostri `electron=22.3.27` (NON 36.x).

### 5. Release W7 su GitHub

```bash
gh release create v1.0.73-win7 \
  --target w7 \
  --title "v1.0.73 (Windows 7)" \
  --notes "Changelog qui" \
  dist/MedReportAndSign-Setup-1.0.73.exe dist/win7.yml
```

### 6. Push W7 e ripristino main

```bash
git push origin w7
git checkout main

# Ripristinare node_modules per main (Electron 36)
rm -rf node_modules
npm install --no-package-lock
rm -f node_modules/medreportandsign
```

### 7. Build e Installer MAIN

```bash
npm run build
npm run dist
```

Verifica output: `dist/MedReport-Setup-1.0.73.exe` e `dist/latest.yml`.

### 8. Release MAIN su GitHub (DEVE essere l'ULTIMA release creata)

```bash
gh release create v1.0.73 \
  --target main \
  --title "v1.0.73" \
  --notes "Changelog qui" \
  dist/MedReport-Setup-1.0.73.exe dist/latest.yml
```

> **IMPORTANTE**: La release MAIN deve essere creata **per ultima**. GitHub assegna automaticamente il tag "Latest" all'ultima release pubblicata. La release "Latest" deve sempre essere quella di `main` (Windows 10/11), non quella di `w7`.

### 8b. Aggiungere installer W7 + win7.yml alla release MAIN (CRITICO per auto-update W7)

> **PERCHÉ**: `electron-updater` cerca `win7.yml` **esclusivamente nel release "Latest"** di GitHub (sempre il release main). Se manca, i client Win7 ricevono errore 404 e **non si aggiornano mai**.

> **IMPORTANTE**: `electron-updater` prepende SEMPRE il base URL della release al campo `url` del yml. URL assoluti nel yml vengono raddoppiati e causano 404. La soluzione è caricare l'installer W7 + blockmap direttamente nella release MAIN, così win7.yml funziona con URL relativi (solo il filename).

```bash
VER=1.0.77

# Caricare installer W7 e blockmap nella release MAIN
gh release upload v${VER} dist/MedReportAndSign-Setup-${VER}.exe --clobber
gh release upload v${VER} dist/MedReportAndSign-Setup-${VER}.exe.blockmap --clobber

# Caricare win7.yml (con URL relativi, direttamente dalla build W7)
cp dist/win7.yml /tmp/win7.yml
gh release upload v${VER} /tmp/win7.yml --clobber

# Verificare che tutti i file siano presenti
gh release view v${VER} --json assets --jq '.assets[].name'
# Output atteso: latest.yml, MedReport-Setup-X.X.X.exe,
#                MedReportAndSign-Setup-X.X.X.exe, MedReportAndSign-Setup-X.X.X.exe.blockmap,
#                win7.yml
```

### 9. Verificare il tag "Latest"

```bash
gh release list --limit 3
```

Controllare che `v1.0.73` (main) sia marcata come **Latest**. Se per errore "Latest" è assegnato alla release w7, correggere con:

```bash
gh release edit v1.0.73 --latest
```

---

## ATTENZIONE: Problemi Noti Build W7

### Electron sbagliato (CRITICO)

I `node_modules` sono condivisi tra branch. Quando si passa da `main` (Electron 36) a `w7` (Electron 22), **bisogna SEMPRE reinstallare** con `npm install`. Altrimenti l'installer viene creato con Electron 36 che **non funziona su Windows 7**.

**Sintomo**: L'app si installa ma non si avvia su Windows 7.
**Verifica**: Controllare nel log del build che mostri `electron=22.3.27`.

### Symlink circolare npm 10+ (CRITICO)

npm 10+ crea automaticamente `node_modules/medreportandsign` come symlink alla root del progetto. Questo causa:
- `Maximum call stack size exceeded` in electron-builder (loop infinito)
- `dependency path is undefined` se il symlink viene rimosso ma resta nel lockfile

**Soluzione**:
1. Usare `npm install --no-package-lock` per non alterare il lockfile
2. Rimuovere `rm -f node_modules/medreportandsign` dopo ogni `npm install`
3. Non cancellare mai `package-lock.json` (il lockfile rigenera con la self-reference)

### win7.yml assente dalla release "Latest" (CRITICO per auto-update W7)

`electron-updater` cerca `win7.yml` **solo nel release "Latest"** di GitHub (che è sempre il release main). Se manca, l'auto-update Win7 fallisce silenziosamente con errore 404.

**Sintomo**: I client Win7 rimangono bloccati su una versione vecchia. Nel log (`%APPDATA%\MedReportAndSign\logs\main.log`):
```
Error: Cannot find win7.yml in the latest release artifacts
(releases/download/vX.X.X/win7.yml): HttpError: 404
```
**Causa**: Il `win7.yml` con URL relativi è presente nella release `vX.X.X-win7` ma **non** nella release `vX.X.X` (Latest).
**Soluzione**: Eseguire il passaggio **8b** dopo ogni release main (caricare installer W7 + blockmap + win7.yml nella release MAIN).

### Tag "Latest" assegnato alla release sbagliata (IMPORTANTE)

GitHub assegna automaticamente il tag **"Latest"** all'ultima release pubblicata. Se la release W7 viene creata dopo quella MAIN, la pagina releases mostrerà la versione W7 in evidenza.

**Sintomo**: La pagina releases mostra `vX.X.X-win7` come "Latest" invece di `vX.X.X`.
**Impatto**: Auto-update del canale `latest` (Windows 10/11) potrebbe non funzionare; la pagina releases confonde gli utenti.
**Soluzione**: Creare **sempre** la release MAIN per ultima, oppure correggere con:
```bash
gh release edit vX.X.X --latest
```

### Sequenza sicura per build W7

```bash
git checkout w7
rm -rf node_modules
npm install --no-package-lock
rm -f node_modules/medreportandsign
npm run build
npm run dist
```

---

## Checklist

### Pre-Release
- [ ] `version` aggiornata in `package.json`
- [ ] Submodule `MedicalReportingAPI` committato e pushato
- [ ] Tutte le modifiche committate su `main`
- [ ] Cherry-pick applicato a `w7`

### Build & Release (ORDINE IMPORTANTE)
- [ ] Build W7 con Electron 22.3.27 (verificare nel log!)
- [ ] Build W7: `dist/MedReportAndSign-Setup-X.X.X.exe` + `dist/win7.yml`
- [ ] Release W7 creata con tag `vX.X.X-win7`
- [ ] `node_modules` ripristinati per main (Electron 36)
- [ ] Build MAIN: `dist/MedReport-Setup-X.X.X.exe` + `dist/latest.yml`
- [ ] Release MAIN creata con tag `vX.X.X` (**ULTIMA** — diventa "Latest")
- [ ] **Installer W7 + blockmap + win7.yml aggiunti alla release MAIN** (step 8b — necessario per auto-update W7!)
- [ ] File `.yml` inclusi in entrambe le release (necessari per auto-update)

### Post-Release
- [ ] Verificare che `vX.X.X` (main) sia marcata "Latest" su GitHub (`gh release list`)
- [ ] Verificare asset nella release main: `gh release view vX.X.X --json assets --jq '.assets[].name'`
      → deve contenere `latest.yml`, `MedReport-Setup-X.X.X.exe`, `MedReportAndSign-Setup-X.X.X.exe`, `MedReportAndSign-Setup-X.X.X.exe.blockmap` **e `win7.yml`**
- [ ] `node_modules` ripristinati per il branch di lavoro corrente
- [ ] Test auto-update su client Win7 e Win10/11

---

## Comandi Utili

```bash
# Verificare release pubblicate (controllare quale è "Latest")
gh release list

# Forzare una release come "Latest"
gh release edit v1.0.73 --latest

# Eliminare e ricreare una release
gh release delete v1.0.73-win7 --yes
gh release create v1.0.73-win7 ...

# Verificare asset di una release (devono esserci latest.yml + win7.yml + exe)
gh release view v1.0.73 --json assets --jq '.assets[].name'

# Aggiungere installer W7 + win7.yml alla release MAIN (step 8b)
VER=1.0.77
gh release upload v${VER} dist/MedReportAndSign-Setup-${VER}.exe --clobber
gh release upload v${VER} dist/MedReportAndSign-Setup-${VER}.exe.blockmap --clobber
cp dist/win7.yml /tmp/win7.yml
gh release upload v${VER} /tmp/win7.yml --clobber

# Verificare versione Electron installata
node -e "console.log(require('electron/package.json').version)"

# Verificare tag
git tag | grep v1.0.73
```

---

**Ultimo aggiornamento**: Marzo 2026 — aggiunto step 8b (win7.yml nella release MAIN, critico per auto-update W7)
