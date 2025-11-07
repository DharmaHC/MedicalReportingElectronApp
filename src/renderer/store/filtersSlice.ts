// store/filtersSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface Workarea {
  workareaId: string;
  workareaDescription: string;
}

interface ClinicDepartment {
  clinicDepartmentId: string;
  clinicDepartmentDescription: string;
}

interface Doctor {
  doctorCode: string;
  doctorDescription: string;
}

interface FiltersState {
  lastName: string;
  firstName: string;
  selectedDoctor: { text: string; value: string } | null;
  searchMode: string;
  fromDate: string | null; // formato YYYY-MM-DD
  toDate: string | null;
  units: { [key: string]: boolean };
  sectors: { [key: string]: boolean };
  selectedPeriod: { text: string; value: string };
  workareasData: Workarea[];
  clinicDepartmentsData: ClinicDepartment[];
  doctorsData: Doctor[];
  completedExaminations: boolean;
  completedPrescriptions: boolean;     // Includi prescrizioni complete (solo tecnici)
  searchByEacStartDate: boolean;       // Interroga per data inizio
  searchByEacWithdrawalDate: boolean;  // Includi referti completi
  availableExamNames: string[];        // Lista distinct esami disponibili
  selectedExamNames: string[];         // Esami selezionati per il filtro
}

const initialState: FiltersState = {
  lastName: "",
  firstName: "",
  selectedDoctor: null,
  searchMode: "startwith",
  fromDate: null,
  toDate: null,
  units: {},
  sectors: {},
  selectedPeriod: { text: "Seleziona Periodo", value: "" },
  workareasData: [],
  clinicDepartmentsData: [],
  doctorsData: [],
  completedExaminations: false,
  completedPrescriptions: false, // Di default mostra solo senza prescrizioni (tecnici)
  searchByEacStartDate: true,    // Di default interroga per data inizio
  searchByEacWithdrawalDate: false, // Di default non includo referti completi
  availableExamNames: [],        // Inizialmente vuoto
  selectedExamNames: [],         // Inizialmente vuoto
};

const filtersSlice = createSlice({
  name: "filters",
  initialState,
  reducers: {
    setFilters(state, action: PayloadAction<Partial<FiltersState>>) {
      return { ...state, ...action.payload };
    },
    resetFilters() {
      return initialState;
    },
  },
});

export const { setFilters, resetFilters } = filtersSlice.actions;
export default filtersSlice.reducer;
