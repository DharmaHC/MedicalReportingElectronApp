import React, { useEffect, useState } from "react";
import {
  Splitter,
  SplitterPaneProps,
  SplitterOnChangeEvent,
} from "@progress/kendo-react-layout";
import { Dialog, DialogActionsBar } from "@progress/kendo-react-dialogs";

import ProfileDropDown from "../components/ProfileDropDown";
import BulkSignModal from "../components/BulkSignModal";
import SignProvidersConfigModal from "../components/SignProvidersConfigModal";

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
import { openModal as openBulkSignModal } from "../store/bulkSignSlice";
import { RootState } from "../store";
import { url_doctors_id, url_changePassword, url_getReportsToSign } from "../utility/urlLib";
import { setFilters } from "../store/filtersSlice";

import moment from "moment";

const HomePage = () => {

const dispatch = useDispatch();
  const location = useLocation();
  const navigate = useNavigate();

  // Autenticazione
  const token = useSelector((state: RootState) => state.auth.token);
  const userName = useSelector((state: RootState) => state.auth.userName);
  const doctorCode = useSelector((state: RootState) => state.auth.doctorCode);
  const signatureType = useSelector((state: RootState) => state.auth.signatureType);
  const allowMedicalReportDigitalSignature = useSelector((state: RootState) => state.auth.allowMedicalReportDigitalSignature);

  // Verifica se l'utente è amministratore
  const adminUsers = ["FRSRFL72R25H282U", "GRRLCU88P05H501J"];
  const isAdmin = adminUsers.includes(userName || "");

  // Stato per cambio password (Dialog)
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Stato per configurazione provider firma (solo admin)
  const [providersConfigVisible, setProvidersConfigVisible] = useState(false);

  // Stato per il warning "referti in attesa di firma" al logout
  const [pendingSignWarning, setPendingSignWarning] = useState<{
    visible: boolean;
    count: number;
    dateFrom: string;
    dateTo: string;
    pendingLogout: (() => void) | null;
  }>({ visible: false, count: 0, dateFrom: '', dateTo: '', pendingLogout: null });

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

  // Controlla referti in attesa di firma prima di eseguire il logout
  const checkPendingReportsBeforeLogout = async (doLogout: () => void) => {
    // Il warning si applica solo ai medici con firma automatica
    if (!allowMedicalReportDigitalSignature || signatureType !== 'automatic' || !doctorCode || !token) {
      doLogout();
      return;
    }
    try {
      const dateFrom = new Date();
      dateFrom.setMonth(dateFrom.getMonth() - 1);
      const dateTo = new Date();
      const params = new URLSearchParams({
        doctorCode,
        dateFrom: dateFrom.toISOString().split('T')[0],
        dateTo: dateTo.toISOString().split('T')[0],
        states: '7'  // Solo "Da Firmare"
      });
      const response = await fetch(`${url_getReportsToSign()}?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const reports: any[] = await response.json();
        const count = reports?.length ?? 0;
        if (count > 0) {
          const printDates = reports
            .map(r => r.printDate ? new Date(r.printDate) : null)
            .filter(Boolean) as Date[];
          const minDate = printDates.length > 0
            ? new Date(Math.min(...printDates.map(d => d.getTime())))
            : dateFrom;
          const maxDate = printDates.length > 0
            ? new Date(Math.max(...printDates.map(d => d.getTime())))
            : dateTo;
          setPendingSignWarning({
            visible: true,
            count,
            dateFrom: minDate.toLocaleDateString('it-IT'),
            dateTo: maxDate.toLocaleDateString('it-IT'),
            pendingLogout: doLogout
          });
          return;
        }
      }
    } catch {
      // In caso di errore nella verifica, procedi comunque con il logout
    }
    doLogout();
  };

  // LOGOUT
  const doLogout = () => {
    dispatch(logout());
    dispatch(clearSelectedMoreExams());
    dispatch(clearRegistrations());
    dispatch(resetExaminationState());
    sessionStorage.removeItem('medreport_editor_zoom');
    persistor.purge();
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  const handleLogout = () => {
    checkPendingReportsBeforeLogout(doLogout);
  };


  // Naviga alla pagina di registrazione utente (solo per admin)
  const handleRegisterUser = () => {
    navigate("/register-user");
  };

  // Naviga alla pagina di rigenerazione PDF (solo per admin)
  const handleRegeneratePdf = () => {
    navigate("/regenerate-pdf");
  };

  // Apre il modale per la firma massiva remota
  const handleOpenBulkSign = () => {
    dispatch(openBulkSignModal());
  };

  // Apre la configurazione dei provider di firma (solo admin)
  const handleOpenProvidersConfig = () => {
    setProvidersConfigVisible(true);
  };

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

  const doLogoutAndExit = () => {
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

  const handleLogoutAndExit = () => {
    checkPendingReportsBeforeLogout(doLogoutAndExit);
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
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
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
                  onBulkSign={handleOpenBulkSign}
                  isAdmin={isAdmin}
                  onRegisterUser={isAdmin ? handleRegisterUser : undefined}
                  onRegeneratePdf={isAdmin ? handleRegeneratePdf : undefined}
                  onConfigureProviders={isAdmin ? handleOpenProvidersConfig : undefined}
                />
              </div>
            </div>

            <h5>{labels.homepage.elencoRegistrazioni}</h5>
            <div style={{ flex: 1, overflow: "hidden" }}>
              {filtersReady && <ElencoRegistrazioni />}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            <h5>{labels.homepage.prestazioniRisultati}</h5>
            <div style={{ flex: 1, overflow: "hidden" }}>
              {filtersReady && <PrestazioniRisultati />}
            </div>
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

      {/* Warning: referti in attesa di firma al logout */}
      {pendingSignWarning.visible && (
        <Dialog
          title="Referti in attesa di firma"
          onClose={() => setPendingSignWarning(prev => ({ ...prev, visible: false }))}
          style={{ maxWidth: '520px' }}
        >
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
            <p style={{ fontWeight: 'bold', fontSize: '16px', color: '#b71c1c', marginBottom: '8px' }}>
              Ci sono <strong>{pendingSignWarning.count}</strong> referti in attesa di firma digitale
            </p>
            <p style={{ marginBottom: '8px' }}>
              Periodo: <strong>{pendingSignWarning.dateFrom}</strong> – <strong>{pendingSignWarning.dateTo}</strong>
            </p>
            <p style={{ color: '#555', fontSize: '13px', marginTop: '12px' }}>
              Questi referti sono stati salvati per la firma massiva ma non sono ancora stati firmati.<br />
              Si consiglia di procedere alla firma prima di uscire.
            </p>
          </div>
          <DialogActionsBar>
            <button
              className="k-button k-button-md k-rounded-md k-button-solid k-button-solid-primary"
              style={{ fontWeight: 'bold' }}
              onClick={() => {
                setPendingSignWarning(prev => ({ ...prev, visible: false }));
                dispatch(openBulkSignModal());
              }}
            >
              Vai alla Firma Massiva
            </button>
            <button
              className="k-button k-button-md k-rounded-md k-button-solid"
              onClick={() => {
                const fn = pendingSignWarning.pendingLogout;
                setPendingSignWarning(prev => ({ ...prev, visible: false }));
                fn?.();
              }}
            >
              Esci Comunque
            </button>
          </DialogActionsBar>
        </Dialog>
      )}

      {/* Modale Firma Massiva Remota (gestito via Redux) */}
      <BulkSignModal />

      {/* Modale Configurazione Provider Firma (solo admin) */}
      <SignProvidersConfigModal
        isOpen={providersConfigVisible}
        onClose={() => setProvidersConfigVisible(false)}
      />
    </>
  );
};

export default HomePage;
