import React, { useEffect, useState, useCallback } from "react";
import { DatePicker } from "@progress/kendo-react-dateinputs";
import { DropDownList, MultiSelect } from "@progress/kendo-react-dropdowns";
import { Checkbox, Input } from "@progress/kendo-react-inputs";
import { Button } from "@progress/kendo-react-buttons";
import { TabStrip, TabStripTab } from "@progress/kendo-react-layout";
import labels from "../utility/label";
import "./GestioneReferti.css";
import moment from "moment";

import {
  url_getWorkareas,
  url_getWorkareasDefault,
  url_getClinicDepartements,
  url_getClinicDepartementsDefault,
  url_doctors,
  url_worklist,
  url_getUserDetailsId,
  url_getDistinctExamNames
} from "../utility/urlLib";

import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store";
import { startLoading, stopLoading } from "../store/loadingSlice";
import LoadingModal from "../components/LoadingModal";
import { setRegistrations } from "../store/registrationSlice";
import {
  resetExaminationState,
  setSelectedPatientId,
  setSelectedExaminationId,
  setSelectedFromDate,
  setSelectedToDate,
} from "../store/examinationSlice";
import { setFilters } from "../store/filtersSlice";
import { useLocation } from "react-router-dom";

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Tipi â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface Workarea         { workareaId: string;  workareaDescription: string; }
interface ClinicDepartment { clinicDepartmentId: string; clinicDepartmentDescription: string; }
interface Doctor           { doctorCode: string; doctorDescription: string; }
type Sectors = Record<string, boolean>;
type Units   = Record<string, boolean>;

/* ═════════════════════════════════════════════════════════════ */
const GestioneReferti: React.FC = () => {
  /* Redux / Router */
  const dispatch  = useDispatch();
  const location  = useLocation();
  const userId    = useSelector((s: RootState) => s.auth.userId);
  const token     = useSelector((s: RootState) => s.auth.token);
  const doctorCodeCurrentUser = useSelector((s: RootState) => s.auth.doctorCode);
  const isTechnician = useSelector((s: RootState) => s.auth.isTechnician);
  const isLoading = useSelector((s: RootState) => s.loading.isLoading);

  /* Filtri globali */
  const {
    lastName, firstName, selectedDoctor, searchMode,
    fromDate, toDate, units, sectors, selectedPeriod,
    workareasData, clinicDepartmentsData, doctorsData,
    searchByEacWithdrawalDate, completedExaminations, completedPrescriptions,
    availableExamNames, selectedExamNames
  } = useSelector((s: RootState) => s.filters);

  const registrations = useSelector((s: RootState) => s.registrations);

  /* Stato locale */
  const [selectedTab, setSelectedTab] = useState(0);
  const [localFromDate, setLocalFromDate] = useState(fromDate);
  const [localToDate,   setLocalToDate]   = useState(toDate);
  const [readyToSearch, setReadyToSearch] = useState(false);

  const [countTuttiPersistent, setCountTuttiPersistent] = useState(0);
  const [countAssegnati, setCountAssegnati] = useState(0);
  const [countBozze,     setCountBozze]     = useState(0);
  const [isFirstTimeCruscotto, setIsFirstTimeCruscotto] = useState(true);

  // State per il filtro degli esami
  const [examFilter, setExamFilter] = useState("");

  const lastNameRef  = React.useRef<HTMLInputElement>(null);
  const firstNameRef = React.useRef<HTMLInputElement>(null);

const [initialSearchDone, setInitialSearchDone] = useState(false);

  // IMPORTANTE: userId corretto per workareas/departments (UsersDetails.UserId)
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(null);

/* Opzioni periodo */
  const periodOptions = [
    { text: "Oggi",          value: "Oggi" },
    { text: "Tre Giorni",    value: "Tre Giorni" },
    { text: "Una Settimana", value: "Una Settimana" },
    { text: "Un Mese",       value: "Un Mese" }
  ];
  const defaultPeriodItem = { text: "Seleziona Periodo", value: "" };

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ FETCH helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const fetchDoctors = useCallback(async () => {
    try {
      const resp = await fetch(url_doctors(), { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) {
        const data: Doctor[] = await resp.json();
        dispatch(setFilters({ doctorsData: data }));
      }
    } catch (err) { console.error("Error fetching doctors:", err); }
  }, [token, dispatch]);

  const fetchWorkareas = useCallback(async () => {
    try {
      const effectiveId = effectiveUserId || userId;
      const resp = await fetch(`${url_getWorkareas()}?userId=${effectiveId}`);
      if (!resp.ok) return console.error("Failed to fetch workareas:", resp.status);

      const contentType = resp.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error("Workareas response is not JSON");
        return;
      }

      // â‘  leggo i dati
      const data: Workarea[] = await resp.json();

      // â‘¡ li clono e li ordino in base alla descrizione
      const ordered = [...data].sort((a, b) =>
        a.workareaDescription.localeCompare(
          b.workareaDescription,                // campo su cui ordinare
          "it",                                 // locale: italiano
          { sensitivity: "base" }               // aa == Ã…Ã¥ == Ã¡Ã ecc.
        )
      );

      // â‘¢ salvo la versione ordinata nello store
      dispatch(setFilters({ workareasData: ordered }));

      // "¦ il resto invariato "¦
      if (Object.keys(sectors).length === 0) {
        const init: Sectors = {};
        ordered.forEach(w => (init[w.workareaId.trim()] = false));
        dispatch(setFilters({ sectors: init }));
      }
    } catch (err) {
      console.error("Error fetching workareas:", err);
    }
  }, [effectiveUserId, userId, sectors, dispatch]);


  const fetchWorkareasDefault = useCallback(async () => {
    try {
      const effectiveId = effectiveUserId || userId;
      const resp = await fetch(`${url_getWorkareasDefault()}?userId=${effectiveId}`);
      if (resp.ok) {
        const defs: Workarea[] = await resp.json();
        const upd = { ...sectors };
        defs.forEach(w => { upd[w.workareaId.trim()] = true; });
        dispatch(setFilters({ sectors: upd }));
      }
    } catch (err) { console.error("Error fetching default workareas:", err); }
  }, [effectiveUserId, userId, sectors, dispatch]);

  const fetchClinicDepartments = useCallback(async () => {
    try {
      const effectiveId = effectiveUserId || userId;
      const resp = await fetch(`${url_getClinicDepartements()}?userId=${effectiveId}`);
      if (!resp.ok) return console.error("Failed to fetch clinic departments:", resp.status);

      const contentType = resp.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error("Clinic departments response is not JSON");
        return;
      }

      const data: ClinicDepartment[] = await resp.json();

      // stesso identico ordinamento, ma sul campo clinicDepartmentDescription
      const ordered = [...data].sort((a, b) =>
        a.clinicDepartmentDescription.localeCompare(
          b.clinicDepartmentDescription,
          "it",
          { sensitivity: "base" }
        )
      );

      dispatch(setFilters({ clinicDepartmentsData: ordered }));

      if (Object.keys(units).length === 0) {
        const init: Units = {};
        ordered.forEach(d => (init[d.clinicDepartmentId.trim()] = false));
        dispatch(setFilters({ units: init }));
      }
    } catch (err) {
      console.error("Error fetching clinic departments:", err);
    }
  }, [effectiveUserId, userId, units, dispatch]);


  const fetchClinicDepartmentsDefault = useCallback(async () => {
    try {
      const effectiveId = effectiveUserId || userId;
      const resp = await fetch(`${url_getClinicDepartementsDefault()}?userId=${effectiveId}`);
      if (!resp.ok) return;

      const defaults: ClinicDepartment[] = await resp.json();

      /* 1. parte da tutti i reparti già caricati -> false */
      const full: Units = {};
      clinicDepartmentsData.forEach(d =>
        { full[d.clinicDepartmentId.trim()] = false; });

      /* 2. sovrascrive i default -> true */
      defaults.forEach(d =>
        { full[d.clinicDepartmentId.trim()] = true; });

      dispatch(setFilters({ units: full }));
    } catch (err) {
      console.error("Error fetching default clinic deps:", err);
    }
  }, [effectiveUserId, userId, clinicDepartmentsData, dispatch]);

  const fetchAvailableExamNames = useCallback(async () => {
    try {
      // Usa gli stessi parametri dei filtri correnti
      const clinicDepartmentIds = Object.keys(units).filter(k => units[k]).join(",");
      const workareaIds = Object.keys(sectors).filter(k => sectors[k]).join(",");

      if (!clinicDepartmentIds || !workareaIds) {
        // Se non ci sono settori/UO selezionati, non possiamo fare la query
        return;
      }

      const qs = new URLSearchParams({
        fromDate: localFromDate || "",
        toDate: localToDate || "",
        searchByEacStartDate: String(!searchByEacWithdrawalDate),
        searchByEacWithdrawalDate: String(searchByEacWithdrawalDate),
        searchModeStartsWith: String(searchMode === "startwith"),
        searchModeContains: String(searchMode === "contain"),
        lastName: lastName,
        firstName: firstName,
        doctorCodes: selectedDoctor?.value.trim() || "",
        clinicDepartmentIds,
        workareaIds,
        completedExaminations: String(completedExaminations)
      });

      const resp = await fetch(`${url_getDistinctExamNames()}?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (resp.ok) {
        const data: string[] = await resp.json();
        dispatch(setFilters({ availableExamNames: data }));
      } else {
        console.error("Failed to fetch exam names");
      }
    } catch (err) {
      console.error("Error fetching exam names:", err);
    }
  }, [
    localFromDate, localToDate, lastName, firstName,
    searchMode, selectedDoctor, sectors, units,
    searchByEacWithdrawalDate, completedExaminations, token, dispatch
  ]);

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ SEARCH helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const getSearchParams = useCallback(() => ({
    fromDateParam : localFromDate || "",
    toDateParam   : localToDate  || "",
    lastNameParam : lastName,
    firstNameParam: firstName,
    searchModeParam: searchMode,
    doctorCodeParam: selectedDoctor?.value.trim() || "",
    sectorsParam: sectors,
    unitsParam:   units,
    searchByEacWithdrawalDateParam: searchByEacWithdrawalDate,
    completedExaminationsParam:     completedExaminations,
    examNamesParam: selectedExamNames
  }), [
    localFromDate, localToDate, lastName, firstName,
    searchMode, selectedDoctor, sectors, units,
    searchByEacWithdrawalDate, completedExaminations, selectedExamNames
  ]);

  // Filtro lato client per nascondere ai tecnici le accettazioni con prescrizioni
  const filterPrescriptions = useCallback((data: any[]) => {
    // Se non è tecnico o se completedPrescriptions è true, non filtrare
    if (!isTechnician || completedPrescriptions) {
      return data;
    }
    // Filtra gli Examination che hanno MedicalPrescriptionId valorizzato
    return data.filter(item => !item.medicalPrescriptionId);
  }, [isTechnician, completedPrescriptions]);

  type SearchParams = ReturnType<typeof getSearchParams>;

  const handleSearch = useCallback(async (p: SearchParams) => {
    const hasSector = Object.values(p.sectorsParam).some(Boolean);
    const hasUnit   = Object.values(p.unitsParam).some(Boolean);
    if (!hasSector || !hasUnit) {
      alert("Selezionare almeno un settore e una U.O."); return;
    }

    dispatch(startLoading()); dispatch(setRegistrations([]));

    const clinicDepartmentIds = Object.keys(p.unitsParam).filter(k => p.unitsParam[k]).join(",");
    const workareaIds         = Object.keys(p.sectorsParam).filter(k => p.sectorsParam[k]).join(",");
    const examNames = (p.examNamesParam || []).join(",");

    const qs = new URLSearchParams({
      fromDate: p.fromDateParam,
      toDate:   p.toDateParam,
      searchByEacStartDate     : String(!p.searchByEacWithdrawalDateParam),
      searchByEacWithdrawalDate: String(p.searchByEacWithdrawalDateParam),
      searchModeStartsWith     : String(p.searchModeParam === "startwith"),
      searchModeContains       : String(p.searchModeParam === "contain"),
      lastName  : p.lastNameParam,
      firstName : p.firstNameParam,
      doctorCodes: p.doctorCodeParam,
      clinicDepartmentIds,
      workareaIds,
      completedExaminations: String(p.completedExaminationsParam),
      examNames: examNames
    });

    // Fix per caratteri "+" nei nomi degli esami: URLSearchParams non li codifica correttamente
    // Il "+" viene interpretato come spazio dal server, causando errori 500
    // Soluzione: sostituiamo manualmente "+" con "%2B" nella query string finale
    let queryString = qs.toString();
    if (examNames && examNames.includes('+')) {
      // Decodifichiamo examNames dalla query string e lo ri-codifichiamo correttamente
      const examNamesEncoded = encodeURIComponent(examNames);
      queryString = queryString.replace(/examNames=[^&]*/, `examNames=${examNamesEncoded}`);
    }

    try {
      const rsp = await fetch(`${url_worklist()}?${queryString}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (rsp.ok) {
        const data = await rsp.json();
        const filteredData = filterPrescriptions(data);
        dispatch(setRegistrations(filteredData));

        if (data[0]) {
          const {
            examinationId,
            patientId,
          } = data[0];

          dispatch(resetExaminationState());
          dispatch(setSelectedExaminationId(examinationId));
          dispatch(setSelectedPatientId(patientId));
        } else {
          dispatch(resetExaminationState()); // opzionale: azzera tutto se lista vuota
        }


        dispatch(setFilters({ lastName: "", firstName: "" }));
      } else { console.error("Failed to fetch worklist"); }
    } catch (err) { console.error("Error fetching worklist:", err); }
    finally       { dispatch(stopLoading()); }
  }, [token, dispatch, filterPrescriptions]);

  /* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Effetti â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  /* Recupero userId corretto da UsersDetails (sia per tecnici che medici) */
  useEffect(() => {
    const fetchUserDetailsId = async () => {
      if (!userId || !token) return;

      try {
        const response = await fetch(`${url_getUserDetailsId()}?userId=${userId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          setEffectiveUserId(data.userDetailsId);
          console.log(`[EFFECTIVE_USER_ID] Set to: ${data.userDetailsId} (was AspNetUsers.Id: ${userId})`);
        } else {
          console.warn(`[EFFECTIVE_USER_ID] Failed to get UserDetailsId, using original: ${userId}`);
          setEffectiveUserId(userId); // fallback
        }
      } catch (err) {
        console.error("[EFFECTIVE_USER_ID] Error:", err);
        setEffectiveUserId(userId); // fallback
      }
    };

    fetchUserDetailsId();
  }, [userId, token]);

  /* caricamento dati base */
  useEffect(() => {
    const missingDoctors   = doctorsData.length === 0;
    const missingWorkareas = workareasData.length === 0;
    const missingDepts     = clinicDepartmentsData.length === 0;
    const noSectorTrue     = !Object.values(sectors).some(Boolean);
    const noUnitTrue       = !Object.values(units).some(Boolean);

    const mustLoad = missingDoctors || missingWorkareas || missingDepts || noSectorTrue || noUnitTrue;

    const load = async () => {
      dispatch(startLoading());
      try {
        if (missingDoctors)            await fetchDoctors();
        if (missingWorkareas)          await fetchWorkareas();
        if (missingWorkareas || noSectorTrue)
                                       await fetchWorkareasDefault();
        if (missingDepts)              await fetchClinicDepartments();
        if (missingDepts || noUnitTrue)
                                       await fetchClinicDepartmentsDefault();
      } catch (e) { console.error(e); }
      finally { dispatch(stopLoading()); setReadyToSearch(true); }
    };

    if (mustLoad) load(); else setReadyToSearch(true);
  }, [
    userId, doctorsData, workareasData, clinicDepartmentsData,
    sectors, units,
    fetchDoctors, fetchWorkareas, fetchWorkareasDefault,
    fetchClinicDepartments, fetchClinicDepartmentsDefault,
    dispatch
  ]);

  /* Gestione prima ricerca, reload dall'editor o ricerca da pulsante */
  useEffect(() => {
    if (initialSearchDone) return;           // già fatta
    if (!readyToSearch)  return;             // aspetto i dati base

    const hasSector = Object.values(sectors).some(Boolean);
    const hasUnit   = Object.values(units).some(Boolean);
    if (!hasSector || !hasUnit) return;      // aspetto i default true

    // â–º da qui parte una sola volta
    setInitialSearchDone(true);              // blocca futuri re-trigger

    if (location.state?.reload === false) return; // rientro dall'editor
    handleSearch(getSearchParams());
  }, [
    readyToSearch,           // diventa true dopo i fetch iniziali
    sectors, units,          // cambiano quando arrivano i default
    location.state,          // gestisce il caso di reload dall'editor
    initialSearchDone,       // blocco
    handleSearch, getSearchParams
  ]);

  /* Carica lista esami disponibili quando cambiano i filtri */
  useEffect(() => {
    if (!readyToSearch) return; // aspetto che i dati base siano pronti

    const hasSector = Object.values(sectors).some(Boolean);
    const hasUnit = Object.values(units).some(Boolean);
    if (!hasSector || !hasUnit) return; // serve almeno un settore e una UO

    fetchAvailableExamNames();
  }, [
    readyToSearch,
    localFromDate, localToDate,
    sectors, units,
    searchByEacWithdrawalDate,
    completedExaminations,
    fetchAvailableExamNames
  ]);

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Contatori cruscotto â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  useEffect(() => {
    let assegn = 0, bozze = 0;
    registrations.forEach(r => {
      if (r.doctorCode?.trim() === doctorCodeCurrentUser?.trim()) assegn++;
      if (r.isDraft) bozze++;
    });
    setCountAssegnati(assegn); setCountBozze(bozze);

    const tutti = registrations.length;
    if (location.state?.reload || isFirstTimeCruscotto) {
      setCountTuttiPersistent(tutti); setIsFirstTimeCruscotto(false);
    }
  }, [registrations, location.state, doctorCodeCurrentUser, isFirstTimeCruscotto]);
  
  // ---------------------------------------------------------
  // Toggle settori
  // ---------------------------------------------------------
  const toggleAllSectors = () => {
    const allSelected = Object.values(sectors).every(Boolean);
    const newSectors = { ...sectors };
    Object.keys(sectors).forEach((k) => {
      newSectors[k] = !allSelected;
    });
    dispatch(setFilters({ sectors: newSectors }));
  };

  // ---------------------------------------------------------
  // Toggle unità
  // ---------------------------------------------------------
  const toggleAllUnits = () => {
    const allSelected = Object.values(units).every(Boolean);
    const newUnits = { ...units };
    Object.keys(units).forEach((k) => {
      newUnits[k] = !allSelected;
    });
    dispatch(setFilters({ units: newUnits }));
  };

  // ---------------------------------------------------------
  // handlePeriodChange => Gestione dropdown "Periodo"
  // ---------------------------------------------------------
  const handlePeriodChange = (e: any) => {
    const selectedValue = e.value;
    // Salvo in localStorage
    localStorage.setItem("lastSelectedPeriod", selectedValue.value);

    let newFrom = fromDate ? moment(fromDate, "YYYY-MM-DD") : null;
    let newTo = toDate ? moment(toDate, "YYYY-MM-DD") : null;

    if (selectedValue.value === "Oggi") {
      newFrom = moment().startOf("day");
      newTo = moment();
    } else if (selectedValue.value === "Tre Giorni") {
      newFrom = moment().subtract(2, "days").startOf("day");
      newTo = moment();
    } else if (selectedValue.value === "Una Settimana") {
      newFrom = moment().subtract(6, "days").startOf("day");
      newTo = moment();
    } else if (selectedValue.value === "Un Mese") {
      newFrom = moment().subtract(1, "months").startOf("day");
      newTo = moment();
    }

    if (newFrom && newTo) {
      dispatch(setSelectedFromDate(newFrom.format("YYYY-MM-DD")));
      dispatch(setSelectedToDate(newTo.format("YYYY-MM-DD")));
      setLocalFromDate(newFrom.format("YYYY-MM-DD"));
      setLocalToDate(newTo.format("YYYY-MM-DD"));
    }

    // Aggiorno Redux
    dispatch(
      setFilters({
        selectedPeriod: selectedValue,
        fromDate: newFrom ? newFrom.format("YYYY-MM-DD") : fromDate,
        toDate: newTo ? newTo.format("YYYY-MM-DD") : toDate,
      })
    );
  };

  // ---------------------------------------------------------
  // Gestione datePicker from/to con onBlur
  // ---------------------------------------------------------
  const handleFromDateChange = (e: any) => {
    const val: Date | null = e.value;
    const str = val ? moment(val).format("YYYY-MM-DD") : null;
    setLocalFromDate(str);
  };

  const handleToDateChange = (e: any) => {
    const val: Date | null = e.value;
    const str = val ? moment(val).format("YYYY-MM-DD") : null;
    setLocalToDate(str);
  };

  const handleFromDateBlur = () => {
    if (localFromDate !== fromDate) {
      //dispatch(resetExaminationState());
      dispatch(setSelectedFromDate(localFromDate || ""));
      dispatch(setFilters({ fromDate: localFromDate || "" }));
      handleSearch(getSearchParams());
    }
  };

  const handleToDateBlur = () => {
    if (localToDate !== toDate) {
      //dispatch(resetExaminationState());
      dispatch(setSelectedToDate(localToDate || ""));
      dispatch(setFilters({ toDate: localToDate || "" }));
      handleSearch(getSearchParams());
    }
  };

  // ---------------------------------------------------------
  // handleSelect => cambio tab strip
  // ---------------------------------------------------------
  const handleSelectTab = (e: any) => {
    setSelectedTab(e.selected);
  };

  // ---------------------------------------------------------
  // Handlers Cruscotto
  // ---------------------------------------------------------
  const handleCruscottoTutti = async () => {
    const params = getSearchParams();
    params.completedExaminationsParam = false; // forzo "incompleti"
    await handleCruscottoSearch(params);
  };

  const handleCruscottoAssegnati = async () => {
    const params = getSearchParams();
    params.doctorCodeParam = doctorCodeCurrentUser?.trim() || "";
    await handleCruscottoSearch(params);
  };

  const handleCruscottoBozze = async () => {
    // Esegue la query e poi filtra localmente isDraft===true
    dispatch(startLoading());
    try {
      const params = getSearchParams();
      const clinicDepartmentIds = Object.keys(params.unitsParam)
        .filter((k) => params.unitsParam[k])
        .map((k) => k.trim())
        .join(",");
      const workareaIds = Object.keys(params.sectorsParam)
        .filter((k) => params.sectorsParam[k])
        .map((k) => k.trim())
        .join(",");

      const actualSearchByEacStartDate = !params.searchByEacWithdrawalDateParam;
      const examNames = (params.examNamesParam || []).join(",");

      const queryParams = new URLSearchParams({
        fromDate: params.fromDateParam,
        toDate: params.toDateParam,
        searchByEacStartDate: String(actualSearchByEacStartDate),
        searchByEacWithdrawalDate: String(params.searchByEacWithdrawalDateParam),
        searchModeStartsWith: String(params.searchModeParam === "startwith"),
        searchModeContains: String(params.searchModeParam === "contain"),
        lastName: params.lastNameParam,
        firstName: params.firstNameParam,
        clinicDepartmentIds,
        workareaIds,
        completedExaminations: String(params.completedExaminationsParam),
        examNames: examNames
      });

      //dispatch(resetExaminationState());
      dispatch(setRegistrations([]));

      const response = await fetch(`${url_worklist()}?${queryParams.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        const filteredData = filterPrescriptions(data);

        const bozzaOnly = filteredData.filter((d: any) => d.isDraft === true);
        dispatch(setRegistrations(bozzaOnly));
        if (bozzaOnly.length > 0) {
          dispatch(setSelectedExaminationId(bozzaOnly[0].examinationId));
        } else {
          dispatch(setSelectedExaminationId(""));
        }
      } else {
        console.error("Failed to fetch cruscotto bozze");
      }
    } catch (error) {
      console.error("Error in cruscottoBozze:", error);
    } finally {
      dispatch(stopLoading());
    }
  };

  // Ricerca generica usata da "Tutti" / "Assegnati"
  const handleCruscottoSearch = async (params: any) => {
    dispatch(startLoading());
    try {
      const clinicDepartmentIds = Object.keys(params.unitsParam)
        .filter((k) => params.unitsParam[k])
        .map((k) => k.trim())
        .join(",");
      const workareaIds = Object.keys(params.sectorsParam)
        .filter((k) => params.sectorsParam[k])
        .map((k) => k.trim())
        .join(",");

      const actualSearchByEacStartDate = !params.searchByEacWithdrawalDateParam;
      const examNames = (params.examNamesParam || []).join(",");

      const qParams = new URLSearchParams({
        fromDate: params.fromDateParam,
        toDate: params.toDateParam,
        searchByEacStartDate: String(actualSearchByEacStartDate),
        searchByEacWithdrawalDate: String(params.searchByEacWithdrawalDateParam),
        searchModeStartsWith: String(params.searchModeParam === "startwith"),
        searchModeContains: String(params.searchModeParam === "contain"),
        lastName: params.lastNameParam,
        firstName: params.firstNameParam,
        doctorCodes: params.doctorCodeParam,
        clinicDepartmentIds,
        workareaIds,
        completedExaminations: String(params.completedExaminationsParam),
        examNames: examNames
      });

      //dispatch(resetExaminationState());
      dispatch(setRegistrations([]));

      const response = await fetch(`${url_worklist()}?${qParams.toString()}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        const filteredData = filterPrescriptions(data);
        dispatch(setRegistrations(filteredData));
        if (data && data.length > 0) {
          dispatch(setSelectedExaminationId(data[0].examinationId));
        } else {
          dispatch(setSelectedExaminationId(""));
        }
      } else {
        console.error("Failed to fetch cruscotto search");
      }
    } catch (error) {
      console.error("Error in cruscotto search:", error);
    } finally {
      dispatch(stopLoading());
    }
  };

  const onSearch = () => {
    // reset eventuale selezione
    dispatch(resetExaminationState());
    handleSearch(getSearchParams());
  };

  // ---------------------------------------------------------
  // Filtraggio esami per ricerca
  // ---------------------------------------------------------
  const filteredExamNames = React.useMemo(() => {
    if (!examFilter) {
      return availableExamNames || [];
    }
    return (availableExamNames || []).filter((exam: string) =>
      exam.toLowerCase().includes(examFilter.toLowerCase())
    );
  }, [availableExamNames, examFilter]);

  // ---------------------------------------------------------
  // Render
  // ---------------------------------------------------------
  return (
    <div className="gestione-referti">
      <LoadingModal isLoading={isLoading} />

      {/* Sezione Filtri */}
      <div className="bordered-div">
        <h5>{labels.gestioneReferti.filtriDiRicerca}</h5>

        <div className="filter-group-row">
          <div className="filter-group">
            <label>{labels.gestioneReferti.dataDa}</label>
            <DatePicker
              format="dd/MM/yyyy"
              value={
                localFromDate ? new Date(localFromDate + "T00:00:00") : null
              }
              onChange={handleFromDateChange}
              onBlur={handleFromDateBlur}
            />
          </div>
          <div className="filter-group">
            <label>{labels.gestioneReferti.dataA}</label>
            <DatePicker
              format="dd/MM/yyyy"
              value={
                localToDate ? new Date(localToDate + "T00:00:00") : null
              }
              onChange={handleToDateChange}
              onBlur={handleToDateBlur}
            />
          </div>
        </div>

        <div className="filter-group-row">
          <div className="filter-group">
            <label>{labels.gestioneReferti.periodo}</label>
            <DropDownList
              data={periodOptions}
              textField="text"
              dataItemKey="value"
              value={selectedPeriod}
              onChange={handlePeriodChange}
              defaultItem={defaultPeriodItem}
            />
          </div>

          <div className="filter-group">
            <label>{labels.gestioneReferti.medico}</label>
            <DropDownList
              data={doctorsData.map((doc: Doctor) => ({
                text: doc.doctorDescription,
                value: doc.doctorCode ? doc.doctorCode.trim() : "",
              }))}
              textField="text"
              dataItemKey="value"
              value={selectedDoctor}
              style={{ visibility: "hidden" }} // per evitare che il dropdown sia visibile
              onChange={(e) => {
                dispatch(setFilters({ selectedDoctor: e.target.value }));
              }}
              defaultItem={{ text: "Seleziona Medico", value: "" }}
            />
          </div>
        </div>

        {/* Filtro per Esami */}
        <div className="filter-group-row" style={{ marginTop: "1rem" }}>
          <div className="filter-group" style={{ width: "100%" }}>
            <label>Filtra per Esami</label>
            <MultiSelect
              data={filteredExamNames}
              value={selectedExamNames || []}
              onChange={(e) => {
                dispatch(setFilters({ selectedExamNames: e.value }));
              }}
              onFilterChange={(e) => {
                setExamFilter(e.filter.value);
              }}
              placeholder="Cerca esami..."
              filterable={true}
              autoClose={false}
              allowCustom={false}
              header={() => {
                const selected = selectedExamNames || [];
                const filtered = filteredExamNames;
                const allFilteredSelected = filtered.length > 0 &&
                  filtered.every((exam: string) => selected.includes(exam));

                return (
                  <div style={{
                    padding: "8px 12px",
                    borderBottom: "1px solid #e0e0e0",
                    backgroundColor: "#f5f5f5",
                    cursor: "pointer"
                  }}
                  onClick={() => {
                    if (allFilteredSelected) {
                      // Deseleziona solo quelli filtrati
                      const remaining = selected.filter(
                        (s: string) => !filtered.includes(s)
                      );
                      dispatch(setFilters({ selectedExamNames: remaining }));
                    } else {
                      // Seleziona tutti quelli filtrati (mantenendo quelli già selezionati)
                      const combined = [...new Set([...selected, ...filtered])];
                      dispatch(setFilters({ selectedExamNames: combined }));
                    }
                  }}>
                    <Checkbox
                      label={allFilteredSelected ? "Deseleziona Tutti" : "Seleziona Tutti"}
                      checked={allFilteredSelected}
                      disabled={filtered.length === 0}
                      onChange={() => {}} // Gestito dal div onClick
                    />
                  </div>
                );
              }}
            />
          </div>
        </div>

        {/* TabStrip: Settori, Unita, Cruscotto */}
        <TabStrip selected={selectedTab} onSelect={handleSelectTab}>
          <TabStripTab title={labels.gestioneReferti.settori}>
            <div className="filter-tabs-start">
              <Button onClick={toggleAllSectors}>
                {labels.gestioneReferti.tutti}
              </Button>
              {workareasData.map((workarea: Workarea) => {
                const sectorId = workarea.workareaId.trim();
                return (
                  <Checkbox
                    key={sectorId}
                    label={workarea.workareaDescription}
                    checked={!!(sectors && sectors[sectorId])}
                    onChange={() => {
                      dispatch(
                        setFilters({
                          sectors: {
                            ...sectors,
                            [sectorId]: !sectors[sectorId],
                          },
                        })
                      );
                    }}
                  />
                );
              })}
            </div>
          </TabStripTab>

          <TabStripTab title={labels.gestioneReferti.unitaOperative}>
            <div className="filter-tabs-start">
              <Button onClick={toggleAllUnits}>{labels.gestioneReferti.tutti}</Button>
                {clinicDepartmentsData.map(dept => {
                  const id   = dept.clinicDepartmentId.trim();
                  const text = dept.clinicDepartmentDescription;
                  return (
                    <Checkbox
                      key={id}
                      label={text}
                      checked={!!units[id]}            /* undefined â‡’ false */
                      onChange={() =>
                        dispatch(setFilters({ units: { ...units, [id]: !units[id] } }))
                      }
                    />
                  );
                })}
            </div>
          </TabStripTab>

          <TabStripTab title="Cruscotto">
            <div
              className="filter-tabs-start"
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              <Button onClick={handleCruscottoTutti}>
                Da Refertare Tutti ({countTuttiPersistent})
              </Button>
              <Button onClick={handleCruscottoAssegnati}>
                Da Refertare Assegnati ({countAssegnati})
              </Button>
              <Button onClick={handleCruscottoBozze}>
                Le mie Bozze ({countBozze})
              </Button>
            </div>
          </TabStripTab>
        </TabStrip>

        <div className="filter-group-row">
          <Checkbox
            label={labels.gestioneReferti.interrograPerDataRitiro}
            checked={searchByEacWithdrawalDate}
            onChange={(e) =>
              dispatch(setFilters({ searchByEacWithdrawalDate: e.value }))
            }
          />
          {!isTechnician && (
            <Checkbox
              label={labels.gestioneReferti.includiRefertiCompleti}
              checked={completedExaminations}
              onChange={(e) =>
                dispatch(setFilters({ completedExaminations: e.value }))
              }
            />
          )}
          {isTechnician && (
            <Checkbox
              label={labels.gestioneReferti.includiPrescrizioniComplete}
              checked={completedPrescriptions}
              onChange={(e) =>
                dispatch(setFilters({ completedPrescriptions: e.value }))
              }
            />
          )}
        </div>
      </div>

      {/* Sezione Ricerca paziente */}
      <div className="patient-search bordered-div">
        <h5>{labels.gestioneReferti.ricercaPaziente}</h5>
        <label>{labels.gestioneReferti.cognome}</label>
        <Input
           ref={lastNameRef}                     /// MODIFICA: aggiungi ref
           value={lastName}
           onChange={(e) => dispatch(setFilters({ lastName: String(e.target.value) }))}
           onKeyDown={e => {
             if (e.key === "Enter") {
               e.preventDefault();
               firstNameRef.current?.focus();   // sposta il focus su Nome
             }
           }}
         />        <label>{labels.gestioneReferti.nome}</label>
         <Input
           ref={firstNameRef}                    /// MODIFICA: aggiungi ref
           value={firstName}
           onChange={(e) => dispatch(setFilters({ firstName: String(e.target.value) }))}
           onKeyDown={e => {
             if (e.key === "Enter") {
               e.preventDefault();
               onSearch();                     // avvia la ricerca
             }
           }}
         />
        <div className="search-mode">
          <h5>Modalità di ricerca</h5>
          <div>
            <input
              type="radio"
              id="startwith"
              name="searchMode"
              value="startwith"
              checked={searchMode === "startwith"}
              onChange={(e) =>
                dispatch(setFilters({ searchMode: e.target.value }))
              }
            />
            <label htmlFor="startwith">Inizia con</label>
          </div>
          <div>
            <input
              type="radio"
              id="contain"
              name="searchMode"
              value="contain"
              checked={searchMode === "contain"}
              onChange={(e) =>
                dispatch(setFilters({ searchMode: e.target.value }))
              }
            />
            <label htmlFor="contain">Contiene</label>
          </div>
        </div>

        <Button className="cerca-btn" onClick={onSearch}>
          {labels.gestioneReferti.cerca}
        </Button>
      </div>

      {/* Sezione Utilities rimossa
      <div className="utilities bordered-div">
        <h5>{labels.gestioneReferti.utilitaEPreferenze}</h5>
        <Button icon=".k-i-file-txt">{labels.gestioneReferti.prescrizione}</Button>
        <Button icon="k-i-calendar">{labels.gestioneReferti.anamnesi}</Button>
        <Button icon="k-i-folder">{labels.gestioneReferti.documenti}</Button>
        <Button icon="k-i-pencil">{labels.gestioneReferti.note}</Button>
      </div>
      */}
    </div>
  );
};

export default GestioneReferti;
