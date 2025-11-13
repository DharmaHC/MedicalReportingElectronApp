# Documentazione File di Configurazione

Questa documentazione descrive tutti i file di configurazione JSON dell'applicazione MedReportAndSign.

## 📄 sign-settings.json

File di configurazione principale per le impostazioni di firma digitale e layout PDF.

### Impostazioni Logo (Header)
- **`yPosLogo`** *(number)*: Distanza del logo dal bordo superiore della pagina (in punti)
- **`logoWidth`** *(number)*: Larghezza del logo in punti
- **`logoHeight`** *(number)*: Altezza del logo in punti

### Impostazioni Footer Immagine
- **`yPosFooterImage`** *(number)*: Posizione verticale dell'immagine footer dal bordo inferiore
- **`footerImageWidth`** *(number)*: Larghezza dell'immagine footer
- **`footerImageHeight`** *(number)*: Altezza dell'immagine footer
- **`footerImageXPositionOffset`** *(number)*: Offset orizzontale per centrare l'immagine footer

### Impostazioni Testo Footer
- **`footerTextFontFamily`** *(string)*: Font per il testo del footer (es. "Times New Roman", "Arial")
- **`footerTextPointFromBottom`** *(number)*: Distanza del testo dalla parte inferiore della pagina
- **`footerTextFontSize`** *(number)*: Dimensione del font del testo footer
- **`footerCompanyDataPointFromBottom`** *(number)*: Distanza dei dati aziendali dal bordo inferiore
- **`footerCompanyDataMultiline`** *(boolean)*: Se `true`, la dicitura di firma viene stampata su 2 righe; se `false`, su 1 riga
- **`blankFooterHeight`** *(number)*: Altezza del rettangolo bianco che copre il footer originale

### Impostazioni Firma Digitale
- **`signatureTextLine1`** *(string)*: Prima riga della dicitura di firma digitale
  - Placeholder disponibili: `{signedBy}` (nome del medico), `{date}` (data e ora)
  - Esempio: `"Referto firmato digitalmente ai sensi degli art. 20, 21 n.2, 23 e 24 del d.Lgs. n.82 del 7.3.2015 e successive modifiche da: "`
- **`signatureTextLine2`** *(string)*: Seconda riga della dicitura di firma digitale
  - Placeholder disponibili: `{signedBy}`, `{date}`
  - Esempio: `"{signedBy} in data: {date}"`

### Impostazioni Stampa
- **`printSignedPdfIfAvailable`** *(boolean)*: Se `true`, stampa sempre il PDF firmato quando disponibile

### Impostazioni Pagina
- **`reportPageWidth`** *(number)*: Larghezza della pagina in millimetri (es. 210 per A4)
- **`reportPageHeight`** *(number)*: Altezza della pagina in millimetri (es. 297 per A4)

### Impostazioni Editor
- **`editorZoomDefault`** *(number)*: Zoom di default dell'editor (es. 1.3 = 130%)
- **`rowsPerPage`** *(number)*: Numero di righe per pagina nell'editor
- **`highlightPlaceholder`** *(boolean)*: Se `true`, evidenzia i placeholder nell'editor

### Impostazioni Smart Card / Firma Digitale
- **`pkcs11Lib`** *(string)*: Percorso della libreria PKCS#11 per la smart card
  - Esempio: `"C:\\Windows\\System32\\bit4ipki.dll"`
- **`cspSlotIndex`** *(number)*: Indice dello slot della smart card
- **`remoteSignUrl`** *(string)*: URL del servizio di firma remota (se utilizzato)
- **`tsaUrl`** *(string)*: URL del servizio TSA (Time Stamping Authority) per la marca temporale
  - Esempio: `"https://freetsa.org/tsr"`

### Impostazioni Applicazione
- **`useMRAS`** *(boolean)*: Se `true`, utilizza il servizio MRAS (Electron native) per la firma
- **`showAppMenu`** *(boolean)*: Se `true`, mostra il menu dell'applicazione

---

## 📄 company-footer-settings.json

Configurazione specifica per ogni azienda. Le impostazioni sono organizzate per `companyId` (es. "ASTER", "RAD", "HEALTHWAY", "CIN").

### Campi per Ogni Company

- **`footerImageWidth`** *(number)*: Larghezza dell'immagine footer specifica dell'azienda (in punti)
- **`footerImageHeight`** *(number)*: Altezza dell'immagine footer specifica dell'azienda (in punti)
- **`blankFooterHeight`** *(number)*: Altezza del rettangolo bianco che copre il footer originale
- **`yPosFooterImage`** *(number)*: Posizione verticale dell'immagine footer dal bordo inferiore
- **`footerImageXPositionOffset`** *(number)*: Offset orizzontale per centrare l'immagine footer
- **`footerText`** *(string)*: **Testo dei dati aziendali** mostrato nel footer di tutte le pagine
  - Esempio: `"Aster Diagnostica Srl - P.I. e C.F. 06191121000"`
  - Questo testo appare centrato in basso in tutte le pagine del PDF

### Sezione "DEFAULT"

Usata come fallback quando il `companyId` non corrisponde a nessuna configurazione specifica.

### Esempio Struttura

```json
{
  "ASTER": {
    "footerImageWidth": 160,
    "footerImageHeight": 32,
    "blankFooterHeight": 25,
    "yPosFooterImage": 0,
    "footerImageXPositionOffset": 0,
    "footerText": "Aster Diagnostica Srl - P.I. e C.F. 06191121000"
  },
  "DEFAULT": {
    ...
  }
}
```

---

## 📄 company-ui-settings.json

Configurazione UI e workaround di emergenza per ogni azienda.

### Campi Principali

- **`emergencyWorkaround`** *(object)*: Configurazione workaround per situazioni di emergenza
  - **`enabled`** *(boolean)*: Attiva/disattiva il workaround di emergenza
  - **`bypassPin`** *(boolean)*: Se `true`, bypassa la richiesta del PIN della smart card
  - **`bypassSignature`** *(boolean)*: Se `true`, salta la firma digitale (solo header/footer)
    - ⚠️ **IMPORTANTE**: Usare solo per recupero referti già firmati
  - **`overrideDoctorName`** *(string|null)*: Nome del medico da usare al posto del CN della smart card
    - Esempio: `"Dr. Mario Rossi"`
    - Usato quando `bypassSignature` è attivo

### Esempio

```json
{
  "emergencyWorkaround": {
    "enabled": true,
    "bypassPin": true,
    "bypassSignature": true,
    "overrideDoctorName": "Dr. Mario Rossi"
  }
}
```

---

## 🔧 Come Modificare le Configurazioni

1. **Aprire il file JSON** con un editor di testo (es. Notepad++, VS Code)
2. **Modificare i valori** mantenendo il formato JSON valido
   - Stringhe: `"valore tra virgolette"`
   - Numeri: `123` (senza virgolette)
   - Booleani: `true` o `false` (senza virgolette)
3. **Salvare** il file
4. **Riavviare l'applicazione** per applicare le modifiche

### ⚠️ Note Importanti

- **JSON non supporta commenti**: Non aggiungere `//` o `/* */` nei file JSON
- **Virgole**: Ogni campo deve essere separato da virgola, tranne l'ultimo
- **Stringhe con backslash**: Usare doppio backslash `\\` per i percorsi Windows
  - Corretto: `"C:\\Windows\\System32\\file.dll"`
  - Errato: `"C:\Windows\System32\file.dll"`

---

## 📍 Posizionamento Elementi nel PDF

### Sistema di Coordinate
- **Origine (0,0)**: Angolo in basso a sinistra della pagina
- **Asse Y**: Cresce dal basso verso l'alto
- **Unità di misura**: Punti tipografici (1 punto = 1/72 pollici)

### Riferimenti Posizioni
- **Logo**: Dal bordo superiore (`yPosLogo`)
- **Footer Text**: Dal bordo inferiore (`footerTextPointFromBottom`, `footerCompanyDataPointFromBottom`)
- **Footer Image**: Dal bordo inferiore (`yPosFooterImage`)

---

## 🔐 Modalità Bypass Firma (Emergency Workaround)

La modalità bypass è progettata **SOLO** per situazioni di emergenza come:
- Recupero di referti già firmati dal database
- Ripubblicazione di referti storici
- Testing senza smart card

### Come Funziona

Quando `bypassSignature` è `true`:
1. **Non viene eseguita** la firma digitale PKCS#11
2. **Viene applicato** solo header e footer aziendali al PDF
3. **Viene usato** il nome in `overrideDoctorName` per la dicitura di firma
4. **Non viene generato** il file P7M (CMS)

### ⚠️ Attenzione

I PDF generati in modalità bypass:
- **NON hanno valore legale** come documenti firmati
- Mostrano solo una **dicitura estetica** di firma
- **NON contengono** firma digitale verificabile
- Devono essere usati **SOLO internamente** per archiviazione/consultazione

---

## 📝 Template Placeholder

I seguenti placeholder vengono sostituiti automaticamente:

| Placeholder | Descrizione | Esempio Output |
|------------|-------------|----------------|
| `{signedBy}` | Nome del medico firmatario | "Dr. Mario Rossi" |
| `{date}` | Data e ora della firma | "13/11/2025, 03:50:55" |

### Dove Usarli

- `signatureTextLine1` in `sign-settings.json`
- `signatureTextLine2` in `sign-settings.json`

---

## 🎨 Font Supportati

L'applicazione supporta i seguenti font per il testo del footer:

- **Times New Roman** → File: `Times New Roman.ttf`
- **Arial** → File: `Arial.ttf`

I file font devono trovarsi in: `resources/assets/Fonts/`

---

## 📦 Immagini Aziendali

Le immagini per logo e footer devono essere in formato **PNG** e trovarsi in:
- **Produzione**: `%ProgramData%/MedReportAndSign/images/`
- **Sviluppo**: `src/renderer/assets/images/`

### Nomi File Previsti

- `LogoAster.png` - Logo aziendale (header)
- `FooterAster.png` - Footer ASTER
- `FooterHW.png` - Footer HEALTHWAY
- `FooterCin.png` - Footer CIN

---

*Ultima modifica: Novembre 2025*
