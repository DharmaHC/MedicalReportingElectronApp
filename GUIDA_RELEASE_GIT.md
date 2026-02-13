# Guida Rapida: Rilascio Release su GitHub

## Prerequisiti
- Build completate per entrambe le versioni (MAIN e W7)
- Tutti i cambiamenti committati
- Repository pulito (`git status` deve mostrare working tree clean)

---

## 🚀 Release MAIN (Windows 10/11)

### 1. Build
```bash
cd D:\Lavoro\Sviluppo\MedicalReportingAPP\MedReportAndSign\MedReportAndSign
npm run build
npm run dist
```

### 2. Commit e Push (se ci sono modifiche)
```bash
git add .
git commit -m "Release v1.0.37"
git push origin main
```

### 3. Creare Tag
```bash
# Crea tag annotato
git tag -a v1.0.37 -m "Release v1.0.37 - Windows 10/11"

# Push del tag
git push origin v1.0.37
```

### 4. Creare Release su GitHub
```bash
# Opzione A: Da GitHub Web UI
# 1. Vai su https://github.com/DharmaHC/MedicalReportingElectronApp/releases
# 2. Click "Draft a new release"
# 3. Seleziona tag: v1.0.37
# 4. Release title: "Release v1.0.37"
# 5. Carica file: dist/MedReportAndSign-Setup-1.0.37.exe
# 6. Publish release

# Opzione B: Con GitHub CLI (gh)
gh release create v1.0.37 \
  dist/MedReportAndSign-Setup-1.0.37.exe \
  --title "Release v1.0.37" \
  --notes "Release v1.0.37 - Windows 10/11"
```

---

## 🔧 Release W7 (Windows 7)

### 1. Build
```bash
cd D:\Lavoro\Sviluppo\MedicalReportingAPP\MedReportAndSign\MedReportAndSignW7
npm run build
npm run dist
```

### 2. Creare Tag (dalla directory MAIN)
```bash
cd D:\Lavoro\Sviluppo\MedicalReportingAPP\MedReportAndSign\MedReportAndSign

# Crea tag annotato con suffisso -win7
git tag -a v1.0.37-win7 -m "Release v1.0.37 - Windows 7"

# Push del tag
git push origin v1.0.37-win7
```

### 3. Creare Release su GitHub
```bash
# Opzione A: Da GitHub Web UI
# 1. Vai su https://github.com/DharmaHC/MedicalReportingElectronApp/releases
# 2. Click "Draft a new release"
# 3. Seleziona tag: v1.0.37-win7
# 4. Release title: "Release v1.0.37 - Windows 7"
# 5. Carica file: ../MedReportAndSignW7/dist/MedReportAndSign-Setup-1.0.37.exe
# 6. Publish release

# Opzione B: Con GitHub CLI (gh)
gh release create v1.0.37-win7 \
  ../MedReportAndSignW7/dist/MedReportAndSign-Setup-1.0.37.exe \
  --title "Release v1.0.37 - Windows 7" \
  --notes "Release v1.0.37 - Windows 7 (canale win7)"
```

---

## 📋 Checklist Completa

### Pre-Release
- [ ] Aggiornare `version` in `package.json` (MAIN e W7)
- [ ] Committare tutte le modifiche
- [ ] Verificare che `git status` sia pulito
- [ ] Build MAIN completata (`dist/MedReportAndSign-Setup-X.X.X.exe`)
- [ ] Build W7 completata (`dist/MedReportAndSign-Setup-X.X.X.exe`)

### Release MAIN
- [ ] Tag creato (`v1.0.37`)
- [ ] Tag pushato su GitHub
- [ ] Release creata su GitHub
- [ ] File `.exe` caricato
- [ ] Release pubblicata (non draft)

### Release W7
- [ ] Tag creato (`v1.0.37-win7`)
- [ ] Tag pushato su GitHub
- [ ] Release creata su GitHub
- [ ] File `.exe` caricato
- [ ] Release pubblicata (non draft)

### Post-Release
- [ ] Verificare che `latest.yml` sia presente nella release MAIN
- [ ] Verificare che `win7.yml` sia presente nella release W7
- [ ] Testare auto-update su client MAIN
- [ ] Testare auto-update su client W7

---

## 🔄 Comandi Utili

### Verificare tag locali
```bash
git tag
```

### Verificare tag remoti
```bash
git ls-remote --tags origin
```

### Eliminare tag (se serve ricreare)
```bash
# Elimina tag locale
git tag -d v1.0.37

# Elimina tag remoto
git push origin --delete v1.0.37
```

### Verificare ultime release
```bash
gh release list
```

### Visualizzare dettagli release
```bash
gh release view v1.0.37
```

---

## ⚠️ Note Importanti

### Nomenclatura Tag
- **MAIN**: `v1.0.37` (versione normale)
- **W7**: `v1.0.37-win7` (con suffisso `-win7`)

### File Generati
electron-builder genera automaticamente:
- `MedReportAndSign-Setup-X.X.X.exe` (installer)
- `latest.yml` (MAIN - file di configurazione per auto-update)
- `win7.yml` (W7 - file di configurazione per auto-update)

I file `.yml` vengono caricati automaticamente da electron-builder quando pubblichi su GitHub.

### Canali di Aggiornamento
- **MAIN**: Controlla canale `latest` → cerca tag `v*` (es. v1.0.37)
- **W7**: Controlla canale `win7` → cerca tag `v*-win7` (es. v1.0.37-win7)

### macOS
L'auto-update è **disabilitato** su macOS. Gli utenti Mac devono scaricare manualmente.

---

## 🆘 Troubleshooting

### Tag già esistente
```bash
# Se devi ricreare un tag:
git tag -d v1.0.37              # Elimina locale
git push origin --delete v1.0.37 # Elimina remoto
git tag -a v1.0.37 -m "..."     # Ricrea
git push origin v1.0.37          # Push nuovo tag
```

### Release non trovata da client
1. Verifica che la release sia **pubblicata** (non draft)
2. Verifica che i file `.yml` siano presenti
3. Verifica il tag: deve essere `v*` per MAIN, `v*-win7` per W7
4. Controlla i log su client: `%APPDATA%/MedReportAndSign/logs/main.log`

### Build non funziona
```bash
# Pulisci e rebuilda
npm run clean  # se esiste
rm -rf dist
rm -rf node_modules
npm install
npm run build
npm run dist
```

---

## 📝 Template Messaggio di Commit

```
Release v1.0.37 - [Descrizione Breve]

Modifiche principali:
- Fix editor prescrizioni (problema cursore)
- Sincronizzazione versione W7 con MAIN
- Configurazione canali separati per auto-update

Features:
✅ Editor prescrizioni funzionante
✅ Versione W7 allineata
✅ Canali update separati (latest/win7)

Breaking Changes:
Nessuno

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## 🎯 Workflow Rapido

```bash
# 1. Build entrambe le versioni
cd MedReportAndSign && npm run build && npm run dist
cd ../MedReportAndSignW7 && npm run build && npm run dist
cd ../MedReportAndSign

# 2. Commit e push
git add .
git commit -m "Release v1.0.37"
git push origin main

# 3. Tag MAIN
git tag -a v1.0.37 -m "Release v1.0.37"
git push origin v1.0.37

# 4. Tag W7
git tag -a v1.0.37-win7 -m "Release v1.0.37 - Windows 7"
git push origin v1.0.37-win7

# 5. Creare release su GitHub Web UI e caricare i file .exe
```

---

**Data Creazione**: 5 Dicembre 2025
**Versione Attuale**: 1.0.37
