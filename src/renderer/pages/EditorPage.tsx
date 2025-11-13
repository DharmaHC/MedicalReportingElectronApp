import React, { useState, useEffect, useRef, useCallback } from "react";
import { setPin } from "../store/authSlice";
import {
  Editor,
  EditorPasteEvent,
  EditorTools,
  EditorUtils,
  PasteCleanupSettings,
  EditorMountEvent
} from "@progress/kendo-react-editor";
import { TextSelection, Plugin } from "prosemirror-state";
import { Button } from "@progress/kendo-react-buttons";
import { PDFDocument, rgb } from "pdf-lib";
import {
  volumeUpIcon,
  cancelIcon,
  imageIcon,
  eyeIcon,
  printIcon,
  downloadIcon,
  saveIcon,
  checkIcon
} from "@progress/kendo-svg-icons";
import { Dialog, DialogActionsBar } from "@progress/kendo-react-dialogs";
import { useNavigate, useLocation } from "react-router-dom";
import { ListView } from "@progress/kendo-react-listview";
import labels from "../utility/label";
import "./EditorPage.css";
import {
  url_send_singleReportHTML,
  url_processReport,
  url_getPredefinedTexts,
  url_getPatientReportsNoPdf,
  url_getPatientSignedReport
} from "../utility/urlLib";
import { useDispatch, useSelector, useStore } from "react-redux";
import { RootState } from "../store";
import type { EmergencyWorkaround } from "../../globals";
import PdfPreview from "../components/PdfPreview";
import {
  TreeView,
  TreeViewExpandChangeEvent,
  TreeViewItemClickEvent,
} from "@progress/kendo-react-treeview";
import { Checkbox, Input, InputChangeEvent } from "@progress/kendo-react-inputs";
import PreviousResultModal from "../components/PreviousResultModal";
import { v4 as uuidv4 } from "uuid";
import {
  Splitter,
  SplitterPaneProps,
  SplitterOnChangeEvent,
} from "@progress/kendo-react-layout";
import { clearRegistrations } from "../store/registrationSlice";
import { resetExaminationState, clearSelectedMoreExams } from "../store/examinationSlice";
import CustomEditor from '../components/CustomEditor';
import PreviewA4Window from '../components/PreviewA4Window';

// Interfaccia per la struttura di una frase predefinita.
interface Phrase {
  textParent: string | null;      // Categoria principale della frase.
  textDescription: string | null; // Sottocategoria o titolo della frase.
  textContent: string;            // Il contenuto effettivo della frase da inserire.
  parent: string | null;          // Eventuale ID del genitore (potrebbe non essere usato o avere altro scopo).
}

// Interfaccia per la struttura di un nodo dell'albero (TreeView) delle frasi.
interface TreeNode {
  id: string;           // ID univoco del nodo.
  text: string;         // Testo visualizzato per il nodo.
  expanded?: boolean;   // Indica se il nodo è espanso (per nodi con figli).
  items?: TreeNode[];   // Array di nodi figli (sotto-frasi o categorie).
}

// Strumenti dell'editor Kendo React UI da utilizzare nella toolbar.
const {
  Bold,
  Italic,
  Underline,
  Strikethrough,
//  Subscript,
//  Superscript,
  ForeColor,
  BackColor,
  CleanFormatting,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Indent,
  Outdent,
  OrderedList,
  UnorderedList,
  Undo,
  Redo,
  ViewHtml,
} = EditorTools;

// Interfaccia per i dati del report generato (PDF e RTF).
interface ReportData {
  pdfBlobUrl: string | null; // URL del Blob del PDF generato, usato per l'anteprima o il download.
  rtfContent: string | null; // Contenuto RTF del report, usato per il salvataggio.
  pdfContent: string | null; // Contenuto Base64 del PDF, usato per la firma e l'invio.
}

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return function(this: any, ...args: any[]) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    } as T;
  }

  
// Componente funzionale React per la pagina dell'editor.
function EditorPage() {

  const editorRef = useRef<Editor>(null); // Riferimento all'istanza del componente Editor Kendo.
  // Stati locali per gestire la visibilità dell'anteprima live.
  const [showLivePreview, setShowLivePreview] = useState(false);

  const [printSignedPdfIfAvailable, setPrintSignedPdfIfAvailable] = useState<boolean>(false);
  const [useMRAS, setUseMRAS] = useState<boolean>(false);
  const [reportPageWidth, setreportPageWidth] = useState<number>(25);
  const [reportPageHeight, setreportPageHeight] = useState<number>(25);
  const [blankFooterHeight, setBlankFooterHeight] = useState<number>(30);

  const [lastSignedPdfBase64, setLastSignedPdfBase64] = useState<string | null>(null); // si usaper la stampa

  const [showPrintPreview, setShowPrintPreview] = useState<boolean>(true);
  const [printSignedPdf, setPrintSignedPdf] = useState<boolean>(false);

  const [selectedResultPdf, setSelectedResultPdf] = useState<string | null>(null);
  const [resultPdfError, setResultPdfError] = useState<string | null>(null); // nuovo stato per errore PDF

  const [exitReason, setExitReason] = useState<null | "editor" | "app">(null);

   // --- PATCH: Stati per tenere traccia degli ID per debug/log

  // In component scope:
const userName = useSelector((state: RootState) => state.auth.userName);

// Funzione di log (ora sincronica, più semplice)
const logToFile = (msg: string, details?: any) => {
  if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.send(
      "log-to-file",
      msg + (details ? " " + JSON.stringify(details) : ""),
      { username: userName }
    );
  } else {
    // fallback: console.log
    console.log(`[${new Date().toISOString()}][${userName}] ${msg}`, details || "");
  }
};



  // Stato per la configurazione del workaround di emergenza
  const [emergencyWorkaround, setEmergencyWorkaround] = useState<EmergencyWorkaround>({
    enabled: false,
    bypassPin: false,
    bypassSignature: false,
    overrideDoctorName: null
  });

  // Stato per la configurazione del server logipacs
  const [logipacsServer, setLogipacsServer] = useState({
    baseUrl: "http://172.16.18.52/LPW/Display",
    username: "radiologia",
    password: "radiologia"
  });

  // Stato per abilitare l'uso degli ID esterni per il PACS
  const [useExternalIdSystem, setUseExternalIdSystem] = useState(false);

  // Stato per il sistema di visualizzazione immagini DICOM da utilizzare
  const [dicomImageSystemName, setDicomImageSystemName] = useState<"RemoteEye" | "RemoteEyeLite" | "Other">("RemoteEye");

  useEffect(() => {
      // Accedi ai settings globali esposti dal preload
      window.appSettings.get().then(settings => {
        setPrintSignedPdfIfAvailable(settings.printSignedPdfIfAvailable ?? false);
        setUseMRAS(settings.useMRAS ?? false);
        setreportPageWidth(settings.reportPageWidth ?? 25);
        setreportPageHeight(settings.reportPageHeight ?? 1.5);
        setBlankFooterHeight(settings.blankFooterHeight ?? 30);
      });
    }, []);

  useEffect(() => {
    // Carica le impostazioni UI della company, incluso il workaround di emergenza
    window.companyUISettings.get().then(settings => {
      const workaround = settings.emergencyWorkaround || {
        enabled: false,
        bypassPin: false,
        bypassSignature: false,
        overrideDoctorName: null
      };
      setEmergencyWorkaround(workaround);

      // Carica configurazione server logipacs
      const logipacs = settings.logipacsServer || {
        baseUrl: "http://172.16.18.52/LPW/Display",
        username: "radiologia",
        password: "radiologia"
      };
      setLogipacsServer(logipacs);

      // Carica configurazione uso ID esterni
      setUseExternalIdSystem(settings.useExternalIdSystem ?? false);

      // Carica configurazione sistema visualizzazione immagini DICOM
      setDicomImageSystemName(settings.dicomImageSystemName ?? "RemoteEye");

      // Log visibile quando il workaround è attivo
      if (workaround.enabled) {
        console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.warn('⚠️  EMERGENCY WORKAROUND ATTIVO  ⚠️');
        console.warn(`   Bypass PIN: ${workaround.bypassPin}`);
        console.warn(`   Bypass Firma: ${workaround.bypassSignature}`);
        if (workaround.overrideDoctorName) {
          console.warn(`   Override Medico: ${workaround.overrideDoctorName}`);
        }
        console.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
    });
  }, []);


  useEffect(() => {
  // Listener custom per mostrare la modale annulla su chiusura
  function onShowCancelDialog() {
    setExitReason("app");
    setIsCancelDialogVisible(true);
  }
  window.addEventListener('show-editor-cancel-dialog', onShowCancelDialog);
  return () => {
    window.removeEventListener('show-editor-cancel-dialog', onShowCancelDialog);
  };
}, []);


  /* ────────────────────────────────────────────────────────────── */
  /* Lista globale degli studi aperti per questa pagina (RemotEye) */
  /* ────────────────────────────────────────────────────────────── */
  const viewerAccNumsRef = useRef<string[]>([]);   // Unica istanza per memorizzare gli accession number degli studi aperti nel viewer esterno.
  const dispatch = useDispatch(); // Hook per inviare azioni Redux.
  const reduxStore = useStore<RootState>(); // Hook per accedere all'istanza dello store Redux (usato per getState).

  // Helper function per rimuovere titoli dal nome del medico
  const removeTitlesFromName = (name: string | null): string | null => {
    if (!name) return null;
    // Rimuove titoli comuni italiani: Dr., Dott., Dott.ssa, Dott.re, Prof., Prof.ssa, etc.
    return name
      .replace(/^(Dr\.?|Dott\.?|Dott\.ssa|Dott\.re|Prof\.?|Prof\.ssa)\s+/gi, '')
      .trim();
  };

  // Configurazione workaround da company-ui-settings.json
  const BYPASS_PIN_CHECK = emergencyWorkaround.enabled && emergencyWorkaround.bypassPin;
  const BYPASS_PIN_VALUE = "12345678"; // PIN fittizio per bypass
  const BYPASS_SIGNATURE = emergencyWorkaround.enabled && emergencyWorkaround.bypassSignature;

  // Se overrideDoctorName è specificato nel JSON, usalo; altrimenti usa il nome dell'utente corrente
  const OVERRIDE_USER_CN = emergencyWorkaround.overrideDoctorName
    ? removeTitlesFromName(emergencyWorkaround.overrideDoctorName)
    : removeTitlesFromName(userName);

  // Gestione Pin della smart-card.
  const [isPinDialogVisible, setIsPinDialogVisible] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  
  // Callback per mostrare/nascondere la modale PIN
  const showPinDialog = () => setIsPinDialogVisible(true);
  const hidePinDialog = () => setIsPinDialogVisible(false);
  
  const pinDialogResolver = useRef<((value: string | null) => void) | null>(null);

  // Recupera in modo sicuro il PIN dell'utente per la firma digitale.
  async function getSessionPin(): Promise<string | null> {
    // ⚠️ BYPASS TEMPORANEO - Salta il controllo PIN ⚠️
    if (BYPASS_PIN_CHECK) {
      console.warn('⚠️ BYPASS PIN ATTIVO - Usando PIN fittizio per recupero referti');
      dispatch(setPin(BYPASS_PIN_VALUE)); // Salva il PIN fittizio nello store
      return BYPASS_PIN_VALUE;
    }

    // 1) se ho già il PIN in store, lo restituisco subito
    const existingPin = reduxStore.getState().auth.pin;
    if (existingPin) {
      return existingPin;
    }
    showPinDialog();
    // 2) ritorna promise che risolvi tu
    return new Promise(resolve => {
      pinDialogResolver.current = resolve;
      const unsub = reduxStore.subscribe(() => {
        const newPin = reduxStore.getState().auth.pin;
        if (newPin) {
          unsub();
          hidePinDialog();
          pinDialogResolver.current = null;
          resolve(newPin);
        }
      });
    });
  }

// funzione per la modale PIN
const renderPinDialog = () =>
  isPinDialogVisible ? (
    <Dialog
      title="Inserisci PIN per firma"
      onClose={() => {
        setPinInput('');
        setPinError(null);
        hidePinDialog();
        if (pinDialogResolver.current) {
          pinDialogResolver.current(null);
          pinDialogResolver.current = null;
        }
      }}
    >
      {pinError && (
        <div className="k-messagebox k-messagebox-error" style={{ marginBottom: '1em' }}>
          <span className="k-icon k-i-warning"></span>
          {pinError}
        </div>
      )}

      <Input
        type="password"
        value={pinInput}
        onChange={(e: InputChangeEvent) => setPinInput(e.value)}
        placeholder="PIN smart-card"
      />

      <DialogActionsBar>
        <Button onClick={() => {
          setPinInput('');
          setPinError(null);
          hidePinDialog();
          if (pinDialogResolver.current) {
            pinDialogResolver.current(null);
            pinDialogResolver.current = null;
          }
        }}>
          Annulla
        </Button>
        <Button onClick={async () => {
          try {
            console.log('Verifica Pin');
            setPinError(null);

            // ⚠️ BYPASS TEMPORANEO - Salta la verifica del PIN ⚠️
            if (BYPASS_PIN_CHECK) {
              console.warn('⚠️ BYPASS PIN ATTIVO - Accettando qualsiasi PIN per recupero referti');
              dispatch(setPin(BYPASS_PIN_VALUE));
              hidePinDialog();
              if (pinDialogResolver.current) {
                pinDialogResolver.current(BYPASS_PIN_VALUE);
                pinDialogResolver.current = null;
              }
              return;
            }

            await (window as any).nativeSign.verifyPin(pinInput);
            dispatch(setPin(pinInput));
            hidePinDialog();
            if (pinDialogResolver.current) {
              pinDialogResolver.current(pinInput);
              pinDialogResolver.current = null;
            }
          } catch (err: any) {
            let userMessage = err.message || 'Errore sconosciuto';
            if (userMessage.includes('Nessuno slot disponibile')) {
              userMessage = 'Nessuno slot disponibile. Verificare di aver inserito la smart card o token USB e riprovare.';
            } else if (userMessage === 'PIN errato') {
              userMessage = 'PIN errato: controlla e riprova.';
            } else if (userMessage === 'PIN bloccato') {
              userMessage = 'PIN bloccato: la smart card/token va sbloccata dal fornitore.';
            }
            setPinError(userMessage);
          }

        }}>
          OK
        </Button>
      </DialogActionsBar>
    </Dialog>
  ) : null;  


  // Stati del componente
  const [isDialogVisible, setIsDialogVisible] = useState(false); // Controlla la visibilità del dialogo per la dettatura.
  const [dictationText, setDictationText] = useState(""); // Testo inserito nel dialogo di dettatura.
  const [pdfUrl, setPdfUrl] = useState<string | null>(null); // URL del Blob PDF per il componente PdfPreview.
  // const [rtfContent, setRtfContent] = useState<string | null>(null); // Rimosso: Lo stato RTF non era utilizzato, gestito tramite cachedReportData.
  const [errorMessage, setErrorMessage] = useState<string | null>(null); // Messaggio di errore da visualizzare all'utente.
  const [phrases, setPhrases] = useState<Phrase[]>([]); // Array delle frasi predefinite caricate dal backend.
  const [includeNotAssignedPhrases, setincludeNotAssignedPhrases] = useState(true); // Flag per includere frasi non assegnate a esami/medici.
  const [includeAllDoctorsPhrases, setIncludeAllDoctorsPhrases] = useState(true); // Flag per includere frasi di tutti i medici.
  const [includeAllExamsPhrases, setIncludeAllExamsPhrases] = useState(false); // Flag per includere frasi di tutti gli esami.
  const [searchTerm, setSearchTerm] = useState<string>(""); // Termine di ricerca per filtrare le frasi predefinite.
  const [treeData, setTreeData] = useState<TreeNode[]>([]); // Dati strutturati ad albero per la TreeView delle frasi.
  const navigate = useNavigate(); // Hook per la navigazione programmatica.
  const location = useLocation(); // Hook per accedere allo stato e ai parametri della route corrente.
  const [isDraftOperation, setIsDraftOperation] = useState(false); // Flag per indicare se l'operazione corrente è un salvataggio bozza.
  const readOnly = location.state?.readOnly === true; // Determina se l'editor è in modalità sola lettura (es. referto già finalizzato).
  const openedByOtherDoctor = location.state?.openedByOtherDoctor === true; // Indica se il referto è stato refertato da un altro medico (anche in bozza).

  // Selettori Redux per accedere a parti dello stato globale.
  const printReportWhenFinished = useSelector(
    (state: RootState) => state.auth.printReportWhenFinished // Preferenza utente per stampare il referto dopo la finalizzazione.
  );

  // Plugin Prosemirror per applicare stili fissi ai paragrafi nell'editor.
  // Forza font, dimensione e margini per garantire uniformità.
  const paragraphStylerPlugin = new Plugin({
    appendTransaction(transactions, oldState, newState) {
      const docChanged = transactions.some(tr => tr.docChanged);
      if (!docChanged) {
        return null; // Nessuna modifica al documento, non fare nulla.
      }
      const tr = newState.tr; // Inizia una nuova transazione basata sul nuovo stato.
      let somethingChanged = false;
      newState.doc.descendants((node, pos) => {
        if (node.type.name === "paragraph") { // Applica solo ai nodi di tipo paragrafo.
          const newStyle = 'font-family: "Times New Roman"; font-size: 16px; margin-top:0px; margin-bottom:0px; line-height:100%;';
          tr.setNodeMarkup(pos, undefined, { // Imposta gli attributi del nodo (sovrascrive lo stile esistente).
            ...node.attrs,
            style: newStyle
          });
          somethingChanged = true;
        }
      });
      return somethingChanged ? tr : null; // Restituisce la transazione se sono state apportate modifiche.
    }
  });

  // Utility e impostazioni per la pulizia dell'HTML incollato nell'editor.
  const { sanitizeClassAttr, sanitizeStyleAttr, removeAttribute, replaceImageSourcesFromRtf } =
    EditorUtils;
  const pasteSettings: PasteCleanupSettings = {
    stripTags: 'span|font|h1|h2|h3|h4|h5|h6', // Rimuove specifici tag HTML.
    attributes: { // Definisce come gestire gli attributi HTML.
        class: sanitizeClassAttr, // Pulisce l'attributo 'class'.
        style: sanitizeStyleAttr, // Pulisce l'attributo 'style'.
        '*': removeAttribute    // Rimuove tutti gli altri attributi non specificati.
      }
  };

  // Gestore dell'evento onPasteHtml dell'editor.
  // Pulisce l'HTML incollato e applica formattazioni personalizzate.
  const handlePasteHtml = (event: EditorPasteEvent) => {
    console.log("onPasteHtml triggered:", event.pastedHtml);
    if (event.pastedHtml) { // Se la clipboard contiene HTML.
      let html = EditorUtils.pasteCleanup(
        EditorUtils.sanitize(event.pastedHtml), // Sanifica l'HTML.
        pasteSettings // Applica le impostazioni di pulizia.
      );
      // Se l'HTML incollato contiene immagini con sorgenti locali (da RTF),
      // estrae le sorgenti e le converte in base64.
      if (event.nativeEvent.clipboardData) {
          html = replaceImageSourcesFromRtf(html, event.nativeEvent.clipboardData);
      }
      // Sostituzioni specifiche per uniformare lo stile del testo incollato.
      while (html.includes('style="text-align: justify;"')) {
        html = html.replace(' style="text-align: justify;"', ' style="font-family: &quot;Times New Roman&quot; font-size: 16px; margin-top: 0px; margin-bottom: 0px; line-height: 100%;"');
      }
      while (html.includes(' class="Predefinito" style="margin-bottom: 0cm;"')) {
        html = html.replace(' class="Predefinito" style="margin-bottom: 0cm;"', ' style="font-family: &quot;Times New Roman&quot; font-size: 16px; margin-top: 0px; margin-bottom: 0px; line-height: 100%;"');
      }
      while (html.includes('<p>')) {
        html = html.replace('<p>', '<p style="font-family: &quot;Times New Roman&quot; font-size: 16px; margin-top: 0px; margin-bottom: 0px; line-height: 100%;">');
      }

      // Non aggiungere &nbsp; ai paragrafi vuoti - il backend PDF li gestisce correttamente quando sono vuoti
      // html = html.replace(/<p([^>]*)>\s*<\/p>/gi, '<p$1>&nbsp;</p>');

      setIsModified(true); // Segna il documento come modificato.

      return html; // L'HTML processato viene inserito nell'editor.
    }
      // Se la clipboard contiene solo testo semplice.
      const plainText = event.nativeEvent.clipboardData?.getData("text/plain") || "";
      setIsModified(true);
      return plainText.replace(/<br\s*\/?>/gi, ""); // Rimuove i tag <br> e restituisce testo semplice.
  };

  // Dati Redux relativi alle registrazioni e all'esame selezionato.
  const data = useSelector((state: RootState) => state.registrations);
  const selectedExaminationId = useSelector(
    (state: RootState) => state.exam.selectedExaminationId
  );
  const selectedRegistration = useSelector((state: RootState) =>
    state.registrations.find(r => r.examinationId === Number(selectedExaminationId))
  );
  const selectedRegistrationFullCode = selectedRegistration?.examinationMnemonicCodeFull || ""; // Codice completo dell'esame per il viewer.
  const token = useSelector((state: RootState) => state.auth.token); // Token di autenticazione.
  const selectedMoreExams = useSelector(
    (state: RootState) => state.exam.selectedMoreExams // Eventuali esami aggiuntivi selezionati.
  );
  const doctorCode = useSelector((state: RootState) => state.auth.doctorCode); // Codice del medico.
  const patientId =
    selectedMoreExams.length > 0 ? selectedMoreExams[0].patientId : ""; // ID del paziente.
  const companyId = useSelector((state: RootState) => state.exam.selectedMoreExams[0]?.companyId); // ID dell'azienda/struttura.
  const patient = data.find( // Dati anagrafici del paziente.
    (record) => record.examinationId === Number(selectedExaminationId)
  );
  const allowMedicalReportDigitalSignature = useSelector( // Flag per abilitare la firma digitale.
    (state: RootState) => state.auth.allowMedicalReportDigitalSignature
  );

  // Stati per la gestione dei referti precedenti e modali.
  const [previousResults, setPreviousResults] = useState<any[]>([]); // Array dei referti precedenti del paziente.
  const [selectedResult, setSelectedResult] = useState<any | null>(null); // Referto precedente selezionato per la visualizzazione.
  const [isModalVisible, setIsModalVisible] = useState(false); // Visibilità del modale dei referti precedenti.
  const [isCancelDialogVisible, setIsCancelDialogVisible] = useState(false); // Visibilità del dialogo di conferma annullamento.
  const [isModified, setIsModified] = useState(false); // Flag che indica se il contenuto dell'editor è stato modificato.
  const [cachedReportData, setCachedReportData] = useState<ReportData | null>(null); // Cache dei dati del report generato (PDF/RTF).
  // const [signedPdfBase64, setSignedPdfBase64] = useState<string | null>(null); // Rimosso: stato non utilizzato.
  // const [p7mBase64, setP7mBase64] = useState<string | null>(null); // Rimosso: stato non utilizzato.
  const [isProcessing, setIsProcessing] = useState(false); // Flag per mostrare un dialogo di caricamento durante operazioni lunghe (salvataggio/firma).
  const [isFetchingPreviousResults, setIsFetchingPreviousResults] = useState(false); // Flag per indicare il caricamento dei referti precedenti.

  
  // Gestisce il click sul pulsante "Annulla".
  // Se ci sono modifiche non salvate, mostra un dialogo di conferma.
  const handleCancel = () => {
    if (isModified) {
      setExitReason("editor");
      setIsCancelDialogVisible(true);
    } else {
      closeViewer();
      dispatch(clearSelectedMoreExams()); // Pulisce gli esami aggiuntivi dallo stato Redux.
      navigate("/", { state: { reload: false } }); // Torna alla pagina principale senza ricaricare i dati.
    }
  };

  // Gestisce l'espansione/compressione dei nodi nella TreeView delle frasi.
  const handleExpandChange = (event: TreeViewExpandChangeEvent) => {
    const item = event.item as TreeNode; // Assicura che item sia di tipo TreeNode.
    const newTreeData = updateExpanded(treeData, item);
    setTreeData(newTreeData);
  };

  // Funzione ricorsiva per aggiornare lo stato di espansione di un nodo nell'albero.
  const updateExpanded = (data: TreeNode[], item: TreeNode): TreeNode[] => {
    return data.map((node) => {
      if (node.id === item.id) {
        return { ...node, expanded: !node.expanded };
      }
      if (node.items) {
        return { ...node, items: updateExpanded(node.items, item) };
      }
      return node;
    });
  };

  // Gestisce il click su un item della TreeView.
  // Se l'item è una frase (non ha figli), la inserisce nell'editor altrimenti la espande/contrae.
  const handleItemClick = (event: TreeViewItemClickEvent) => {
    const item = event.item as TreeNode;

    // ➜ 1. se l'item ha figli  ⇒  toggle espansione
    if (item.items && item.items.length) {
      setTreeData(prev => updateExpanded(prev, item));
      return; // niente "frase" per i nodi padre
    }

    // ➜ 2. altrimenti (foglia)  ⇒  inserisci la frase
    handlePhraseClick(item.text);
  };

  // Inserisce la frase selezionata nell'editor.
  const handlePhraseClick = (phrase: string) => {
    if (!editorRef.current?.view) return;
    const view = editorRef.current.view;
    view.focus();

    const { state, dispatch } = view;
    const { from } = state.selection;
    let pos = from;
    let tr = state.tr;

    const lines = phrase.split(/\r?\n/);

    lines.forEach((line, idx) => {
      if (idx > 0) {
        // Inserisce un hard break (<br />)
        tr = tr.insert(pos, state.schema.nodes.hard_break.create());
        pos += 1;
      }
      tr = tr.insertText(line, pos);
      pos += line.length;
    });

    dispatch(tr);
          // setIsModified(true) sarà gestito dal plugin docChangePlugin.
    };

  // Stato per la configurazione dei pannelli dello Splitter.
  const [panes, setPanes] = useState<SplitterPaneProps[]>([
    { size: "25%", min: "20%", collapsible: true, resizable: true }, // Pannello sinistro (frasi, referti precedenti).
    { min: "20%", collapsible: true, resizable: true },             // Pannello destro (editor).
  ]);

  // Gestisce il cambiamento delle dimensioni dei pannelli dello Splitter.
  const handlePanesChange = (event: SplitterOnChangeEvent) => {
    setPanes(event.newState);
  };

// PATCH: Resetta previousResults ogni volta che cambiano patientId o selectedExaminationId
  useEffect(() => {
    logToFile("RESET previousResults: cambio paziente o esame", { patientId, selectedExaminationId });
    setPreviousResults([]);
  }, [patientId, selectedExaminationId]);

  // PATCH: Carica referti precedenti solo quando patientId e examinationId sono valorizzati
  const fetchPreviousResults = useCallback(async () => {
    if (!patientId || !selectedExaminationId) {
      logToFile("SALTO fetchPreviousResults: patientId o examinationId mancante", { patientId, selectedExaminationId });
      return;
    }
    setIsFetchingPreviousResults(true);
    logToFile("FETCH previousResults: INIZIO", { patientId, selectedExaminationId });

    try {
      const response = await fetch(
        `${url_getPatientReportsNoPdf()}?patientId=${patientId}&examinationId=${selectedExaminationId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.ok) {
        const raw = await response.json();
        raw.sort((a: any, b: any) =>
          new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
        );
        const flattened = raw.flatMap((ex: any) =>
          (ex.examResults ?? []).map((er: any) => ({
            examinationId: ex.examinationId,
            startDate: ex.startDate,
            examinationMnemonicCodeFull: ex.examinationMnemonicCodeFull,
            examResult: er,
            patientLastName: er.patientLastName,
            patientFirstName: er.patientFirstName
          }))
        );
        setPreviousResults(flattened);
        logToFile("FETCH previousResults: OK", { patientId, selectedExaminationId, resultCount: flattened.length });
        if (flattened && flattened.length > 0) {
            const elenco = flattened.map((item: any) => ({
            PatientId: item.examResult.patientId ?? item.patientId ?? "ND",
            ExaminationId: item.examinationId ?? "ND",
            Nome: item.examResult.firstName ?? item.examResult.name ?? "ND",
            Cognome: item.patientLastName ?? "ND",
            IdRegistrazione: item.patientFirstName ?? "ND",
            patientLastName: item.patientLastName,
            patientFirstName: item.patientFirstName
          }));
          logToFile(
            "LISTA ESITI PRECEDENTI",
            { patientId, selectedExaminationId, elenco }
          );
        } else {
          logToFile(
            "LISTA ESITI PRECEDENTI VUOTA",
            { patientId, selectedExaminationId }
          );
        }
      } else {
        logToFile("FETCH previousResults: ERRORE RESPONSE", { patientId, selectedExaminationId, status: response.status });
        console.error("Errore nel recupero dei referti pregressi:", response.status);
      }
    } catch (error) {
      logToFile("FETCH previousResults: ERRORE CATCH", { patientId, selectedExaminationId, error });
      console.error("Errore nella richiesta dei referti pregressi:", error);
    } finally {
      setIsFetchingPreviousResults(false);
    }
  }, [patientId, selectedExaminationId, token]);

  // PATCH: useEffect con [patientId, selectedExaminationId] per fetchare i risultati SEMPRE su cambio
  useEffect(() => {
    // Solo se entrambi sono valorizzati (skip a mount "vuoto")
    if (patientId && selectedExaminationId) {
      fetchPreviousResults();
    }
  }, [patientId, selectedExaminationId, fetchPreviousResults]);

  // PATCH: Logga ogni volta che patientId/examinationId cambiano e cosa visualizzi a schermo (controllo incrociato)
  useEffect(() => {
    logToFile("VISUALIZZAZIONE DATI EDITOR: HEAD", {
      patientId,
      selectedExaminationId,
      patient: patient ? { firstName: patient.firstName, lastName: patient.lastName, age: patient.age } : null
    });
  }, [patientId, selectedExaminationId, patient]);

  // Costruisce la struttura ad albero delle frasi predefinite a partire da un array flat.
  // Filtra le frasi in base al termine di ricerca.
  const buildTree = (phrases: Phrase[], srch: string): TreeNode[] => {
    const parents: Record<string, TreeNode> = {}; // Oggetto per raggruppare le frasi per categoria (textParent).

    phrases.forEach(p => {
      const { textParent, textDescription, textContent } = p;
      // Filtra per termine di ricerca (case-insensitive).
      if (!textContent?.toLowerCase().includes(srch.toLowerCase())) return;

      /* ------------ Livello 1: Categoria Principale (textParent) ------------ */
      if (!parents[textParent ?? "_"]) { // Se la categoria non esiste, la crea.
        parents[textParent ?? "_"] = {
          id   : uuidv4(), // ID univoco.
          text : textParent ?? "(Senza categoria)", // Testo del nodo.
          expanded: // Espande inizialmente le categorie comuni (configurabile).
            JSON.parse(labels.editorPage.frasiComuniEspanseInizialmente || "true"),
          items: [] // Array per i figli (sottocategorie/frasi).
        };
      }

      /* ------------ Livello 2: Sottocategoria/Titolo (textDescription) ------------ */
      let descNode = parents[textParent ?? "_"].items!
        .find(n => n.text === (textDescription ?? "(senza titolo)"));
      if (!descNode) { // Se la sottocategoria non esiste, la crea.
        descNode = {
          id   : uuidv4(),
          text : textDescription ?? "(senza titolo)",
          items: [] // Array per le frasi effettive.
        };
        parents[textParent ?? "_"].items!.push(descNode);
      }

      /* ------------ Livello 3: Frase (textContent) ------------ */
      descNode.items!.push({ id: uuidv4(), text: textContent }); // Aggiunge la frase come figlio della sottocategoria.
    });

    // Filtra le categorie che non contengono frasi dopo la ricerca.
    return Object.values(parents).filter(p =>
      p.items?.some(d => d.items && d.items.length));
  };


  /* ------------------------------------------------------------
    Callback STABILE per caricare le frasi predefinite.
    Si rigenera solo quando cambiano le dipendenze effettive.
  ------------------------------------------------------------ */
  const fetchPredefinedTexts = useCallback(async () => {
    /* 1. linkedResultsList: Costruisce la lista degli esami per cui filtrare le frasi. */
    const linkedResultsList =
      includeAllExamsPhrases // Se flag "Tutti gli Esami" è attivo.
        ? [] // Lista vuota per indicare tutti gli esami.
        : (selectedMoreExams.length // Altrimenti, usa gli esami selezionati.
            ? selectedMoreExams.map(ex => ({
                examId      : ex.examId,
                examVersion : ex.examVersion,
                subExamId   : ex.subExamId,
                examResultId: ex.examResultId
              }))
            // Fallback se non ci sono esami selezionati (potrebbe essere omesso se la logica non lo richiede).
            : [{ examId: 0, examVersion: 0, subExamId: 0, examResultId: 0 }]);

    /* 2. query-string: Prepara i parametri per la richiesta GET. */
    const qs = new URLSearchParams();
    if (doctorCode && !includeAllDoctorsPhrases) { // Filtra per medico se non "Tutti i Medici".
      qs.append("doctorCode", doctorCode.trim());
    }
    qs.append("includeNotAssigned", String(includeNotAssignedPhrases)); // Includi frasi non assegnate.
    qs.append("includeAllDoctors",  String(includeAllDoctorsPhrases)); // Includi frasi di tutti i medici.
    qs.append("includeAllExams",    String(includeAllExamsPhrases));   // Includi frasi di tutti gli esami.

    /* 3. fetch: Esegue la chiamata API per ottenere le frasi. */
    try {
      const rsp = await fetch(
        `${url_getPredefinedTexts()}?${qs.toString()}`, // URL con query string.
        {
          method : "POST", // Metodo POST per inviare `linkedResultsList` nel body.
          headers: {
            "Content-Type": "application/json",
            Authorization : `Bearer ${token}` // Token di autenticazione.
          },
          body: JSON.stringify(linkedResultsList) // Lista degli esami nel body.
        }
      );
      if (!rsp.ok) {
        console.error("Errore GetPredefinedTexts:", rsp.status);
        return;
      }
      const data = await rsp.json();
      setPhrases(data); // Aggiorna lo stato con le frasi caricate.
    } catch (err) {
      console.error("Errore fetchPredefinedTexts:", err);
    }
  }, [
    /* Dipendenze reali del callback: */
    doctorCode,
    includeNotAssignedPhrases,
    includeAllDoctorsPhrases,
    includeAllExamsPhrases,
    token,
    selectedMoreExams // La struttura di `linkedResultsList` dipende da `selectedMoreExams`.
  ]);

  // useEffect per caricare le frasi predefinite al mount o al cambio delle dipendenze di `fetchPredefinedTexts`.
  useEffect(() => { fetchPredefinedTexts(); }, [fetchPredefinedTexts]);

  // useEffect per posizionare il cursore all'inizio del quarto paragrafo all'avvio,
  // se del contenuto iniziale è passato tramite `location.state`.
  useEffect(() => {
    setTimeout(() => { // Leggero ritardo per assicurare che l'editor sia renderizzato.
      if (editorRef.current && editorRef.current.view) {
        const view = editorRef.current.view;
        const { doc, tr } = view.state;
        if (doc.childCount >= 4) { // Se ci sono almeno 4 paragrafi.
          // Calcola la posizione all'inizio del terzo nodo (paragrafo).
          let pos = 0;
          for (let i = 0; i < 3; i++) { // Somma la dimensione dei primi 3 nodi.
            pos += doc.child(i).nodeSize;
          }
          // Crea una selezione testuale all'inizio del quarto nodo (+1 per entrare nel nodo).
          const selection = TextSelection.create(doc, pos + 1);
          view.dispatch(tr.setSelection(selection)); // Applica la selezione.
          view.focus(); // Imposta il focus sull'editor.
        }
      }
    }, 100); // Ritardo di 100ms.
  }, [location]); // Si attiva quando cambia `location` (es. navigazione con stato).

  // useEffect per ricostruire l'albero delle frasi quando cambiano le frasi caricate o il termine di ricerca.
  useEffect(() => {
    const dataTree = buildTree(phrases, searchTerm);
    setTreeData(dataTree);
  }, [phrases, searchTerm]);

  // Gestisce il cambiamento nel campo di input per filtrare le frasi.
  const handleSearchChange = (e: InputChangeEvent) => {
    setSearchTerm(e.value);
  };

  // Converte una stringa Base64 in un oggetto Blob.
  const base64ToBlob = (base64: string, contentType: string = 'application/octet-stream'): Blob => {
    const byteCharacters = atob(base64); // Decodifica la stringa Base64.
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) { // Processa in chunk.
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: contentType }); // Crea il Blob con il tipo MIME specificato.
  };

  // Genera i dati del report (PDF e RTF) inviando l'HTML dell'editor al backend.
  // Utilizza la cache se il contenuto non è stato modificato.
  const generateReportData = async (
    rtfNeedsToBeStored: boolean = false, // Indica se l'RTF deve essere memorizzato (es. salvataggio finale).
    isSigningProcess: boolean = false   // Indica se la generazione è parte di un processo di firma.
  ): Promise<ReportData | null> => {
    // Se il contenuto non è modificato e i dati sono in cache, restituisce la cache.
    if (!isModified && cachedReportData) {
      return cachedReportData;
    }
    if (editorRef.current && editorRef.current.view) {
      let content = editorRef.current.view.dom.innerHTML; // Contenuto HTML dall'editor.

      // Conta tutti i paragrafi vuoti (con o senza &nbsp;)
      let emptyParaCount = 0;

      // Prima rimuove &nbsp; dai paragrafi che lo contengono
      content = content.replace(/<p([^>]*)>(&nbsp;|\s)+<\/p>/gi, (_match, attrs) => {
        return `<p${attrs}></p>`;
      });

      // Poi sostituisce TUTTI i paragrafi vuoti con contenuto che occupa spazio
      content = content.replace(/<p([^>]*)><\/p>/gi, (_match, attrs) => {
        emptyParaCount++;
        // Usa il carattere spazio in formato HTML entity (&#160;) invece di &nbsp;
        // Forse il backend riconosce uno ma non l'altro
        return `<p${attrs}>&#160;</p>`;
      });

      console.log(`[generateReportData] Paragrafi vuoti convertiti: ${emptyParaCount}`);

      const byteArray = new TextEncoder().encode(content); // Converte HTML in Uint8Array.
      // Converte Uint8Array in stringa Base64.
      const byteString = btoa(
        byteArray.reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      // Deduplica la lista degli esami aggiuntivi.
      const deduplicatedMoreExams = selectedMoreExams.filter(
        (exam, index, array) => {
          return (
            array.findIndex(
              (e) =>
                e.examId === exam.examId &&
                e.examVersion === exam.examVersion &&
                e.subExamId === exam.subExamId &&
                e.examResultId === exam.examResultId
            ) === index
          );
        }
      );

      let doctorCodeParameter = doctorCode?.trim() ?? "";
      let doctorCodeNotReportDoctor = false;
      let examResultId = deduplicatedMoreExams[0]?.examResultId ?? 0;

      if (deduplicatedMoreExams[0].doctorCode && deduplicatedMoreExams[0].doctorCode.trim() !== doctorCode?.trim()) {
              // Il codice del medico dell'esame selezionato non corrisponde al codice del medico corrente.
              // Vuol dire che stamo visualizzando un esame di un altro medico. quindi passiamo come parametro il medico dell'esame,
              // per evitare di aggiornare 
              doctorCodeParameter = deduplicatedMoreExams[0].doctorCode.trim() ?? "";
              doctorCodeNotReportDoctor = true; // Indica che il codice del medico non è quello del referto corrente.
      }

      // Prepara i parametri della query string.
      const queryParams = new URLSearchParams({
        doctorCode: doctorCodeParameter,
        examinationId: selectedExaminationId || "",
        doctorCodeNotReportDoctor: doctorCodeNotReportDoctor ? "true" : "false",
        examResultId: examResultId.toString(),
        forceA4: "true",
        patientId: String(patientId) || "",
      });

      const linkedResultsList = deduplicatedMoreExams.map((exam) => ({
        examId: exam.examId,
        examVersion: exam.examVersion,
        subExamId: exam.subExamId,
        examResultId: exam.examResultId,
      }));

      try {
        // Chiamata API per inviare l'HTML e ricevere PDF/RTF.
        const response = await fetch(
          `${url_send_singleReportHTML()}?${queryParams.toString()}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              htmlBytes: byteString, // HTML in Base64.
              rtfNeedsToBeStored: rtfNeedsToBeStored,
              isSigningProcess: isSigningProcess,
              linkedResultsList: linkedResultsList,
              doctorCodeNotReportDoctor: doctorCodeNotReportDoctor,
              examResultId: examResultId, 
              }),
          }
        );
        if (response.ok) {
          const responseData = await response.json();
          const { pdfContent, rtfContent: responseRtfContent } = responseData;
          if (pdfContent && responseRtfContent) {
            const pdfBlob = base64ToBlob(pdfContent, "application/pdf");
            const pdfBlobUrl = URL.createObjectURL(pdfBlob);
            // setRtfContent(responseRtfContent); // Rimosso: stato RTF non più usato direttamente.

            const newReportData: ReportData = {
              pdfBlobUrl: pdfBlobUrl,
              rtfContent: responseRtfContent, // RTF dalla risposta.
              pdfContent: pdfContent,         // PDF Base64 dalla risposta.
            };
            setCachedReportData(newReportData); // Aggiorna la cache.
            setIsModified(false); // Resetta il flag di modifica dopo la generazione.
            return newReportData;
          } else {
            console.error("Dati PDF o RTF non disponibili nella risposta API.");
            setErrorMessage("Errore: Dati PDF o RTF non ricevuti dal server.");
            return null;
          }
        } else {
          console.error("Errore nell'invio del report HTML:", response.status);
          setErrorMessage(`Errore API (${response.status}) durante la generazione del report.`);
          return null;
        }
      } catch (error) {
        console.error("Errore durante la richiesta di generazione report:", error);
        setErrorMessage("Errore di rete o richiesta fallita durante la generazione del report.");
        return null;
      }
    }
    return null; // Se l'editor non è disponibile.
  };

  // Visualizza l'anteprima del PDF.
  const previewPDF = async () => {
    const reportData = await generateReportData(false, false); // Genera i dati (non per store, non per firma).
    if (reportData?.pdfContent) {
      const pdfBlob = base64ToBlob(reportData.pdfContent, "application/pdf");
      const pdfBlobUrl = URL.createObjectURL(pdfBlob);
 
      const isDebug = window.location.href.startsWith("http://localhost");
      if (isDebug) {
          console.log("DEBUG MODE: delay preview render di 600ms");
          setTimeout(() => setPdfUrl(pdfBlobUrl), 600);
        } else {
          setPdfUrl(pdfBlobUrl);
        }
    } else {
      console.error("Dati PDF non disponibili per l'anteprima.");
      setErrorMessage("Impossibile generare l'anteprima del PDF.");
    }
  };

  // Tipi per la gestione del viewer RemotEye.
  type ViewerMode = "openOnly" | "clearAndLoad" | "add" | "exit";

  /**
   * Costruisce la stringa degli Accession Numbers per il viewer RemotEye.
   * @param mode Modalità di apertura del viewer.
   * @param accNum Accession Number corrente.
   * @param list Lista degli Accession Numbers già aperti.
   * @returns Stringa formattata per il parametro `accNumsList`.
   */
  function buildAccNums(
    mode: ViewerMode,
    accNum: string,
    list: string[]
  ): string {
    const SEP = "%5C"; // Separatore "\" codificato per URL.
    switch (mode) {
      case "clearAndLoad": // Carica la lista completa, pulendo prima il viewer.
        return list.map(a => encodeURIComponent(a.trim())).join(SEP);
      case "add": // Aggiunge solo il nuovo accNum.
        return encodeURIComponent(accNum.trim());
      default: // Altre modalità non richiedono `accNumsList`.
        return "";
    }
  }

  /**
   * Mantiene la lista locale degli studi aperti nel viewer e costruisce l'URL per il sistema configurato.
   * @param accNum Accession Number dello studio da aprire/gestire.
   * @param mode Modalità di interazione con il viewer.
   */
  function openViewer(accNum: string, mode: ViewerMode) {
    /* 1. Aggiorna la lista locale `viewerAccNumsRef.current` degli accNum aperti. */
    switch (mode) {
      case "openOnly": // Apre il viewer senza caricare studi (es. per pulire).
      case "exit":     // Chiude il viewer.
        viewerAccNumsRef.current = [];
        break;
      case "clearAndLoad": // Pulisce il viewer e carica lo studio corrente.
        viewerAccNumsRef.current = [accNum.trim()];
        break;
      case "add": // Aggiunge lo studio corrente a quelli già aperti.
        if (!viewerAccNumsRef.current.includes(accNum.trim())) {
          viewerAccNumsRef.current.push(accNum.trim());
        }
        break;
    }

    // Carica i parametri di connessione dalla configurazione
    const BASE = logipacsServer.baseUrl; // URL base del servizio.
    const USER = logipacsServer.username; // Username.
    const PWD  = logipacsServer.password; // Password.

    /* 2. Gestione differenziata in base al sistema di visualizzazione configurato */
    switch (dicomImageSystemName) {
      case "RemoteEye":
        openViewerRemoteEye(accNum, mode, BASE, USER, PWD);
        break;
      case "RemoteEyeLite":
        openViewerRemoteEyeLite(accNum, mode, BASE, USER, PWD);
        break;
      case "Other":
        console.warn("⚠️ Sistema DICOM 'Other' non implementato. Configura un sistema supportato.");
        break;
      default:
        console.error("❌ Sistema DICOM non riconosciuto:", dicomImageSystemName);
    }
  }

  /**
   * Apre il viewer con RemoteEye (JNLP protocol handler).
   */
  function openViewerRemoteEye(accNum: string, mode: ViewerMode, BASE: string, USER: string, PWD: string) {
    /* Costruisce l'URL JNLP per RemotEye. */
    let jnlpURL =
      `${BASE}?username=${encodeURIComponent(USER)}` +
      `&password=${encodeURIComponent(PWD)}`;

    const joinedAccNums = buildAccNums(mode, accNum, viewerAccNumsRef.current);
    if (joinedAccNums) {
      jnlpURL += `&accNumsList=${joinedAccNums}`; // Aggiunge la lista degli accNum.
    }

    /* Parametri JNLP aggiuntivi in base alla modalità. */
    switch (mode) {
      case "openOnly":
        jnlpURL +=
          "&jnlpArgName0=execViewerActionOnStartup" +
          "&jnlpArgValue0=genericRemoveAllFromMemory"; // Pulisce la memoria del viewer.
        break;
      case "clearAndLoad":
        jnlpURL +=
          "&jnlpArgName0=execViewerActionOnStartup" +
          "&jnlpArgValue0=genericRemoveAllFromMemory" + // Pulisce la memoria.
          "&jnlpArgName1=autoLoadOnStartupCombinePolicy" +
          "&jnlpArgValue1=Add"; // Aggiunge gli studi specificati.
        break;
      case "add":
        jnlpURL +=
          "&jnlpArgName0=autoLoadOnStartupCombinePolicy" +
          "&jnlpArgValue0=Add"; // Aggiunge studi senza pulire.
        break;
      case "exit":
        jnlpURL +=
          "&jnlpArgName0=execViewerActionOnStartup" +
          "&jnlpArgValue0=closeAllContainerPanels"; // Chiude tutti i pannelli del viewer.
        break;
    }

    /* Avvia RemotEye tramite il protocol-handler `rhjnlp:`. */
    const payload = {
      msgType: "MSG_LAUNCHJNLP_RQ", // Tipo di messaggio per il protocol-handler.
      dataMap: { jnlpURL }          // URL JNLP da lanciare.
    };
    // Redirige a un URL custom che il client RemotEye dovrebbe intercettare.
    window.location.href =
      "rhjnlp:" + encodeURIComponent(JSON.stringify(payload));
    console.log("📋 Apertura viewer RemotEye con Payload:", "rhjnlp:" + encodeURIComponent(JSON.stringify(payload)));
  }

  /**
   * Apre il viewer con RemoteEyeLite (URL diretto HTTP).
   */
  function openViewerRemoteEyeLite(accNum: string, mode: ViewerMode, BASE: string, USER: string, PWD: string) {
    // RemoteEyeLite supporta solo apertura diretta, non comandi "exit" o "openOnly"
    if (mode === "exit" || mode === "openOnly") {
      console.log("ℹ️ RemoteEyeLite non supporta modalità 'exit' o 'openOnly'");
      return;
    }

    // Estrae IP e porta dal baseUrl (es. "http://192.9.200.102:81/LPW/Display" -> "http://192.9.200.102:81")
    const baseUrlObj = new URL(BASE);
    const serverBase = `${baseUrlObj.protocol}//${baseUrlObj.host}`;

    // Costruisce l'URL per RemoteEyeLite
    let viewerURL = `${serverBase}/viewer/DisplayStudy.html?accNumsList=${encodeURIComponent(accNum.trim())}&username=${encodeURIComponent(USER)}&password=${encodeURIComponent(PWD)}`;

    // Apre in una nuova finestra/tab del browser
    window.open(viewerURL, '_blank');
    console.log("📋 Apertura viewer RemoteEyeLite:", viewerURL);
  }

  /**
   * Apre lo studio corrente nel viewer DICOM configurato (RemoteEye, RemoteEyeLite, etc.).
   * - Se il viewer non contiene niente (lista locale vuota) -> "clearAndLoad".
   * - Altrimenti -> "add" (aggiunge lo studio a quelli esistenti).
   * - Se useExternalIdSystem è true, usa ExternalAccessionNumber, altrimenti usa examinationMnemonicCodeFull
   */
  function openCurrentStudy() {
    // Determina quale Accession Number usare
    let acc: string;
    if (useExternalIdSystem && selectedRegistration?.externalAccessionNumber) {
      acc = selectedRegistration.externalAccessionNumber.trim();
    } else {
      acc = selectedRegistrationFullCode.trim();
    }

    if (!acc) return; // Non fare nulla se non c'è un accNum.

    const mode: "clearAndLoad" | "add" =
          viewerAccNumsRef.current.length === 0 ? "clearAndLoad" : "add";
    openViewer(acc, mode);
  }

  /**
 * Chiude gli studi attualmente aperti nel viewer DICOM configurato senza chiudere l'app.
 * Se non ci sono studi aperti (viewerAccNumsRef vuoto), non invia il comando di chiusura.
 * Supportato solo per RemoteEye (JNLP), non per RemoteEyeLite.
 */
  function closeViewer() {
    // Se non ci sono studi aperti, non fare nulla
    if (viewerAccNumsRef.current.length === 0) {
      return;
    }

    // Svuota la lista locale degli accNum aperti
    viewerAccNumsRef.current = [];

    // Solo RemoteEye supporta il comando di chiusura tramite JNLP
    if (dicomImageSystemName !== "RemoteEye") {
      console.log("ℹ️ Il sistema", dicomImageSystemName, "non supporta il comando di chiusura automatica");
      return;
    }

    // Carica i parametri di connessione dalla configurazione
    const BASE = logipacsServer.baseUrl;
    const USER = logipacsServer.username;
    const PWD  = logipacsServer.password;

    let jnlpURL =
      `${BASE}?username=${encodeURIComponent(USER)}` +
      `&password=${encodeURIComponent(PWD)}` +
      `&jnlpArgName0=execViewerActionOnStartup` +
      `&jnlpArgValue0=closeStudyPanel`;

    const payload = {
      msgType: "MSG_LAUNCHJNLP_RQ",
      dataMap: { jnlpURL }
    };

    // Invia al protocol handler RemotEye
    window.location.href = "rhjnlp:" + encodeURIComponent(JSON.stringify(payload));

    // Forza il focus sulla finestra principale dopo un breve timeout
    window.setTimeout(() => {
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.send('focus-main-window');
    }
  }, 1500); // delay utile per dare tempo al viewer di aprirsi

  }

  // Stampa referto PDF o RTF, gestendo la firma digitale se disponibile.
// Componente Modal per l'anteprima di stampa (con timeout e loader)
const showPrintPreviewModal = (pdfBlob: Blob, onPrint: () => void, onCloseAndSave?: () => void): void => {
  const pdfUrl = URL.createObjectURL(pdfBlob);

  // 1. Mostra loader temporaneo subito
  const loader = document.createElement('div');
  loader.style.cssText = `
    position: fixed;top:0;left:0;width:100vw;height:100vh;
    display:flex;align-items:center;justify-content:center;z-index:9999;
    background:rgba(0,0,0,0.4);color:white;font-size:20px;
  `;
  loader.textContent = 'Caricamento anteprima...';
  document.body.appendChild(loader);

  // 2. Timeout per permettere al browser di propagare il blob e DOM
  setTimeout(() => {
    // Rimuovi il loader
    if (loader.parentElement) loader.parentElement.removeChild(loader);

    // Crea il modal vero e proprio
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      z-index: 1000;
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const container = document.createElement('div');
    container.style.cssText = `
      background: white;
      width: 100%;
      height: 100%;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    `;

    // Header con titolo e pulsanti
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 16px 24px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f9fafb;
      border-radius: 12px 12px 0 0;
    `;

    const title = document.createElement('h3');
    title.textContent = 'Anteprima di Stampa';
    title.style.cssText = `
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #111827;
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 12px;';

    const printBtn = document.createElement('button');
    printBtn.innerHTML = `
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="margin-right: 8px;">
        <path d="M6 9a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3A.5.5 0 0 1 6 9zM3.854 4.146a.5.5 0 1 0-.708.708L4.793 6.5 3.146 8.146a.5.5 0 1 0 .708.708l2-2a.5.5 0 0 0 0-.708l-2-2z"/>
        <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H9.5a1 1 0 0 0-1 1v4.5h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5h2V2a2 2 0 0 1 2-2H2z"/>
      </svg>
      Stampa
    `;
    printBtn.style.cssText = `
      padding: 10px 20px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      display: flex;
      align-items: center;
      transition: background-color 0.2s;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.innerHTML = `
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="margin-right: 8px;">
        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
      </svg>
      Annulla
    `;
    cancelBtn.style.cssText = `
      padding: 10px 20px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      display: flex;
      align-items: center;
      transition: background-color 0.2s;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = `
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="margin-right: 8px;">
        <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
      </svg>
      Chiudi
    `;
    closeBtn.style.cssText = `
      padding: 10px 20px;
      background: #10b981;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      display: flex;
      align-items: center;
      transition: background-color 0.2s;
    `;

    // Hover effects
    printBtn.onmouseover = () => printBtn.style.background = '#2563eb';
    printBtn.onmouseout = () => printBtn.style.background = '#3b82f6';
    cancelBtn.onmouseover = () => cancelBtn.style.background = '#dc2626';
    cancelBtn.onmouseout = () => cancelBtn.style.background = '#ef4444';
    closeBtn.onmouseover = () => closeBtn.style.background = '#059669';
    closeBtn.onmouseout = () => closeBtn.style.background = '#10b981';

    // Contenitore per l'iframe
    const iframeContainer = document.createElement('div');
    iframeContainer.style.cssText = `
      flex: 1;
      padding: 16px;
      background: #f3f4f6;
    `;

    const iframe = document.createElement('iframe');
    iframe.src = pdfUrl;
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: 2px solid #d1d5db;
      border-radius: 8px;
      background: white;
    `;

    // Assembla il modal
    buttonContainer.appendChild(printBtn);
    buttonContainer.appendChild(cancelBtn);
    if (onCloseAndSave) {
      buttonContainer.appendChild(closeBtn);
    }
    header.appendChild(title);
    header.appendChild(buttonContainer);
    iframeContainer.appendChild(iframe);
    container.appendChild(header);
    container.appendChild(iframeContainer);
    modal.appendChild(container);
    document.body.appendChild(modal);

    // Event handlers
    printBtn.onclick = (): void => {
      onPrint(); // Chiama la funzione di stampa originale
      closeModal();
    };

    const closeModal = (): void => {
      document.body.removeChild(modal);
      URL.revokeObjectURL(pdfUrl);
    };

    cancelBtn.onclick = closeModal;

    if (onCloseAndSave) {
      closeBtn.onclick = (): void => {
        onCloseAndSave(); // Salva e chiudi l'editor
        closeModal();
      };
    }

    // Chiudi cliccando fuori dal modal
    modal.onclick = (e): void => {
      if (e.target === modal) {
        closeModal();
      }
    };

    // Chiudi con Escape
    const escapeHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);

    // Focus sul pulsante di stampa
    setTimeout(() => printBtn.focus(), 100);
  }, 100); // timeout di 100ms, regolabile se serve
};

// Funzione di stampa che apre il PDF nel visualizzatore predefinito
const executePrint = async (finalPdfBlob: Blob): Promise<void> => {
  const pdfArrayBuffer = await finalPdfBlob.arrayBuffer();
  const pdfBase64 = arrayBufferToBase64(pdfArrayBuffer);

  // Invia stampa
  window.electron.ipcRenderer.send('print-pdf-native', pdfBase64);

  // Attendi la risposta (una sola volta)
window.electron.ipcRenderer.once('print-pdf-native-result', (event, { success, error, failureReason }) => {
  if (success) {
    // Solo ora puoi navigare via o chiudere
    dispatch(clearSelectedMoreExams());
    dispatch(resetExaminationState());
    dispatch(clearRegistrations());
    closeViewer();
    navigate("/", { state: { reload: true } }); // Torna alla home e forza il ricaricamento dei dati.
  } else {
    // Log di dettaglio per debug (salva su console browser)
    const reason = failureReason || error || "Motivo non disponibile";
    console.error('[PRINT] Errore nella stampa PDF:', reason);

    // Mostra messaggio utente
    setErrorMessage(`Stampa fallita: ${reason}`);
  }
});
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
// Funzione principale modificata con possibilità di anteprima
const handlePrintReferto = async (signedPdfBase64?: string): Promise<void> => {
let pdfContent: string | null = null;

if (printSignedPdf && signedPdfBase64) {
  // Usa direttamente il PDF firmato passato come argomento
  pdfContent = signedPdfBase64;
} else if (printSignedPdf && lastSignedPdfBase64) {
  // Usa quello nello stato, se richiesto e presente
  pdfContent = lastSignedPdfBase64;
} else {
  // Altrimenti genera il PDF normale (non firmato)
  const reportData = await generateReportData(false, false);
  pdfContent = reportData?.pdfContent || null;
}

  if (pdfContent) {
    const pdfBlob = base64ToBlob(pdfContent, "application/pdf");
    let finalPdfBlob = pdfBlob;

    // 2. Manipolazione PDF per aziende specifiche (HEALTHWAY o CIN)
    // NOTA: Questo viene applicato SOLO per PDF NON firmati, perché i PDF firmati
    // hanno già il footer gestito in signPdfService.ts
    const isPdfSigned = printSignedPdf && (signedPdfBase64 || lastSignedPdfBase64);

    // 📋 DEBUG LOG
    console.log('[FOOTER DEBUG] printSignedPdf:', printSignedPdf);
    console.log('[FOOTER DEBUG] signedPdfBase64:', signedPdfBase64 ? 'present' : 'null');
    console.log('[FOOTER DEBUG] lastSignedPdfBase64:', lastSignedPdfBase64 ? 'present' : 'null');
    console.log('[FOOTER DEBUG] isPdfSigned:', isPdfSigned);
    console.log('[FOOTER DEBUG] companyId:', companyId);
    console.log('[FOOTER DEBUG] companyId.trim():', companyId?.trim());
    console.log('[FOOTER DEBUG] Condition check:', !isPdfSigned && companyId && (companyId.trim() === "HEALTHWAY" || companyId.trim() === "CIN"));

    if (!isPdfSigned && companyId && (companyId.trim() === "HEALTHWAY" || companyId.trim() === "CIN")) {
      console.log('[FOOTER DEBUG] ✅ Entrato nel blocco di copertura footer!');
      try {
        // ⭐ NUOVO: Carica settings specifici per company invece di usare valore hardcoded
        const companyFooterSettings = await window.electron.ipcRenderer.invoke(
          'get-company-footer-settings',
          companyId
        );

        console.log('[FOOTER DEBUG] companyFooterSettings:', companyFooterSettings);

        const pdfBytes = await pdfBlob.arrayBuffer();
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();

        console.log('[FOOTER DEBUG] Numero pagine:', pages.length);

        const finalHeight = companyFooterSettings?.blankFooterHeight || blankFooterHeight;
        console.log('[FOOTER DEBUG] blankFooterHeight usato:', finalHeight);
        console.log('[FOOTER DEBUG] blankFooterHeight da settings:', companyFooterSettings?.blankFooterHeight);
        console.log('[FOOTER DEBUG] blankFooterHeight fallback:', blankFooterHeight);

        pages.forEach((page, index) => {
          const { width, height } = page.getSize();
          console.log(`[FOOTER DEBUG] Pagina ${index + 1}: width=${width}, height=${height}`);
          page.drawRectangle({
            x: 0,
            y: 0,
            width: width,
            height: finalHeight, // ⭐ USA settings company-specific
            color: rgb(1, 1, 1)
          });
          console.log(`[FOOTER DEBUG] Rettangolo bianco disegnato: x=0, y=0, width=${width}, height=${finalHeight}`);
        });

        const modifiedPdfBytes = await pdfDoc.save();
        // Convert to standard Uint8Array to ensure compatibility
        const pdfBytesArray = new Uint8Array(modifiedPdfBytes);
        finalPdfBlob = new Blob([pdfBytesArray], { type: "application/pdf" });
        console.log('[FOOTER DEBUG] ✅ PDF modificato con successo!');
      } catch (error) {
        console.error("[FOOTER DEBUG] ❌ Errore durante la manipolazione del PDF:", error);
        finalPdfBlob = pdfBlob;
      }
    } else {
      console.log('[FOOTER DEBUG] ❌ NON entrato nel blocco di copertura footer');
    }

    const newPdfBlob = await addCenteredMarginToPdf(finalPdfBlob); // Sposta tutto in basso di 10mm (1cm)
    //const newPdfBlob = finalPdfBlob; // Usa il PDF finale senza margini aggiuntivi
    // 3. Mostra anteprima o stampa diretta a seconda del flag showPrintPreview
    if (showPrintPreview) {
      showPrintPreviewModal(
        newPdfBlob,
        () => {
          executePrint(newPdfBlob);
        },
        () => {
          // Chiudi senza stampare: naviga indietro come fa executePrint ma senza stampare
          dispatch(clearSelectedMoreExams());
          dispatch(resetExaminationState());
          dispatch(clearRegistrations());
          closeViewer();
          navigate("/", { state: { reload: true } });
        }
      );
    } else {
      executePrint(newPdfBlob);
    }

    
    setIsModified(true);
  } else {
    console.error("Dati PDF non disponibili per la stampa");
    setErrorMessage("Dati PDF non disponibili per la stampa.");
  }
};

/**
 * Aggiunge margine superiore a ogni pagina e aumenta l'altezza della pagina.
 * @param pdfBlob Blob PDF di input
 * @param marginMm Margine superiore in millimetri (mm)
 * @returns Promise<Blob> Blob PDF modificato
 */
// reportPageWidth/Height in millimetri (mm)
async function addCenteredMarginToPdf(pdfBlob: Blob): Promise<Blob> {
  
  // 1. Ottieni bytes dal Blob
  const pdfBytes = await pdfBlob.arrayBuffer();

  // 2. Carica il PDF originale
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // 3. Converti le nuove dimensioni da mm a punti PDF (1mm = 2.83465pt)
  const newPageWidth = reportPageWidth * 2.83465;
  const newPageHeight = reportPageHeight * 2.83465;

  const pageCount = pdfDoc.getPageCount();

  for (let i = 0; i < pageCount; i++) {
    const oldPage = pdfDoc.getPage(i);

    // 4. Dimensioni originali della pagina (in punti)
    const { width: oldPageWidth, height: oldPageHeight } = oldPage.getSize();

    // 5. Calcola l'offset per centrare il contenuto
    var marginLeft = (newPageWidth - oldPageWidth) / 2;
    var marginTop = (newPageHeight - oldPageHeight) / 2;

    if (marginLeft < 0) {
      marginLeft = marginLeft*-1; // Non permettere margini negativi
      marginLeft = marginLeft/2;
    }
    if (marginTop < 0) {
      marginTop = marginTop*-1; // Non permettere margini negativi
      marginTop = marginTop/2;
    }



    // 6. Crea una nuova pagina con le nuove dimensioni
    const newPage = pdfDoc.insertPage(i, [newPageWidth, newPageHeight]);

    // 7. Inserisci la pagina originale nella nuova SENZA SCALARE!
    const embeddedPage = await pdfDoc.embedPage(oldPage);

    newPage.drawPage(embeddedPage, {
      x: 0,
      y: 65
    });

    // 8. Rimuovi la vecchia pagina (ora si trova a i+1)
    pdfDoc.removePage(i + 1);
  }

  // 9. Salva e restituisci il nuovo Blob PDF
  const modifiedPdfBytes = await pdfDoc.save();
  // Convert to standard Uint8Array to ensure compatibility
  const pdfBytesArray = new Uint8Array(modifiedPdfBytes);
  return new Blob([pdfBytesArray], { type: "application/pdf" });
}

// Gestisce il download del referto PDF (funzionalità attualmente nascosta nell'UI).
  const handleDownloadReferto = async () => {
    const reportData = await generateReportData(false, false);
    if (reportData?.pdfContent) {
      const pdfBlob = base64ToBlob(reportData.pdfContent, "application/pdf");
      const pdfBlobUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a"); // Crea un link temporaneo per il download.
      link.href = pdfBlobUrl;
      link.download = "referto.pdf"; // Nome del file suggerito.
      document.body.appendChild(link); // Aggiunge il link al DOM per poterlo cliccare.
      link.click(); // Simula il click per avviare il download.
      document.body.removeChild(link); // Rimuove il link dal DOM.
      URL.revokeObjectURL(pdfBlobUrl); // Revoca l'URL del Blob.
      setIsModified(true);
    } else {
      console.error("Dati PDF non disponibili per il download.");
      setErrorMessage("Impossibile generare il PDF per il download.");
    }
  };

  // Gestisce il salvataggio del referto senza uscire dalla pagina (salvataggio intermedio/bozza).
  const handleSaveWithoutExit = async () => {
    setIsProcessing(true); // Mostra indicatore di caricamento.
    try {
      // Chiama handleProcessReport con store=true (RTF deve essere memorizzato),
      // draft=true (è una bozza), e stayHere=true (non navigare via).
      await handleProcessReport(true, true, true);
    } finally {
      setIsProcessing(false); // Nasconde indicatore di caricamento.
    }
  };

    // Chiama l'API finale per processare il report (salvataggio bozza o finalizzazione).
  const callProcessReportApi = async (
    signedPdfBase64: string | null, // PDF firmato in Base64, o PDF originale se non firmato/bozza.
    p7mBase64: string | null,       // File P7M (firma CAdES) in Base64, se disponibile.
    rtfTextContent: string,         // Contenuto RTF del report.
    isDraft: boolean,               // True se è un salvataggio bozza.
    stayHere: boolean = false       // True per non navigare via dopo l'operazione.
  ) => {
    // Deduplica la lista degli esami aggiuntivi.
    const deduplicatedMoreExams = selectedMoreExams.filter(
      (exam, index, array) => {
        return (
          array.findIndex(
            (e) =>
              e.examId === exam.examId &&
              e.examVersion === exam.examVersion &&
              e.subExamId === exam.subExamId &&
              e.examResultId === exam.examResultId
          ) === index
        );
      }
    );
    const linkedResultsList = deduplicatedMoreExams.map((exam) => ({
      examId: exam.examId,
      examVersion: exam.examVersion,
      subExamId: exam.subExamId,
      examResultId: exam.examResultId,
    }));

    // Corpo della richiesta API.
    // NOTA: p7mBase64 NON viene inviato perché NON esiste in ReportRequestModel del backend
    const body = {
      pdfBase64: signedPdfBase64, // PDF (firmato o meno).
      rtfContent: rtfTextContent, // Contenuto RTF.
      examinationId: Number(selectedExaminationId),
      doctorCode: doctorCode,
      companyId: companyId,
      // isPdfSigned: true solo se c'è una VERA firma digitale (non bypass)
      isPdfSigned: allowMedicalReportDigitalSignature && !isDraft && !BYPASS_SIGNATURE && p7mBase64 !== null && p7mBase64 !== '', // Indica se il PDF inviato è firmato.
      isReportFinalized: !isDraft, // Indica se il report è finalizzato.
      LinkedResultsList: linkedResultsList,
      isSavingDraft: isDraft, // Flag esplicito per il salvataggio bozza.
    };

    // LOG per debug: verifica i valori inviati al backend
    console.log("📤 ProcessReport API Call:", {
      examinationId: body.examinationId,
      isPdfSigned: body.isPdfSigned,
      isReportFinalized: body.isReportFinalized,
      isSavingDraft: body.isSavingDraft,
      hasP7m: p7mBase64 !== null,
      hasPdf: signedPdfBase64 !== null,
    });

    try {
      const response = await fetch(url_processReport(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const responseData = await response.json().catch(() => null);
        console.log("✅ Referto processato con successo (salvato/inviato).");
        console.log("📥 Response data:", responseData);
        setErrorMessage(null); // Pulisce eventuali messaggi di errore precedenti.
        setCachedReportData(null); // Pulisce la cache dopo un salvataggio/invio riuscito.
        setIsModified(false);      // Resetta il flag di modifica.

        // Se il report è finalizzato (non bozza) e l'utente ha l'opzione attiva, stampa il referto.
        if (!isDraft && printReportWhenFinished) {
          // Decide quale PDF stampare: se firmato, usa quello, altrimenti quello originale.
          // Attualmente handlePrintReferto rigenera il PDF non firmato,
          // potrebbe essere necessario adattare se si vuole stampare il PDF firmato `signedPdfBase64`.
          handlePrintReferto(signedPdfBase64 ? signedPdfBase64 : undefined)
        }

        if (!stayHere) { // Se non si deve rimanere sulla pagina.

        }
      } else { // Errore dalla API.
        const errorData = await response.json().catch(() => ({ title: "Errore sconosciuto o risposta non JSON." }));
        console.error("Errore durante l'invio del referto:", errorData, response.status);
        setErrorMessage(`Errore API (${response.status}): ${errorData.title || "Dettagli non disponibili."}`);
      }
    } catch (error: any) {
      console.error("Errore di rete o richiesta fallita durante processReport:", error);
      setErrorMessage(`Errore di rete: ${error.message || "Impossibile contattare il server."}`);
    }
  };


  // Gestisce il processo di "Termina E Invia" o "Salva Bozza".
  const handleProcessReport = async (
    rtfNeedsToBeStored: boolean = false, // Indica se l'RTF deve essere generato e memorizzato.
    isDraft: boolean = false,            // True se si sta salvando una bozza.
    stayHere: boolean = false            // True per rimanere sulla pagina dopo l'operazione.
  ) => {
    setIsProcessing(true); // Mostra indicatore di caricamento.
    setIsDraftOperation(isDraft); // Imposta se l'operazione è una bozza (per il messaggio di caricamento).

    // Salva con parametri che generano i dati del report (PDF e RTF).
    // Il flag `isSigningProcess` è true solo se la firma è abilitata E non è una bozza.
    const reportData = await generateReportData(rtfNeedsToBeStored, (allowMedicalReportDigitalSignature && !isDraft));


    if (reportData?.pdfContent && reportData?.rtfContent) {
      let finalPdfToSend: string | null = reportData.pdfContent; // PDF da inviare (inizialmente quello generato).
      let p7mFileToSend: string | null = null; // File P7M (firma CAdES), inizialmente null.

      // ⚠️ BYPASS: Se bypass è attivo, forza la "firma" (che in realtà è solo decorazione)
      // Se la firma digitale è abilitata E non è una bozza, procedi con la firma.
      if ((allowMedicalReportDigitalSignature && !isDraft) || BYPASS_SIGNATURE) {
        // 1. Salvataggio bozza "tecnica" prima della firma
        await callProcessReportApi(
        finalPdfToSend, // PDF originale da salvare come bozza prima della firma.
        p7mFileToSend,
        reportData.rtfContent,
        true, // Salva come bozza prima di firmare IMPORTANTE
        true // Resta qui dopo il salvataggio della bozza IMPORTANTE
      );

        
        // Recupera il PIN (l'implementazione di getSessionPin è cruciale).
      const pin = await getSessionPin();
      if (!pin) {
        // utente ha annullato o non ha fornito PIN
        setErrorMessage("Firma annullata: PIN non fornito.");
        setIsProcessing(false);
        return;
      }
        try {
          // Logica di firma (MRAS o endpoint locale).
          if (useMRAS) { // Utilizza il servizio MRAS (Electron native).
            const pin = reduxStore.getState().auth.pin;

            // ⚠️ BYPASS FIRMA DIGITALE - Solo header/footer per recupero referti ⚠️
            let footerText = null;
            if (BYPASS_SIGNATURE) {
              console.warn(`⚠️ BYPASS FIRMA DIGITALE ATTIVO - Solo header/footer, NO firma reale`);
              console.warn(`⚠️ Footer personalizzato: "Referto firmato digitalmente da ${OVERRIDE_USER_CN}"`);

              // Specifica il footer text manualmente con il nome del medico desiderato
              footerText = `Referto firmato digitalmente da ${OVERRIDE_USER_CN}`;
              footerText = ``;
            }

            const signResponse = await (window as any).nativeSign.signPdf({
              pdfBase64 : reportData.pdfContent,
              companyId : companyId,
              footerText: footerText,
              useRemote : null,
              otpCode   : null,
              pin       : pin,
              userCN    : reduxStore.getState().auth.userCN,
              bypassSignature: BYPASS_SIGNATURE, // ⚠️ BYPASS: solo header/footer, no firma
            });
            finalPdfToSend = signResponse.signedPdfBase64; // PDF firmato.
            p7mFileToSend  = signResponse.p7mBase64;      // File P7M.
            setLastSignedPdfBase64(finalPdfToSend); // Salva il PDF firmato nello stato.
          } else { // Utilizza l'endpoint di firma locale (vecchio metodo).
            const signApiResponse = await fetch("http://localhost:5000/signpdf", {
              method : "POST",
              headers: { "Content-Type": "application/json" },
              body   : JSON.stringify({
                pdfBase64 : reportData.pdfContent,
                FooterText: "prova footer", // Assicurarsi che i nomi dei parametri siano corretti.
                CompanyId : companyId
              })
            });
            if (!signApiResponse.ok) {
              const errorBody = await signApiResponse.text();
              console.error("Errore API durante la firma del PDF:", signApiResponse.status, errorBody);
              setErrorMessage(`Errore firma PDF (${signApiResponse.status}): ${errorBody || signApiResponse.statusText}`);
              setIsProcessing(false);
              return;
            }
            const signData = await signApiResponse.json();
            finalPdfToSend = signData.signedPdfBase64;
            p7mFileToSend  = signData.p7mBase64;
            // Salva il PDF firmato nello stato
            setLastSignedPdfBase64(finalPdfToSend); // Salva il PDF firmato nello stato.
          }
          // setSignedPdfBase64(finalPdfToSend); // Rimosso: stato non utilizzato.
          // setP7mBase64(p7mFileToSend);       // Rimosso: stato non utilizzato.

        } catch (err: any) { // Errore durante il processo di firma.
          const msg = err.message || '';
          if (msg.includes('PIN non valido') || msg.includes('incorrect PIN')) {
            setErrorMessage('Il PIN inserito non è corretto. Riprova.');
            // apri di nuovo la dialog PIN
            setIsProcessing(false);
            showPinDialog();
            return;
          }
          // altrimenti fallback generico
          setErrorMessage(`Errore durante la firma: ${msg}`);
          setIsProcessing(false);
          return;
        }
      }
      // else: se la firma non è abilitata o è una bozza, `finalPdfToSend` rimane il PDF originale
      // e `p7mFileToSend` rimane `null`.

      // Chiama l'API per salvare/inviare il report con i dati (firmati o meno).
      await callProcessReportApi(
        finalPdfToSend,
        p7mFileToSend,
        reportData.rtfContent,
        isDraft,
        stayHere
      );

    } else { // Errore nella generazione dei dati del report.
        setErrorMessage("Impossibile generare i dati del report per il salvataggio/invio.");
    }
    setIsProcessing(false); // Nasconde indicatore di caricamento alla fine del processo.
  };

  // Chiude l'anteprima del PDF e revoca l'URL del Blob.
  const handleClosePdfPreview = () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
    setPdfUrl(null);
  };

  // Apre il dialogo per la dettatura.
  const handleDictationClick = () => {
    setIsDialogVisible(true);
  };

  // Chiude il dialogo per la dettatura.
  const handleCloseDialog = () => {
    setIsDialogVisible(false);
  };

  // Salva il testo dal dialogo di dettatura inserendolo nell'editor.
  const handleSave = () => {
    if (editorRef.current && editorRef.current.view) {
      editorRef.current.view.focus();
      editorRef.current.view.dispatch(
        editorRef.current.view.state.tr.insertText(dictationText)
      );
      // setIsModified sarà gestito dal plugin.
    }
    setIsDialogVisible(false);
    setDictationText(""); // Pulisce il campo di testo della dettatura.
  };

  // Funzione per renderizzare un item nella ListView dei referti precedenti.
  const renderResultItem = (props: { dataItem: any }) => {
    const er   = props.dataItem.examResult; // Singolo referto.
    const date = new Date(props.dataItem.startDate)
                  .toLocaleDateString("it-IT"); // Formatta la data.
    // Etichetta "Esami di Laboratorio" per specifici tipi di esame.
    const name = [1,2,3,5,8].includes(er.examTypeId)
                ? "Esami di Laboratorio"
                : er.examName;
    return (
      <div onClick={() => handleResultClick(props.dataItem)} className="previous-result-item">
        {date} - {name}
      </div>
    );
  };

  // Gestisce il click su un referto precedente nella ListView.
  // Imposta il referto selezionato e apre il modale di visualizzazione.
const handleResultClick = async (result: any) => {
  setSelectedResult(result);
  setSelectedResultPdf(null);
  setResultPdfError(null);
  setIsModalVisible(true);

  // Estrai i parametri
  const resultId = result.examResult?.resultId?.toString() ?? "";
  const examinationId = result.examinationId?.toString() ?? "";
  const doctorCode = (result.examResult.reportingDoctorCode ?? "").trim();

  // Costruisci la query
  const params = new URLSearchParams({
    resultId,
    examinationId,
    ...(doctorCode ? { doctorCode } : {'doctorCode': 'ND' }) // Aggiungi solo se non vuoto,
  });

  try {
    const response = await fetch(
      `${url_getPatientSignedReport()}?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (response.ok) {
      const base64 = await response.text(); // se ritorni stringa base64
      setSelectedResultPdf(base64 && base64 !== "null" ? base64 : null);
      setResultPdfError(null);
    } else if (response.status === 404) {
      // Prova a leggere il messaggio custom se fornito dal backend
      let msg = "Nessun PDF firmato disponibile per questo esito.";
      try {
        const data = await response.json();
        if (data?.message) msg = data.message;
      } catch { }
      setResultPdfError(msg);
      setSelectedResultPdf(null);
    } else {
      setResultPdfError("Errore durante il recupero del PDF.");
      setSelectedResultPdf(null);
    }
  } catch (error: any) {
    setResultPdfError("Errore di rete o di sistema: " + (error.message ?? ""));
    setSelectedResultPdf(null);
  }
};

  // Gestore dell'evento onMount dell'Editor Kendo.
  // Utilizzato per aggiungere plugin Prosemirror personalizzati (es. per modifiche e readOnly).
  const handleEditorMount = (ev: EditorMountEvent) => {
    const { state } = ev.viewProps;
    const newPlugins = [...state.plugins]; // Copia i plugin esistenti.

    // Plugin per intercettare qualsiasi modifica al documento e impostare `isModified=true`.
    const docChangePlugin = new Plugin({
      view(editorView) {
        return {
          update(view, prevState) {
            if (!view.state.doc.eq(prevState.doc)) { // Confronta se il documento è cambiato.
              setIsModified(true);
            }
          }
        };
      }
    });
    newPlugins.push(docChangePlugin);

    // Plugin per la modalità readOnly, se attiva.
    if (readOnly) {
      newPlugins.push(
        new Plugin({
          props: {
            editable: () => false // Impedisce la modifica del contenuto.
          }
        })
      );
    }

    // Aggiunge il plugin per lo stile dei paragrafi.
    newPlugins.push(paragraphStylerPlugin);

    // Riconfigura lo stato dell'editor con i nuovi plugin.
    const newState = state.reconfigure({ plugins: newPlugins });
    ev.viewProps.state = newState; // Sovrascrive lo stato nelle props della vista.
  };

  return (
    <>
      {/* Visualizzazione di eventuali messaggi di errore */}
    {errorMessage && (
      <div className="k-messagebox k-messagebox-error">
        <span className="k-icon k-i-warning"></span>
        {errorMessage}
      </div>
    )}
    {renderPinDialog()}
    
      {/* Avviso se l'editor è in modalità sola lettura (per referto di altro medico o precedente ad oggi) */}
      {readOnly && openedByOtherDoctor && (
        <div style={{ fontSize: "10pt", color: "red", fontWeight: "bold", margin: "0.5rem 1rem", textAlign: "center", padding: "0.5rem", border: "1px solid red", backgroundColor: "#ffeeee" }}>
          ATTENZIONE: Questo referto è già refertato da un altro medico (anche in bozza) e non è più modificabile.
        </div>
      )}
      {readOnly && !openedByOtherDoctor && (
        <div style={{
          fontSize: "10pt",
          color: "red",
          fontWeight: "bold",
          margin: "0.5rem 1rem",
          textAlign: "center",
          padding: "0.5rem",
          border: "1px solid red",
          backgroundColor: "#ffeeee"
        }}>
          ATTENZIONE: Questo referto è precedente alla data odierna e non è più modificabile.
        </div>
      )}

{/* Splitter principale per dividere la pagina in pannelli ridimensionabili */}
<Splitter
  panes={panes}
  onChange={handlePanesChange}
  style={{ height: readOnly ? "calc(100vh - 40px)" : "100vh" }}
>
  {/* Pannello Sinistro: Frasi Comuni e Referti Precedenti */}
  <div className="left-pane bordered-div">
    {/* Sezione Frasi Comuni */}
    <div className="upper-section">
      <h3 style={{ marginTop: "0.2rem" }}>
        {labels.editorPage.frasiComuni}
      </h3>
      {/* Filtro per le frasi */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0.5rem" }}>
        <span>Filtra:</span>
        <Input
          value={searchTerm}
          onChange={handleSearchChange}
          style={{ flex: 1 }}
          placeholder="Cerca frase..."
        />
      </div>
      {/* Checkbox per opzioni di filtro delle frasi */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.3rem",
          alignItems: "flex-start",
          justifyContent: "start",
          marginTop: "0.2rem",
          marginBottom: "0.5rem",
        }}
      >
        <Checkbox
          checked={includeAllExamsPhrases}
          label="Testi di Tutti gli Esami"
          onChange={(e) => setIncludeAllExamsPhrases(e.value)}
        />
        <Checkbox
          checked={includeAllDoctorsPhrases}
          label="Testi di tutti i medici"
          onChange={(e) => setIncludeAllDoctorsPhrases(e.value)}
        />
        <Checkbox
          checked={includeNotAssignedPhrases}
          label="Includi non assegnate"
          onChange={(e) => setincludeNotAssignedPhrases(e.value)}
        />
      </div>
      {/* TreeView per visualizzare le frasi */}
      <div className="treeview-container">
        <TreeView
          data={treeData}
          expandIcons={true}
          textField="text"
          expandField="expanded"
          childrenField="items"
          onExpandChange={handleExpandChange}
          onItemClick={handleItemClick}
        />
      </div>
    </div>
    <hr />
    {/* Sezione Referti Precedenti */}
    <div className="listview-wrapper">
      <h4 className="listview-title">Esiti Precedenti</h4>
      {isFetchingPreviousResults && (
        <p className="listview-loading">Caricamento in corso...</p>
      )}
      <div className="listview-container">
        <ListView
          data={previousResults}
          item={renderResultItem}
          style={{
            height: "100%",
            cursor: "pointer",
          }}
        />
        {!isFetchingPreviousResults && previousResults.length === 0 && (
          <div style={{ color: "#b91c1c", textAlign: "center", marginTop: "1rem" }}>
            Nessun esito precedente disponibile per questo paziente.
          </div>
        )}
      </div>
    </div>
  </div>

  {/* Pannello Destro: Flexbox, NO Splitter interno! */}
  <div className="right-pane bordered-div">
        {/* Blocco Info Paziente */}
            {patient && (
              <div className="patient-info bordered-div">
                <h3 className="info-pat">Informazioni Paziente</h3>
                <div
                  className="patient-info">
                  <div>
                    <strong>Nome:</strong> {patient.firstName}
                  </div>
                  <div>
                    <strong>Cognome:</strong> {patient.lastName}
                  </div>
                  <div>
                    <strong>Età:</strong> {patient.age} anni
                  </div>
                  {patient.diagnosticQuestion && (
                    <div>
                      <strong>Quesito Diagnostico:</strong>{" "}
                      {patient.diagnosticQuestion}
                    </div>
                  )}
                </div>
              </div>
            )}
          <CustomEditor
            ref={editorRef}
            defaultContent={location.state?.htmlContent || "<p></p><p></p><p></p>"}
            onMount={handleEditorMount}
            onPasteHtml={handlePasteHtml}
            onChange={(e) => setIsModified(true)}
            // @ts-ignore
            paste={pasteSettings}						  
            defaultEditMode="div"
            tools={[
              [Bold, Italic, Underline, Strikethrough],
    //          [Subscript, Superscript],
              [ForeColor, BackColor],
              [CleanFormatting],
              [AlignLeft, AlignCenter, AlignRight, AlignJustify],
              [Indent, Outdent],
              [OrderedList, UnorderedList],
              [Undo, Redo], [ViewHtml],
            ]}
																
          />
          {/* Area Pulsanti Azione */}
          <div className="borderedbottom-div">

            <div>		 
              <Button
                svgIcon={volumeUpIcon}
                onClick={handleDictationClick}
                style={{ display: "none" }}
                title="Avvia Dettatura Vocale"
              >
                Dettatura
              </Button>
              <Button
                svgIcon={imageIcon}
                onClick={openCurrentStudy}
                className="margin-buttons-scar"
                title="Apri immagini dell'esame nel viewer"
              >
                {labels.editorPage.apriImmagini || "Apri Immagini"}
              </Button>
              <Button
                svgIcon={cancelIcon}
                onClick={handleCancel}
                className="margin-buttons-scar"
                title="Annulla le modifiche e torna alla lista"
              >
                {labels.editorPage.annulla || "Annulla"}
              </Button>
              <Button
                svgIcon={eyeIcon}
                onClick={previewPDF}
                className="margin-buttons-scar"
                title="Visualizza anteprima del referto in PDF"
              >
                {labels.editorPage.anteprimaPDF || "Visualizza Referto"}
              </Button>
              <Button
                svgIcon={printIcon}
                onClick={() => handlePrintReferto(lastSignedPdfBase64 ?? undefined)}
                                    
                                  
              
                className="margin-buttons-scar"
                style={{ display: "none" }}
              >
                {labels.editorPage.stampaETerminaReferto || "Stampa Referto"}
              </Button>
                            
              <Button
                svgIcon={downloadIcon}
                onClick={handleDownloadReferto}
                className="margin-buttons-scar"
                style={{ display: "none" }}
                title="Scarica il referto in formato PDF"
              >
                {labels.editorPage.scaricaReferto || "Scarica Referto"}
              </Button>
              <Button
                svgIcon={saveIcon}
                onClick={handleSaveWithoutExit}
                disabled={readOnly}
                className="margin-buttons-scar"
                title="Salva il referto senza chiudere l'editor"
              >
                Salva Bozza
              </Button>
                    
              <Button
                svgIcon={checkIcon}
                onClick={() => handleProcessReport(true, true, false)}
                disabled={readOnly}
                style={{ display: "none" }}
                className="margin-buttons-scar"
                title="Salva come bozza e chiudi l'editor"
              >
                Salva e Chiudi
              </Button>
                      
              <Button
                svgIcon={checkIcon}
                onClick={() => handleProcessReport(true, false, false)}
                disabled={readOnly}
                className="margin-buttons-scar editor-green-button"
                title="Finalizza e invia il referto"
              >
                Termina e Invia
              </Button>

              {/* Area CheckBox */}
              <div style={{
                display: 'flex', gap: '10px', alignItems: 'normal', marginBottom: '0px', marginTop: '5px', fontSize: '0.8rem'
              }}>
                <Checkbox
                  checked={showPrintPreview}
                  label="Mostra anteprima prima di stampare"
                  onChange={e => setShowPrintPreview(e.value)}
                />
                <Checkbox
                  checked={printSignedPdf}
                  label="Stampa referto firmato quando termini (se disponibile)"
                  onChange={e => setPrintSignedPdf(e.value)}
                />
                <Checkbox
                  style={{ display: "none" }}
                  checked={showLivePreview}
                  label=""
                  onChange={e => setShowLivePreview(e.value)}
                />
              </div>
            </div>
          </div>
  </div>

</Splitter>


    {/* Dialogo per la Dettatura */}
    {isDialogVisible && (
        <Dialog title={labels.editorPage.dettatura || "Dettatura"} onClose={handleCloseDialog}>
          <textarea
            style={{ width: "clamp(300px, 80vw, 500px)", height: "200px", margin: "10px 0" }}
            value={dictationText}
            onChange={(e) => setDictationText(e.target.value)}
            placeholder="Inizia a dettare o scrivi qui..."
          />
          <DialogActionsBar>
            <Button onClick={handleCloseDialog}>
              {labels.editorPage.cancella || "Annulla"}
            </Button>
            <Button onClick={handleSave} themeColor="primary">
              {labels.editorPage.salva || "Inserisci Testo"}
            </Button>
          </DialogActionsBar>
        </Dialog>
    )}

      {/* Dialogo di Conferma Annullamento con Modifiche Non Salvate - (Condiviso in caso si esca dall'editor o dall'App)*/ }
      {isCancelDialogVisible && (
        <Dialog
          title="Modifiche non salvate"
          onClose={() => setIsCancelDialogVisible(false)}
        >
          <p>Hai delle modifiche non salvate. Vuoi salvarle prima di {exitReason === "editor" ? "uscire dall'editor" : "chiudere l'applicazione"}?</p>
          <DialogActionsBar>
            <Button
              themeColor="primary"
              onClick={async () => {
                await handleSave();
                setIsCancelDialogVisible(false);
                if (exitReason === "app") {
                  window.electron.ipcRenderer.send('proceed-close');
                } else {
                  // Naviga fuori dall'editor
                  navigate("/", { state: { reload: false } });
                }
              }}
            >
              Sì, salva e chiudi
            </Button>
            <Button
              themeColor="error"
              onClick={() => {
                setIsCancelDialogVisible(false);
                if (exitReason === "app") {
                  window.electron.ipcRenderer.send('proceed-close');
                } else {
                  closeViewer(); // Chiude il viewer se aperto
                  navigate("/", { state: { reload: false } });
                }
              }}
            >
              No, esci senza salvare
            </Button>
            <Button onClick={() => setIsCancelDialogVisible(false)}>
              Annulla
            </Button>
          </DialogActionsBar>
        </Dialog>
      )}

      {/* Componente per l'Anteprima del PDF */}
      {pdfUrl && <PdfPreview pdfUrl={pdfUrl} onClose={() => setPdfUrl(null)} />}


      {/* Modale per la Visualizzazione dei Referti Precedenti */}
      {isModalVisible && selectedResult && (
        <PreviousResultModal
          accNum={selectedResult.examinationMnemonicCodeFull || ""}
          onOpenImages={(accNum) => openViewer(accNum, "add")}
          onClose={() => setIsModalVisible(false)}
          htmlReport={selectedResult.examResult.htmlReport}
          signedPdf={selectedResultPdf ?? undefined}
          pdfError={resultPdfError}
          title={`Referto del ${new Date(selectedResult.startDate).toLocaleDateString("it-IT")} - ${selectedResult.examResult.examName}`}
          reportingDoctor={selectedResult.examResult.reportingDoctor}
          // aggiungi props:
          patientFirstName={selectedResult.examResult.patientFirstName || ""}
          patientLastName={selectedResult.examResult.patientLastName || ""}
        />
      )}
      {/* Dialogo di Caricamento durante il Salvataggio/Firma */}
      {isProcessing && (
        <Dialog               /*  tolto modal / closeButton  */
          title="Elaborazione in corso..."
          onClose={() => {}}   /*  disabilita la chiusura manuale  */
        >
          <div style={{ padding: "30px 20px", textAlign: "center" }}>
            <span className="k-icon k-i-loading"
                  style={{ fontSize: "3em", marginBottom: "15px", display: "block" }}
            />
            <p>
              {allowMedicalReportDigitalSignature && !isDraftOperation
                ? "Attendere, stiamo completando il salvataggio e la firma digitale del referto..."
                : "Attendere, stiamo completando il salvataggio del referto..."}
            </p>
          </div>
        </Dialog>
      )}
    </>
  );
};

export default EditorPage;
