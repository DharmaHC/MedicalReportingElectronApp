import React, { useEffect, useState } from "react";
import {
  Splitter,
  SplitterPaneProps,
  SplitterOnChangeEvent,
} from "@progress/kendo-react-layout";
import { Dialog, DialogActionsBar } from "@progress/kendo-react-dialogs";

import ProfileDropDown from "../components/ProfileDropDown";
import BulkSignModal from "../components/BulkSignModal";

import { useLocation, useNavigate } from "react-router-dom";
import labels from "../utility/label";
import "./HomePage.css";

import GestioneReferti from "../components/GestioneReferti";
import ElencoRegistrazioni from "../components/ElencoRegistrazioni";
import PrestazioniRisultati from "../components/PrestazioniRisultati";

import { useDispatch, useSelector } from "react-redux";
import { logout } from "../store/authSlice";
import { persistor } from "../store";
import { clearRegistrations } from "../store/registrationSlice";
import {
  resetExaminationState,
  clearSelectedMoreExams
} from "../store/examinationSlice";
import { RootState } from "../store";
import { url_doctors_id, url_changePassword } from "../utility/urlLib"; // <== Assicurati di importare url_changePassword
import { setFilters } from "../store/filtersSlice";

import moment from "moment";

const HomePage = () => {

const dispatch = useDispatch();
  const location = useLocation();
  const navigate = useNavigate();

  // Autenticazione
  const token = useSelector((state: RootState) => state.auth.token);
  const userName = useSelector((state: RootState) => state.auth.userName);

  // Verifica se l'utente è amministratore
  const adminUsers = ["FRSRFL72R25H282U", "GRRLCU88P05H501J"];
  const isAdmin = adminUsers.includes(userName || "");

  // Stato per cambio password (Dialog)
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Stato per firma massiva remota
  const [bulkSignModalVisible, setBulkSignModalVisible] = useState(false);

  // Nome/descrizione medico
  const [doctorPropeName, setDoctorPropeName] = useState("");
  const [doctorSex, setDoctorSex] = useState<string | null>(null);

  // Filtro per GestioneReferti
  const [filtersReady, setFiltersReady] = useState(false);

  // Splitter (layout)
  const [outerPanes, setOuterPanes] = useState<SplitterPaneProps[]>([
    { size: "23%", min: "20%", collapsible: true, resizable: true },
    { min: "20%", collapsible: true, resizable: true },
  ]);
  const [innerPanes, setInnerPanes] = useState<SplitterPaneProps[]>([
    { collapsible: true, resizable: true },
    { collapsible: true, resizable: true },
  ]);

  const handleOuterPanesChange = (event: SplitterOnChangeEvent) => {
    setOuterPanes(event.newState);
  };
  const handleInnerPanesChange = (event: SplitterOnChangeEvent) => {
    setInnerPanes(event.newState);
  };

  // ---- FUNZIONI CAMBIO PASSWORD ---------------------------------
  // Apre il dialog di cambio password
  const handleOpenChangePassword = () => {
    setChangePasswordVisible(true);
  };

  const handleChangePasswordSubmit = async () => {
    // Validazione base
    if (!currentPassword || !newPassword || !confirmPassword) {
      alert("Compila tutti i campi (password attuale, nuova e conferma).");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("La nuova password e la conferma non coincidono.");
      return;
    }

    try {
      const response = await fetch(url_changePassword(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userName: userName, // se la tua API usa userName
          oldPassword: currentPassword,
          newPassword: newPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert("Errore nel cambio password: " + JSON.stringify(errorData));
        return;
      }

      alert("Password aggiornata con successo!");
      // Reset campi e chiudi dialog
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setChangePasswordVisible(false);
    } catch (error) {
      alert("Errore durante il cambio password, riprova piÃ¹ tardi.");
      console.error(error);
    }
  };

  const handleCancelChangePassword = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setChangePasswordVisible(false);
  };

  // ---- FINE FUNZIONI CAMBIO PASSWORD ---------------------------

  // LOGOUT
  const handleLogout = () => {
    dispatch(logout());
    dispatch(clearSelectedMoreExams());
    dispatch(clearRegistrations());
    dispatch(resetExaminationState());
    sessionStorage.removeItem('medreport_editor_zoom');
    persistor.purge();
    setTimeout(() => {
      window.location.reload();
    }, 100); // oppure 0
  };


  // Naviga alla pagina di registrazione utente (solo per admin)
  const handleRegisterUser = () => {
    navigate("/register-user");
  };

  // ---- FUNZIONI FIRMA MASSIVA REMOTA ---------------------------
  const handleOpenBulkSign = () => {
    setBulkSignModalVisible(true);
  };

  const handleCloseBulkSign = () => {
    setBulkSignModalVisible(false);
  };
  // ---- FINE FUNZIONI FIRMA MASSIVA REMOTA ----------------------

  // Helper per determinare il titolo in base al sesso
  const getDoctorTitle = (sex: string | null): string => {
    if (!sex) return "Dott."; // Fallback se sex è null o undefined

    try {
      const normalizedSex = sex.toString().trim().toUpperCase();

      // Formato numerico: 2 = Femmina, 1 = Maschio
      if (normalizedSex === "2") return "Dott.ssa";
      if (normalizedSex === "1") return "Dott.";

      // Formato testuale
      if (normalizedSex === "F" ||
          normalizedSex === "FEMALE" ||
          normalizedSex === "FEMMINA") {
        return "Dott.ssa";
      }

      if (normalizedSex === "M" ||
          normalizedSex === "MALE" ||
          normalizedSex === "MASCHIO") {
        return "Dott.";
      }

      // Fallback per valori non riconosciuti
      return "Dott.";
    } catch (error) {
      console.warn("Errore nel determinare il titolo del medico:", error);
      return "Dott."; // Fallback in caso di errore
    }
  };

  const handleLogoutAndExit = () => {

  if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.send('app-quit');
  dispatch(logout());
  dispatch(clearSelectedMoreExams());
  dispatch(clearRegistrations());
  dispatch(resetExaminationState());
  persistor.purge();

  } else {
    window.location.reload();
  }
};

  // FetchDoctorInfo"
  const fetchDoctorInfo = async () => {
    if (!userName || !token) return;
    try {
      const response = await fetch(`${url_doctors_id()}?userName=${userName}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          setDoctorPropeName(data.doctorDescription);
          setDoctorSex(data.sex || null);
        } else {
          console.error("Response is not JSON");
        }
      } else {
        console.error("Failed to fetch doctors:", response.status);
      }
    } catch (error) {
      console.error("Error fetching doctors:", error);
    }
  };

  // useEffect Principale (filtri)
  useEffect(() => {
    if (location.state?.reload === false) {
      console.log("Torno dall'editor con reload=false => non resetto nulla");
      setFiltersReady(true);
      return;
    }
    if (location.state?.reload === true) {
      console.log("Torno dall'editor con reload=true => rifaremo la ricerca");
      setFiltersReady(true);
      return;
    }
    // Primo accesso
    console.log("Primo accesso: imposto filtri di default e reset");
    const lastPeriod = localStorage.getItem("lastSelectedPeriod");

    let fromDate = moment().subtract(1, "weeks").startOf("day");
    let toDate = moment().endOf("day");
    let selectedPeriod = { text: "Una Settimana", value: "Una Settimana" };

    if (lastPeriod) {
      if (lastPeriod === "Tre Giorni") {
        fromDate = moment().subtract(2, "days").startOf("day");
        toDate = moment().endOf("day");
        selectedPeriod = { text: "Tre Giorni", value: "Tre Giorni" };
      } else if (lastPeriod === "Una Settimana") {
        fromDate = moment().subtract(6, "days").startOf("day");
        toDate = moment().endOf("day");
        selectedPeriod = { text: "Una Settimana", value: "Una Settimana" };
      } else if (lastPeriod === "Un Mese") {
        fromDate = moment().subtract(1, "months").startOf("day");
        toDate = moment().endOf("day");
        selectedPeriod = { text: "Un Mese", value: "Un Mese" };
      }
    }

    dispatch(
      setFilters({
        fromDate: fromDate.format("YYYY-MM-DD"),
        toDate: toDate.format("YYYY-MM-DD"),
        selectedPeriod: selectedPeriod,
        completedExaminations: false,
        searchByEacWithdrawalDate: false,
        lastName: "",
        firstName: "",
        searchMode: "contain",
        selectedDoctor: { text: "", value: "" },
      })
    );
    dispatch(resetExaminationState());
    dispatch(clearRegistrations());
    setFiltersReady(true);
  }, [dispatch, location.state]);

  // Carica info medico
  useEffect(() => {
    fetchDoctorInfo();
  }, []);


  return (
    <>
      <Splitter
        panes={outerPanes}
        onChange={handleOuterPanesChange}
        style={{ height: "100vh" }}
      >
        <div>
          <h4>{labels.homepage.gestioneReferti}</h4>
          {filtersReady && <GestioneReferti />}
        </div>

        <Splitter
          orientation="vertical"
          panes={innerPanes}
          onChange={handleInnerPanesChange}
        >
          <div>
            {/* Header a sinistra */}
            <div className="header">
              <div className="header-left">
                {doctorPropeName && (
                  <h4 className="less-margin">{getDoctorTitle(doctorSex)} {doctorPropeName}</h4>
                )}
              </div>

              {/* ---- (3) DropDownButton "Profilo" con gearIcon */}
              <div className="header-right">
        				<ProfileDropDown
                  onLogout={handleLogout}
                  onChangePassword={handleOpenChangePassword}
                  onLogoutAndExit={handleLogoutAndExit}
                  isAdmin={isAdmin}
                  onRegisterUser={isAdmin ? handleRegisterUser : undefined}
                  onBulkSign={handleOpenBulkSign}
                />
              </div>
            </div>

            <h5>{labels.homepage.elencoRegistrazioni}</h5>
            {filtersReady && <ElencoRegistrazioni />}
          </div>

          <div>
            <h5>{labels.homepage.prestazioniRisultati}</h5>
            {filtersReady && <PrestazioniRisultati />}
          </div>
        </Splitter>
      </Splitter>

      {/* (4)  Dialog per CAMBIO PASSWORD, fuori dal <Splitter> */}
      {changePasswordVisible && (
        <Dialog
          title="Cambia Password"
          onClose={handleCancelChangePassword}
        >
          <div style={{ minWidth: "320px", padding: "12px" }}>
            <div style={{ marginBottom: "12px" }}>
              <label>Password Attuale</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                style={{ width: "100%", marginTop: "4px" }}
              />
            </div>
            <div style={{ marginBottom: "12px" }}>
              <label>Nuova Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ width: "100%", marginTop: "4px" }}
              />
            </div>
            <div style={{ marginBottom: "12px" }}>
              <label>Conferma Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{ width: "100%", marginTop: "4px" }}
              />
            </div>
          </div>

          <DialogActionsBar>
            <button onClick={handleCancelChangePassword}>
              Annulla
            </button>
            <button onClick={handleChangePasswordSubmit}>
              Conferma
            </button>
          </DialogActionsBar>
        </Dialog>
      )}

      {/* (5) Modal per FIRMA MASSIVA REMOTA */}
      {bulkSignModalVisible && (
        <BulkSignModal
          visible={bulkSignModalVisible}
          onClose={handleCloseBulkSign}
        />
      )}
    </>
  );
};

export default HomePage;
