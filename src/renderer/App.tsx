	// src/renderer/App.tsx
import React, { useEffect, useCallback, useState } from "react";
import { HashRouter as Router, Route, Routes, useLocation } from "react-router-dom";
import "./App.css";
import "bootstrap/dist/css/bootstrap.min.css";
import { persistor } from "./store";
import Login from "./pages/Login";
import HomePage from "./pages/HomePage";
import EditorPage from "./pages/EditorPage";
import PrescriptionEditorModal from "./components/PrescriptionEditorModal";

import "@progress/kendo-theme-fluent/dist/all.css";
import "@progress/kendo-theme-fluent/dist/all.scss";

import { useDispatch, useSelector } from "react-redux";
import { setToken, logout } from "./store/authSlice";
import { clearRegistrations } from "./store/registrationSlice";
import { resetExaminationState, clearSelectedMoreExams } from "./store/examinationSlice";
import { RootState } from "./store";
import { url_token } from "./utility/urlLib";
import ProtectedRoute from "./utility/ProtectedRoute";
import UpdateNotifier from './components/UpdateNotifier';
import { CompanyUISettings } from "../globals";
const ipcRenderer = window.electron?.ipcRenderer;

function AppWrapper() {
  const dispatch = useDispatch();
  const [companyUISettings, setCompanyUISettings] = useState<CompanyUISettings | null>(null);

  // --------------------------------------------------
  // Carica le impostazioni UI dell'azienda
  // --------------------------------------------------
  useEffect(() => {
    const loadUISettings = async () => {
      try {
        // Usa IPC diretto come per company-footer-settings (più affidabile)
        const settings = await window.electron.ipcRenderer.invoke('get-company-ui-settings');
        setCompanyUISettings(settings);
      } catch (error) {
        console.error("Errore caricamento company-ui-settings:", error);
        // In caso di errore, usa valori di default
        setCompanyUISettings({
          header: {
            logo: {
              url: "https://referti.asterdiagnostica.it/images/logo.png",
              link: "http://www.asterdiagnostica.it/",
              alt: "Logo Aster"
            },
            title: {
              text: "Refertazione Medica",
              color: "rgb(34, 154, 97)",
              fontSize: "30px"
            }
          },
          footer: {
            copyright: "© 2017 Aster Diagnostica - Direttore Sanitario: Dott. Girardi Domingo",
            poweredBy: {
              text: "Powered by",
              link: "https://www.dharmahealthcare.net",
              name: "Dharma Healthcare"
            }
          }
        });
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
  // --------------------------------------------------
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const response = await fetch(url_token, {
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
  }, [dispatch]);

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
