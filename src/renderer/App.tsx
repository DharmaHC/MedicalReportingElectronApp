	// src/renderer/App.tsx
import React, { useEffect, useCallback } from "react";
import { HashRouter as Router, Route, Routes, useLocation } from "react-router-dom";
import "./App.css";
import "bootstrap/dist/css/bootstrap.min.css";
import { persistor } from "./store";
import Login from "./pages/Login";
import HomePage from "./pages/HomePage";
import EditorPage from "./pages/EditorPage";

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
const ipcRenderer = window.electron?.ipcRenderer;

function AppWrapper() {
  const dispatch = useDispatch();

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

  return (
    <div className="app-container">
        {!hideHeaderFooter && (
        <header className="navbar">
          <div className="container">
            <div className="row">
              {/* Logo */}
              <div className="col-md-5">
                <div className="logo">
                  <a href="http://www.asterdiagnostica.it/">
                    <img
                      className="img-responsive"
                      src="https://referti.asterdiagnostica.it/images/logo.png"
                      alt="Logo Aster"
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
                    color: "rgb(34, 154, 97)",
                    fontSize: "30px",
                  }}
                >
                  Refertazione Medica
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
                <p>&copy; 2017 Aster Diagnostica - Direttore Sanitario: Dott. Girardi Domingo</p>
                <p>
                  Powered by <a href="https://www.dharmahealthcare.net">Dharma Healthcare</a>
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
