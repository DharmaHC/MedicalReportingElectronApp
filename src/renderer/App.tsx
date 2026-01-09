	// src/renderer/App.tsx
import React, { useEffect, useCallback, useState } from "react";
import { HashRouter as Router, Route, Routes, useLocation } from "react-router-dom";
import "./App.css";
import "bootstrap/dist/css/bootstrap.min.css";
import { persistor } from "./store";
import Login from "./pages/Login";
import HomePage from "./pages/HomePage";
import EditorPage from "./pages/EditorPage";
import RegisterUser from "./pages/RegisterUser";
import RegeneratePdfPage from "./pages/RegeneratePdfPage";
import PrescriptionEditorModal from "./components/PrescriptionEditorModal";

import "@progress/kendo-theme-fluent/dist/all.css";
import "@progress/kendo-theme-fluent/dist/all.scss";

import { useDispatch, useSelector } from "react-redux";
import { setToken, logout } from "./store/authSlice";
import { clearRegistrations } from "./store/registrationSlice";
import { resetExaminationState, clearSelectedMoreExams } from "./store/examinationSlice";
import { RootState } from "./store";
import { url_token, setApiBaseUrl } from "./utility/urlLib";
import ProtectedRoute from "./utility/ProtectedRoute";
import UpdateNotifier from './components/UpdateNotifier';
import { CompanyUISettings } from "../globals";
const ipcRenderer = window.electron?.ipcRenderer;

function AppWrapper() {
  const dispatch = useDispatch();
  const [companyUISettings, setCompanyUISettings] = useState<CompanyUISettings | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  // --------------------------------------------------
  // Carica le impostazioni UI dell'azienda
  // --------------------------------------------------
  useEffect(() => {
    const loadUISettings = async () => {
      try {
        // Usa IPC diretto come per company-footer-settings (più affidabile)
        const settings = await window.electron.ipcRenderer.invoke('get-company-ui-settings');
        setCompanyUISettings(settings);

        // ⚠️ IMPORTANTE: Verifica che apiBaseUrl sia configurato
        if (!settings.apiBaseUrl || settings.apiBaseUrl.trim() === '') {
          const errorMsg =
            "⚠️ ERRORE DI CONFIGURAZIONE\n\n" +
            "Il campo 'apiBaseUrl' non è configurato in company-ui-settings.json\n\n" +
            "Percorso file configurazione:\n" +
            "C:\\ProgramData\\MedReportAndSign\\config\\company-ui-settings.json\n\n" +
            "Aggiungi il campo:\n" +
            '  "apiBaseUrl": "https://tuo-server.it/api/"';

          console.error(errorMsg);
          setConfigError(errorMsg);
          return;
        }

        // Inizializza l'URL base delle API
        setApiBaseUrl(settings.apiBaseUrl);
        console.log("✓ API Base URL caricato da configurazione:", settings.apiBaseUrl);
        setConfigError(null);

      } catch (error) {
        console.error("Errore caricamento company-ui-settings:", error);

        const errorMsg =
          "⚠️ ERRORE CARICAMENTO CONFIGURAZIONE\n\n" +
          `Impossibile caricare company-ui-settings.json\n\n` +
          `Errore: ${error}\n\n` +
          "Verifica che il file esista in:\n" +
          "C:\\ProgramData\\MedReportAndSign\\config\\company-ui-settings.json\n\n" +
          "oppure in:\n" +
          "C:\\Program Files\\MedReportAndSign\\resources\\assets\\company-ui-settings.json";

        console.error(errorMsg);
        setConfigError(errorMsg);
      }
    };
    loadUISettings();
  }, []);

  // --------------------------------------------------
  // Forza logout (se l'utente precedente non si è sloggato)
  // --------------------------------------------------
 useEffect(() => {
    dispatch(logout());
  }, [dispatch]);

// Stato Redux per sapere se l’editor è aperto e ha modifiche
  const isEditorOpen = useSelector((state: RootState) => state.editor?.isOpen);
  const isEditorModified = useSelector((state: RootState) => state.editor?.hasUnsavedChanges);

  // --------------------------------------------------
  // Gestione chiusura applicazione con editor modificato
  // --------------------------------------------------
  useEffect(() => {
    if (!ipcRenderer) return;

    // Quando ricevi la richiesta di chiusura dal main
    ipcRenderer.on('check-editor-unsaved', () => {
      // Se l’editor è aperto e modificato, mostra il dialog di EditorPage!
      if (isEditorOpen && isEditorModified) {
        // Usa un eventEmitter/dispatch Redux per notificare EditorPage!
        window.dispatchEvent(new Event('show-editor-cancel-dialog'));
      } else {
        // Nessuna modifica, si può chiudere
        ipcRenderer.send('proceed-close');
      }
    });

    return () => {
      ipcRenderer.removeAllListeners('check-editor-unsaved');
    };
  }, [isEditorOpen, isEditorModified]);

  const rememberMe = useSelector((state: RootState) => state.auth.rememberMe);
  const location = useLocation();

  const handleLogout = useCallback(() => {
    dispatch(clearSelectedMoreExams());
    dispatch(clearRegistrations());
    dispatch(resetExaminationState());
    // Pulisci i dati persistiti
    persistor.purge();
  }, [dispatch]);

  // --------------------------------------------------
  // 1. useEffect per montaggio iniziale: fetch token
  // ⚠️ IMPORTANTE: Dipende da companyUISettings per aspettare che la configurazione sia caricata
  // --------------------------------------------------
  useEffect(() => {
    // Non eseguire se la configurazione non è ancora caricata
    if (!companyUISettings) {
      return;
    }

    const fetchToken = async () => {
      try {
        const response = await fetch(url_token(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: "client", clientSecret: "secret" }),
        });

        if (response.ok) {
          const { accessToken } = await response.json();

          dispatch(setToken(accessToken));
        } else {
          console.error("Failed to fetch token");
        }
      } catch (error) {
        console.error("Error fetching token:", error);
      }
    };


    fetchToken();
  }, [dispatch, companyUISettings]);

  // --------------------------------------------------
  // 2. useEffect per onBeforeUnload / rememberMe
  //    include handleLogout tra le dipendenze
  // --------------------------------------------------
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!rememberMe) {
												 
        sessionStorage.setItem("lastUnloadTime", Date.now().toString());
      }
    };

    const checkIfLeavingPage = () => {
      const lastTime = parseInt(sessionStorage.getItem("lastUnloadTime") || "0", 10);
											   

      if (Date.now() - lastTime > 30000 && !rememberMe) {
        handleLogout();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    checkIfLeavingPage();

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [rememberMe, handleLogout]);

  // Nasconde header/footer se non siamo su "/login"
  // Se l'URL non è "/login", nascondiamo l'header e il footer
  const hideHeaderFooter = location.pathname !== "/login";

  // Mostra errore di configurazione se presente
  if (configError) {
    return (
      <div className="app-container" style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f8d7da',
        padding: '20px'
      }}>
        <div style={{
          maxWidth: '800px',
          backgroundColor: 'white',
          border: '3px solid #dc3545',
          borderRadius: '10px',
          padding: '30px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{
            color: '#dc3545',
            marginBottom: '20px',
            fontSize: '24px',
            fontWeight: 'bold'
          }}>
            ⚠️ Errore di Configurazione
          </h2>
          <pre style={{
            backgroundColor: '#f8f9fa',
            padding: '20px',
            borderRadius: '5px',
            fontSize: '14px',
            fontFamily: 'Consolas, Monaco, monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: '#212529',
            lineHeight: '1.6'
          }}>
            {configError}
          </pre>
          <div style={{ marginTop: '20px', fontSize: '14px', color: '#6c757d' }}>
            <p>
              <strong>Nota:</strong> Riavvia l'applicazione dopo aver corretto il file di configurazione.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Non renderizzare nulla se le impostazioni UI non sono ancora caricate
  if (!companyUISettings) {
    return <div className="app-container">Caricamento...</div>;
  }

  return (
    <div className="app-container">
        {!hideHeaderFooter && (
        <header className="navbar">
          <div className="container">
            <div className="row">
              {/* Logo */}
              <div className="col-md-5">
                <div className="logo">
                  <a href={companyUISettings.header.logo.link}>
                    <img
                      className="img-responsive"
                      src={companyUISettings.header.logo.url}
                      alt={companyUISettings.header.logo.alt}
                    />
                  </a>
                </div>
              </div>
              {/* Titolo */}
              <div className="col-md-7">
                <h2
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    textAlign: "center",
                    color: companyUISettings.header.title.color,
                    fontSize: companyUISettings.header.title.fontSize,
                  }}
                >
                  {companyUISettings.header.title.text}
                </h2>
              </div>
            </div>
          </div>
        </header>
      )}

      <main className="main-content">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/register-user" element={<RegisterUser />} />
            <Route path="/regenerate-pdf" element={<RegeneratePdfPage />} />
          </Route>
        </Routes>
      </main>

      {!hideHeaderFooter && (
        <footer className="app-footer">
          <div className="container">
            <div className="row margin-t-20">
              <div className="col-md-12">
                <p>{companyUISettings.footer.copyright}</p>
                <p>
                  {companyUISettings.footer.poweredBy.text}{" "}
                  <a href={companyUISettings.footer.poweredBy.link}>
                    {companyUISettings.footer.poweredBy.name}
                  </a>
                </p>
              </div>
            </div>
            {/* <div className="row">
              <div className="col-md-12">
                <p>
                  Aster Diagnostica &egrave; un marchio registrato utilizzato dalle societ&agrave; Aster Diagnostica Srl e
                  Radiologia Mostacciano Srl. | Note Legali | Privacy
                </p>
              </div>
            </div> */}
          </div>
        </footer>
      )}
      {/* QUI! Notifica aggiornamento visibile sempre */}
      <UpdateNotifier />
      {/* Modal editor prescrizioni - sempre montato, visibile quando isEditingPrescription è true */}
      <PrescriptionEditorModal />
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppWrapper />
    </Router>
  );
}

export default App;
