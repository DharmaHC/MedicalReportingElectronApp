# MedReportAndSign - Manuale Utente Completo

**Versione**: 1.0.49
**Applicazione**: MedReport - Sistema di Refertazione Medica con Firma Digitale

---

## Indice

1. [Introduzione](#1-introduzione)
2. [Requisiti di Sistema](#2-requisiti-di-sistema)
3. [Accesso all'Applicazione](#3-accesso-allapplicazione)
4. [Interfaccia Principale (Home Page)](#4-interfaccia-principale-home-page)
5. [Gestione Referti](#5-gestione-referti)
6. [Elenco Registrazioni](#6-elenco-registrazioni)
7. [Prestazioni e Risultati](#7-prestazioni-e-risultati)
8. [Editor dei Referti](#8-editor-dei-referti)
9. [Firma Digitale](#9-firma-digitale)
10. [Firma Remota Massiva](#10-firma-remota-massiva)
11. [Prescrizioni Tecniche](#11-prescrizioni-tecniche)
12. [Gestione Profilo e Preferenze](#12-gestione-profilo-e-preferenze)
13. [Funzionalita' Amministratore](#13-funzionalita-amministratore)
14. [Integrazione con Viewer DICOM](#14-integrazione-con-viewer-dicom)
15. [Risoluzione Problemi](#15-risoluzione-problemi)

---

## 1. Introduzione

**MedReportAndSign** e' un'applicazione desktop per la refertazione medica che permette ai medici di:
- Visualizzare e gestire l'elenco dei pazienti da refertare
- Compilare referti medici con un editor HTML avanzato
- Firmare digitalmente i referti (firma locale con smartcard o firma remota)
- Stampare e archiviare i referti firmati
- Gestire prescrizioni tecniche per esami radiologici

L'applicazione e' progettata per integrarsi con sistemi di gestione ospedaliera e viewer DICOM per la visualizzazione delle immagini diagnostiche.

---

## 2. Requisiti di Sistema

### Hardware
- PC con processore moderno (64-bit)
- Almeno 4 GB di RAM
- Lettore di smartcard (per firma digitale locale)
- Connessione di rete stabile

### Software
- Windows 10/11 (64-bit) - sistema primario
- macOS o Linux (supporto limitato)
- SumatraPDF (per stampa PDF - installato in `C:\Program Files\SumatraPDF\`)
- Driver smartcard/token installati (es. bit4xpki.dll)

### Per Firma Remota
- Account attivo con provider supportato (Aruba, InfoCert, Namirial, OpenAPI)
- Credenziali di accesso e codice OTP

---

## 3. Accesso all'Applicazione

### 3.1 Login

All'avvio dell'applicazione viene mostrata la schermata di login.

**Campi richiesti:**
- **Codice Fiscale**: Il codice fiscale dell'utente (16 caratteri)
- **Password**: La password associata all'account

**Azioni disponibili:**
- **Accedi**: Effettua l'autenticazione
- **Cambia Password** (opzionale): Disponibile dopo il primo accesso

### 3.2 Cambio Password

Durante il login o dalla Home Page e' possibile modificare la propria password:

1. Inserire la **password corrente**
2. Inserire la **nuova password** (minimo 6 caratteri)
3. **Confermare** la nuova password
4. Cliccare su **"Cambia Password"**

### 3.3 Logout

Dalla Home Page, tramite il menu **Profilo** e' possibile:
- **Logout**: Disconnette l'utente e torna alla schermata di login
- **Logout ed Esci**: Disconnette l'utente e chiude l'applicazione

---

## 4. Interfaccia Principale (Home Page)

Dopo il login, la Home Page mostra tre schede principali:

| Scheda | Descrizione |
|--------|-------------|
| **Gestione Referti** | Lista dei referti da completare con filtri avanzati |
| **Elenco Registrazioni** | Lista delle registrazioni paziente del giorno |
| **Prestazioni** | Dettaglio delle prestazioni per il paziente selezionato |

### 4.1 Header dell'Applicazione

L'header mostra:
- **Logo aziendale** (configurabile)
- **Titolo applicazione**
- **Informazioni utente**: Nome medico, codice medico
- **Pulsante Profilo**: Menu con opzioni utente

### 4.2 Notifiche di Aggiornamento

Se e' disponibile una nuova versione dell'applicazione, viene mostrata una notifica con:
- Versione corrente vs nuova versione
- Pulsante per scaricare l'aggiornamento
- Progress bar durante il download

---

## 5. Gestione Referti

La scheda **"Gestione Referti"** e' l'area principale di lavoro del medico.

### 5.1 Filtri di Ricerca

**Filtri temporali:**
- **Data da / Data a**: Intervallo date per la ricerca
- **Periodo**: Selezione rapida (Oggi, Ultima Settimana, Ultimo Mese, ecc.)
- **Per data Ritiro**: Se attivo, filtra per data di ritiro invece che data esame

**Filtri paziente:**
- **Cognome**: Filtro per cognome paziente
- **Nome**: Filtro per nome paziente

**Filtri stato:**
- **Referti Completi**: Include anche i referti gia' firmati/inviati
- **Prescrizioni Complete**: Include esami con prescrizioni gia' completate

**Filtri organizzativi:**
- **Settori**: Filtra per settore diagnostico
- **Unita' Operative**: Filtra per unita' operativa

### 5.2 Griglia Referti

La griglia mostra l'elenco dei referti con le seguenti colonne:

| Colonna | Descrizione |
|---------|-------------|
| **Data Ritiro** | Data di ritiro dell'esame |
| **Cognome** | Cognome del paziente |
| **Nome** | Nome del paziente |
| **Eta'** | Eta' del paziente in anni |
| **Codice** | Codice identificativo dell'esame |
| **Settori** | Settore diagnostico |
| **Stato** | Stato del referto (Da Refertare, Bozza, Refertato, ecc.) |
| **Prescrizione** | Icona se presente prescrizione tecnica |
| **Anamnesi** | Icona se presente anamnesi |
| **Documenti** | Icona se presenti documenti allegati |
| **Note** | Icona se presenti note |

### 5.3 Azioni sulla Griglia

**Click singolo su riga**: Seleziona il paziente e carica le sue prestazioni

**Doppio click su riga**: Apre l'editor per il referto

**Menu contestuale** (tasto destro):
- Apri referto
- Visualizza dettagli

### 5.4 Indicatori di Stato

Gli stati del referto sono rappresentati con colori:
- **Grigio**: Da Refertare
- **Giallo**: Bozza salvata
- **Verde**: Referto completato/firmato
- **Rosso**: Errore o referto annullato

---

## 6. Elenco Registrazioni

La scheda **"Elenco Registrazioni"** mostra tutte le registrazioni del giorno corrente.

### 6.1 Colonne Visualizzate

| Colonna | Descrizione |
|---------|-------------|
| **Data Ritiro** | Data e ora della registrazione |
| **Del** | Data dell'esame |
| **Cognome** | Cognome del paziente |
| **Nome** | Nome del paziente |
| **Eta'** | Eta' del paziente |
| **Codice** | Codice registrazione completo |
| **Settori** | Settori assegnati |
| **Creata da** | Operatore che ha creato la registrazione |
| **Nota Prel.** | Note del workflow (es. note prelievo) |

### 6.2 Interazione

- **Click singolo**: Seleziona la registrazione e carica le prestazioni associate
- **Doppio click**: Apre direttamente l'editor per la prima prestazione disponibile

---

## 7. Prestazioni e Risultati

La scheda **"Prestazioni"** mostra il dettaglio delle prestazioni per il paziente/registrazione selezionata.

### 7.1 Colonne della Griglia

| Colonna | Descrizione |
|---------|-------------|
| **Codice** | Codice della prestazione |
| **Nome** | Nome dell'esame |
| **Desc. Parametro** | Descrizione del sub-esame |
| **Data Ritiro** | Data di ritiro |
| **Stato** | Stato della prestazione |
| **Medico Esecutore** | Medico che ha eseguito l'esame |
| **Ref. Unico** | Checkbox per unificare piu' esami in un unico referto |
| **Unita' Operativa** | Unita' operativa di appartenenza |
| **Carica File** | Pulsante per caricare file allegati |

### 7.2 Referto Unico (Multi-Esame)

La funzionalita' **"Ref. Unico"** permette di creare un singolo referto per piu' prestazioni:

1. Selezionare la prima prestazione dalla griglia superiore
2. Spuntare la checkbox **"Ref. Unico"** sulle prestazioni aggiuntive
3. Aprire l'editor - tutti gli esami selezionati saranno inclusi

**Nota**: Gli esami unificati condividono lo stesso referto e vengono firmati insieme.

### 7.3 Caricamento File

Per allegare file a una prestazione:

1. Cliccare su **"Carica File"** nella riga desiderata
2. Selezionare il file dal sistema
3. Il file viene caricato e associato alla prestazione

---

## 8. Editor dei Referti

L'editor e' l'area principale per la compilazione dei referti medici.

### 8.1 Layout dell'Editor

L'editor e' diviso in due pannelli ridimensionabili:

**Pannello Sinistro:**
- **Frasi Comuni**: Frasario predefinito per inserimento rapido
- **Esiti Precedenti**: Lista dei referti precedenti del paziente

**Pannello Destro:**
- **Informazioni Paziente**: Nome, cognome, eta', quesito diagnostico
- **Editor HTML**: Area di scrittura del referto
- **Barra Azioni**: Pulsanti per le operazioni sul referto

### 8.2 Informazioni Paziente

Il blocco mostra:
- **Nome e Cognome** del paziente
- **Eta'** in anni
- **Quesito Diagnostico** (se presente)

### 8.3 Frasario (Frasi Comuni)

Il frasario permette di inserire rapidamente testi predefiniti nel referto.

**Filtri disponibili:**
- **Campo di ricerca**: Filtra le frasi per testo
- **Testi di Tutti gli Esami**: Mostra frasi di tutti i tipi di esame
- **Testi di tutti i medici**: Mostra frasi di tutti i medici
- **Includi non assegnate**: Mostra frasi non assegnate a medici specifici

**Utilizzo:**
1. Navigare nella struttura ad albero delle frasi
2. Cliccare su una frase per inserirla nel punto corrente del cursore
3. La frase viene inserita mantenendo la formattazione

### 8.4 Esiti Precedenti

Mostra l'elenco dei referti precedenti del paziente.

**Per visualizzare un referto precedente:**
1. Cliccare sul referto nella lista
2. Si apre un popup con:
   - **Testo HTML** del referto
   - **PDF firmato** (se disponibile)
   - **Pulsante** per aprire le immagini nel viewer DICOM

**Azioni nel popup:**
- **Chiudi**: Chiude il popup
- **Apri Immagini**: Carica lo studio nel viewer DICOM

### 8.5 Editor HTML

L'editor supporta la formattazione rich-text con i seguenti strumenti:

**Formattazione testo:**
- **Grassetto** (Ctrl+B)
- **Corsivo** (Ctrl+I)
- **Sottolineato** (Ctrl+U)
- **Barrato**

**Colori:**
- **Colore testo**: Cambia il colore del carattere
- **Colore sfondo**: Evidenzia il testo

**Allineamento:**
- Sinistra, Centro, Destra, Giustificato

**Liste:**
- Liste numerate
- Liste puntate

**Indentazione:**
- Aumenta/Diminuisci rientro

**Altro:**
- **Annulla/Ripeti** (Ctrl+Z / Ctrl+Y)
- **Visualizza HTML**: Mostra/modifica il codice sorgente
- **Pulisci formattazione**: Rimuove la formattazione

### 8.6 Pulsanti Azione

| Pulsante | Descrizione |
|----------|-------------|
| **Apri Immagini** | Apre lo studio corrente nel viewer DICOM |
| **Annulla** | Chiude l'editor senza salvare (con conferma se ci sono modifiche) |
| **Visualizza Referto** | Genera e mostra l'anteprima PDF del referto |
| **Salva Bozza** | Salva il referto come bozza senza finalizzarlo |
| **Termina e Invia** | Finalizza, firma e invia il referto |

### 8.7 Opzioni di Stampa

**Checkbox disponibili:**
- **Mostra anteprima prima di stampare**: Visualizza il PDF prima della stampa
- **Stampa referto firmato quando termini**: Stampa automaticamente dopo la firma

### 8.8 Modalita' Sola Lettura

L'editor si apre in **modalita' sola lettura** quando:
- Il referto e' gia' stato firmato da un altro medico
- La data del referto e' precedente a quella odierna (per alcune configurazioni)

In questo caso viene mostrato un avviso rosso e i pulsanti di modifica sono disabilitati.

### 8.9 Gestione Modifiche Non Salvate

Se si tenta di uscire dall'editor con modifiche non salvate:

1. Appare un dialogo di conferma
2. **Si, salva e chiudi**: Salva le modifiche e chiude
3. **No, esci senza salvare**: Esce perdendo le modifiche
4. **Annulla**: Torna all'editor

---

## 9. Firma Digitale

### 9.1 Tipi di Firma Supportati

**Firma Locale (Smartcard/Token):**
- Richiede dispositivo fisico (smartcard o token USB)
- Utilizza la libreria PKCS#11 configurata
- Richiede inserimento PIN ad ogni firma

**Firma Remota:**
- Non richiede dispositivo fisico
- Utilizza provider certificati (Aruba, InfoCert, Namirial, OpenAPI)
- Richiede credenziali e codice OTP

### 9.2 Processo di Firma Locale

1. Cliccare su **"Termina e Invia"**
2. Viene richiesto il **PIN** della smartcard
3. Inserire il PIN e confermare
4. Il sistema firma il PDF e lo invia al server
5. Se configurato, viene stampato automaticamente

**In caso di PIN errato:**
- Viene mostrato un messaggio di errore
- E' possibile riprovare con il PIN corretto

### 9.3 Timestamp Authority

La firma include un timestamp certificato da un server TSA (Timestamp Authority) che garantisce la data e ora della firma.

### 9.4 Formato della Firma

Il referto firmato include:
- **Firma PAdES**: Firma digitale incorporata nel PDF
- **File P7M** (opzionale): Firma CAdES separata
- **Footer personalizzato**: Dicitura di firma con nome del medico
- **Logo e footer aziendali**: Configurabili per cliente

---

## 10. Firma Remota Massiva

La funzionalita' di **Firma Remota Massiva** permette di firmare piu' referti in un'unica sessione.

### 10.1 Accesso alla Funzione

1. Dalla Home Page, cliccare sul menu **Profilo**
2. Selezionare **"Firma Massiva Remota"**

### 10.2 Selezione Provider

Selezionare il provider di firma remota dal menu a tendina:
- **Aruba Sign**
- **InfoCert**
- **Namirial**
- **OpenAPI**

**Nota**: Solo i provider abilitati e configurati sono disponibili.

### 10.3 Autenticazione Sessione

Se non c'e' una sessione attiva:

1. Cliccare su **"Avvia Sessione e Firma"**
2. Si apre il dialogo di autenticazione
3. Inserire **Username/UserID** del servizio di firma
4. Inserire **Password**
5. Inserire **Codice OTP** (dal dispositivo o app)
6. Cliccare su **"Autentica"**

**Stato sessione:**
- Viene mostrato il tempo rimanente della sessione
- Il nome del firmatario (CN del certificato)

### 10.4 Filtri Referti

**Filtri disponibili:**
- **Data Da / Data A**: Intervallo temporale
- **Paziente**: Ricerca per nome/cognome
- **Stato**: Tutti, Bozze, Da Firmare

### 10.5 Selezione Referti

La griglia mostra i referti disponibili per la firma con:
- Checkbox di selezione
- Cognome e Nome paziente
- Nome esame
- Data
- Stato referto
- Stato firma (pending, in corso, firmato, errore)

**Azioni di selezione:**
- **Seleziona tutti**: Seleziona tutti i referti visibili
- **Deseleziona**: Deseleziona tutti

### 10.6 Avvio Firma Batch

1. Selezionare i referti da firmare
2. Cliccare su **"Firma X Referti"**
3. Viene mostrata la barra di progresso
4. Per ogni referto:
   - Viene mostrato il nome del paziente corrente
   - Il conteggio avanza (es. 5/20)
   - Lo stato nella griglia si aggiorna (firmato/errore)

### 10.7 Gestione Errori

Se un referto fallisce:
- Viene segnato come **"Errore"** nella griglia
- Il processo continua con i referti successivi
- Al termine viene mostrato il riepilogo (X firmati, Y errori)

### 10.8 Chiusura Sessione

La sessione di firma remota:
- Ha un timeout configurabile (default 15 minuti)
- Puo' essere estesa con nuove autenticazioni
- Si chiude automaticamente alla chiusura della modale

---

## 11. Prescrizioni Tecniche

Le prescrizioni tecniche sono istruzioni per i tecnici radiologi.

### 11.1 Accesso alla Prescrizione

Dalla griglia delle prestazioni:
1. Identificare la riga con l'icona prescrizione (se presente)
2. Cliccare sulla riga per aprire la prescrizione

### 11.2 Editor Prescrizione

L'editor prescrizione e' simile all'editor referti con:

**Pannello Sinistro (solo per tecnici):**
- **Frasario Prescrizioni**: Frasi predefinite specifiche per prescrizioni RX
- Campo di ricerca
- Checkbox "Testi di Tutti gli Esami"

**Pannello Destro:**
- **Header esami**: Mostra gli esami collegati alla prescrizione
- **Editor HTML**: Area di scrittura della prescrizione

### 11.3 Permessi

**Tecnici:**
- Possono creare e modificare prescrizioni
- Vedono il frasario prescrizioni

**Medici:**
- Possono visualizzare le prescrizioni esistenti
- Le prescrizioni di altri utenti sono in sola lettura
- Non vedono il frasario (area editor piu' ampia)

### 11.4 Salvataggio

- Cliccare **"Salva"** per salvare la prescrizione
- La prescrizione viene associata a tutti gli esami collegati
- Se il contenuto e' vuoto, la prescrizione viene eliminata

---

## 12. Gestione Profilo e Preferenze

### 12.1 Menu Profilo

Il menu Profilo (icona ingranaggio) offre:

| Opzione | Descrizione |
|---------|-------------|
| **Cambia Password** | Modifica la password dell'account |
| **Firma Massiva Remota** | Accede alla firma batch |
| **Logout** | Disconnette e torna al login |
| **Logout ed Esci** | Disconnette e chiude l'applicazione |

### 12.2 Opzioni Amministratore

Se l'utente e' amministratore, sono disponibili:

| Opzione | Descrizione |
|---------|-------------|
| **Registra Nuovo Utente** | Crea un nuovo account utente |
| **Rigenera PDF Referti** | Rigenera i PDF per referti esistenti |

---

## 13. Funzionalita' Amministratore

### 13.1 Registrazione Nuovo Utente

Accessibile dal menu Profilo > **"Registra Nuovo Utente"**

**Campi richiesti:**
- **Codice Fiscale**: CF del nuovo utente (16 caratteri, maiuscolo)
- **Email**: Indirizzo email valido
- **Password**: Minimo 6 caratteri
- **Conferma Password**: Ripetizione password
- **Conferma email automaticamente**: Se attivo, l'utente non deve verificare l'email

### 13.2 Rigenerazione PDF

Accessibile dal menu Profilo > **"Rigenera PDF Referti"**

Questa funzione permette di rigenerare i file PDF per referti gia' archiviati (utile in caso di problemi di formattazione o aggiornamento template).

---

## 14. Integrazione con Viewer DICOM

### 14.1 Sistemi Supportati

L'applicazione supporta l'integrazione con:

**RemoteEye:**
- Viewer DICOM desktop tramite protocollo JNLP
- Supporta apertura, aggiunta studi, chiusura

**RemoteEyeLite:**
- Viewer DICOM web-based
- Apertura in nuova finestra browser

### 14.2 Apertura Immagini

Dall'editor referti:

1. Cliccare su **"Apri Immagini"**
2. Lo studio corrente viene caricato nel viewer
3. Se il viewer e' gia' aperto, lo studio viene aggiunto

### 14.3 Visualizzazione Studi Precedenti

Dal popup dei referti precedenti:

1. Cliccare su **"Apri Immagini"**
2. Lo studio precedente viene aggiunto al viewer

### 14.4 Chiusura Automatica

Quando si esce dall'editor:
- Gli studi caricati nel viewer vengono chiusi (solo RemoteEye)
- Il viewer rimane aperto ma vuoto

---

## 15. Risoluzione Problemi

### 15.1 Problemi di Login

**"Credenziali non valide":**
- Verificare il codice fiscale (16 caratteri, maiuscolo)
- Verificare la password
- Contattare l'amministratore se il problema persiste

**"Errore di connessione":**
- Verificare la connessione di rete
- Verificare che il server API sia raggiungibile

### 15.2 Problemi di Firma

**"PIN non valido":**
- Verificare di aver inserito il PIN corretto
- Dopo 3 tentativi errati la smartcard potrebbe bloccarsi

**"Smartcard non rilevata":**
- Verificare che il lettore sia collegato
- Verificare che i driver siano installati
- Reinserire la smartcard

**"Errore firma remota":**
- Verificare le credenziali del provider
- Verificare che l'OTP sia valido e non scaduto
- Riprovare con un nuovo OTP

### 15.3 Problemi di Stampa

**"Stampa fallita":**
- Verificare che SumatraPDF sia installato
- Verificare che la stampante sia configurata
- Provare a stampare manualmente il PDF scaricato

### 15.4 Problemi di Visualizzazione

**"PDF non disponibile":**
- Rigenerare l'anteprima con "Visualizza Referto"
- Verificare che il contenuto dell'editor non sia vuoto

**"Immagini non si aprono":**
- Verificare che RemoteEye/RemoteEyeLite sia installato
- Verificare la configurazione del server DICOM

### 15.5 Supporto

Per problemi non risolvibili:
1. Annotare il messaggio di errore esatto
2. Annotare i passaggi che hanno portato all'errore
3. Contattare il supporto tecnico con queste informazioni

---

## Appendice A: Scorciatoie da Tastiera

| Combinazione | Azione |
|--------------|--------|
| Ctrl+B | Grassetto |
| Ctrl+I | Corsivo |
| Ctrl+U | Sottolineato |
| Ctrl+Z | Annulla |
| Ctrl+Y | Ripeti |
| Ctrl+S | Salva (non standard - usare pulsante) |
| Escape | Chiudi dialoghi/popup |

---

## Appendice B: Glossario

| Termine | Definizione |
|---------|-------------|
| **Referto** | Documento medico che descrive i risultati di un esame |
| **Bozza** | Referto salvato ma non ancora finalizzato |
| **Firma Digitale** | Firma elettronica qualificata con valore legale |
| **PAdES** | PDF Advanced Electronic Signature - firma nel PDF |
| **CAdES** | CMS Advanced Electronic Signature - firma separata (.p7m) |
| **TSA** | Timestamp Authority - server che certifica data/ora |
| **OTP** | One-Time Password - codice usa e getta |
| **DICOM** | Standard per immagini mediche |
| **Accession Number** | Codice identificativo dello studio DICOM |
| **PKCS#11** | Standard per interfaccia con smartcard |

---

*Documento generato per MedReportAndSign v1.0.49*
