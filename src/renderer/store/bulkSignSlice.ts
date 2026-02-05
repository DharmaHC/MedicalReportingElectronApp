/**
 * bulkSignSlice.ts
 * Redux slice per la gestione della firma remota massiva dei referti.
 */

import { createSlice, PayloadAction, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import {
  url_getReportsToSign
} from '../utility/urlLib';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Provider di firma disponibile
 */
export interface SignProvider {
  id: string;
  name: string;
  enabled: boolean;
  configured: boolean;
}

/**
 * Referto (proveniente da DigitalSignedReports)
 */
export interface ReportToSign {
  /** GUID del record in DigitalSignedReports */
  digitalReportId: string;
  /** ID examination */
  examinationId: number;
  /** Lista di tutti gli examResultId collegati (da ResultsIds) */
  linkedResultIds: number[];
  /** Nomi degli esami inclusi nel referto */
  examNames: string[];
  /** Cognome paziente */
  patientLastName: string;
  /** Nome paziente */
  patientFirstName: string;
  /** Codice accettazione */
  examinationMnemonicCodeFull: string;
  /** Data salvataggio PDF */
  printDate: string;
  /** Codice medico */
  doctorCode: string;
  /** Nome medico */
  doctorDisplayName: string;
  /** ID azienda per footer */
  companyId: string;
  /** Stato del referto nel DB: 6=Bozza, 7=Da Firmare, 8=Firmato */
  examinationState: number;
  /** Se selezionato per firma */
  selected: boolean;
  /** Stato firma (UI) */
  signStatus: 'pending' | 'signing' | 'signed' | 'error';
  /** Messaggio errore */
  errorMessage?: string;
}

/**
 * Stato sessione firma
 */
export interface SessionInfo {
  active: boolean;
  providerId: string | null;
  expiresAt: string | null;
  remainingMinutes: number;
  signedByCN: string | null;
}

/**
 * Progresso firma batch
 */
export interface SignProgress {
  total: number;
  completed: number;
  failed: number;
  currentPatient: string | null;
}

/**
 * Filtri per i referti
 */
export interface ReportFilters {
  dateFrom: string | null;
  dateTo: string | null;
  patientName: string;
  status: 'all' | 'draft' | 'toSign' | 'signed';
}

/**
 * Stato completo del bulk sign
 */
export interface BulkSignState {
  // Lista referti
  reports: ReportToSign[];
  isLoadingReports: boolean;
  loadError: string | null;

  // Provider
  availableProviders: SignProvider[];
  selectedProviderId: string | null;

  // Sessione
  session: SessionInfo;

  // Firma in corso
  isSigningInProgress: boolean;
  signProgress: SignProgress;

  // Filtri
  filters: ReportFilters;

  // UI Modals
  isModalOpen: boolean;
  isAuthDialogOpen: boolean;

  // Messaggi
  errorMessage: string | null;
  successMessage: string | null;
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: BulkSignState = {
  reports: [],
  isLoadingReports: false,
  loadError: null,

  availableProviders: [],
  selectedProviderId: null,

  session: {
    active: false,
    providerId: null,
    expiresAt: null,
    remainingMinutes: 0,
    signedByCN: null
  },

  isSigningInProgress: false,
  signProgress: {
    total: 0,
    completed: 0,
    failed: 0,
    currentPatient: null
  },

  filters: {
    dateFrom: null,
    dateTo: null,
    patientName: '',
    status: 'all'  // Mostra sia Bozze (6) che Da Firmare (7)
  },

  isModalOpen: false,
  isAuthDialogOpen: false,

  errorMessage: null,
  successMessage: null
};

// ============================================================================
// ASYNC THUNKS
// ============================================================================

/**
 * Carica i referti da firmare dal backend.
 * Usa la nuova API GetReportsToSign che query DigitalSignedReports con ExaminationState=7.
 */
export const fetchReportsToSign = createAsyncThunk<
  ReportToSign[],
  { doctorCode: string; token: string },
  { state: { bulkSign: BulkSignState } }
>(
  'bulkSign/fetchReportsToSign',
  async ({ doctorCode, token }, { getState, rejectWithValue }) => {
    try {
      const { filters } = getState().bulkSign;

      // Date di default: ultimi 15 giorni se non specificate
      const today = new Date();
      const fifteenDaysAgo = new Date(today);
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

      const fromDate = filters.dateFrom || fifteenDaysAgo.toISOString().split('T')[0];
      const toDate = filters.dateTo || today.toISOString().split('T')[0];

      // Costruisci query params per GetReportsToSign
      const params = new URLSearchParams();
      params.append('doctorCode', doctorCode);
      if (fromDate) params.append('dateFrom', fromDate);
      if (toDate) params.append('dateTo', toDate);
      if (filters.patientName) {
        // Separa cognome e nome se contiene spazio
        const parts = filters.patientName.trim().split(' ');
        if (parts.length > 0) params.append('lastName', parts[0]);
        if (parts.length > 1) params.append('firstName', parts.slice(1).join(' '));
      }

      // Determina gli stati da includere in base al filtro
      // Stati: 6=Bozza, 7=Da Firmare, 8=Firmato
      let states: number[];
      switch (filters.status) {
        case 'draft':
          states = [6];
          break;
        case 'toSign':
          states = [7];
          break;
        case 'signed':
          states = [8];
          break;
        case 'all':
        default:
          states = [6, 7, 8];  // Include anche i firmati
          break;
      }
      params.append('states', states.join(','));

      const url = `${url_getReportsToSign()}?${params.toString()}`;

      console.log('🔍 [BULK SIGN] Chiamata API GetReportsToSign:');
      console.log('  URL:', url);
      console.log('  doctorCode:', doctorCode);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('🔍 [BULK SIGN] Response status:', response.status);

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
          console.error('🔍 [BULK SIGN] Error body:', errorBody);
        } catch (e) {
          console.error('🔍 [BULK SIGN] Could not read error body');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`);
      }

      const apiReports = await response.json();

      console.log('🔍 [BULK SIGN] API ha restituito', apiReports.length, 'referti da firmare');

      // Mappa la risposta API al formato ReportToSign
      const reports: ReportToSign[] = apiReports.map((r: any) => {
        // Parsing di ResultsIds per ottenere linkedResultIds
        const linkedResultIds = r.resultsIds
          ? r.resultsIds.split(',').map((id: string) => parseInt(id.trim(), 10)).filter((id: number) => !isNaN(id))
          : [];

        return {
          digitalReportId: r.id,
          examinationId: r.examinationId,
          linkedResultIds,
          examNames: r.examNames || [],
          patientLastName: r.patientLastName || '',
          patientFirstName: r.patientFirstName || '',
          examinationMnemonicCodeFull: r.examinationMnemonicCodeFull || '',
          printDate: r.printDate || '',
          doctorCode: r.doctorCode || '',
          doctorDisplayName: r.doctorDisplayName || r.doctorCode || '',
          companyId: r.companyWebSite || 'ASTER',
          examinationState: r.examinationState || 7,
          selected: false,
          signStatus: 'pending' as const,
          errorMessage: undefined
        };
      });

      console.log('🔍 [BULK SIGN] Referti mappati:', reports.length);

      return reports;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Errore caricamento referti');
    }
  }
);

/**
 * Carica i provider disponibili
 */
export const fetchAvailableProviders = createAsyncThunk<SignProvider[]>(
  'bulkSign/fetchAvailableProviders',
  async (_, { rejectWithValue }) => {
    try {
      // Chiama IPC per ottenere provider registrati
      const providers = await (window as any).remoteSign?.getAvailableProviders();
      return providers || [];
    } catch (error: any) {
      return rejectWithValue(error.message || 'Errore caricamento provider');
    }
  }
);

// ============================================================================
// SLICE
// ============================================================================

const bulkSignSlice = createSlice({
  name: 'bulkSign',
  initialState,
  reducers: {
    // -------------------------------------------------------------------------
    // MODAL
    // -------------------------------------------------------------------------

    openModal: (state) => {
      state.isModalOpen = true;
      state.errorMessage = null;
      state.successMessage = null;
    },

    closeModal: (state) => {
      state.isModalOpen = false;
      // Reset dello stato quando chiudiamo
      state.reports = [];
      state.signProgress = initialState.signProgress;
      state.errorMessage = null;
      state.successMessage = null;
    },

    openAuthDialog: (state) => {
      state.isAuthDialogOpen = true;
      state.errorMessage = null;
    },

    closeAuthDialog: (state) => {
      state.isAuthDialogOpen = false;
    },

    // -------------------------------------------------------------------------
    // PROVIDER
    // -------------------------------------------------------------------------

    setAvailableProviders: (state, action: PayloadAction<SignProvider[]>) => {
      state.availableProviders = action.payload;
    },

    setSelectedProvider: (state, action: PayloadAction<string>) => {
      state.selectedProviderId = action.payload;
    },

    // -------------------------------------------------------------------------
    // SESSIONE
    // -------------------------------------------------------------------------

    updateSession: (state, action: PayloadAction<Partial<SessionInfo>>) => {
      state.session = { ...state.session, ...action.payload };
    },

    clearSession: (state) => {
      state.session = initialState.session;
    },

    // -------------------------------------------------------------------------
    // SELEZIONE REFERTI
    // -------------------------------------------------------------------------

    toggleReportSelection: (state, action: PayloadAction<number>) => {
      const report = state.reports.find(r => r.examinationId === action.payload);
      if (report) {
        report.selected = !report.selected;
      }
    },

    selectAllReports: (state) => {
      state.reports.forEach(r => {
        if (r.signStatus === 'pending') {
          r.selected = true;
        }
      });
    },

    deselectAllReports: (state) => {
      state.reports.forEach(r => {
        r.selected = false;
      });
    },

    // -------------------------------------------------------------------------
    // FILTRI
    // -------------------------------------------------------------------------

    setFilters: (state, action: PayloadAction<Partial<ReportFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },

    resetFilters: (state) => {
      state.filters = initialState.filters;
    },

    // -------------------------------------------------------------------------
    // PROGRESSO FIRMA
    // -------------------------------------------------------------------------

    startSigning: (state) => {
      state.isSigningInProgress = true;
      state.errorMessage = null;
      state.successMessage = null;

      const selectedCount = state.reports.filter(r => r.selected).length;
      state.signProgress = {
        total: selectedCount,
        completed: 0,
        failed: 0,
        currentPatient: null
      };

      // Imposta tutti i selezionati come "signing"
      state.reports.forEach(r => {
        if (r.selected) {
          r.signStatus = 'signing';
        }
      });
    },

    updateSignProgress: (state, action: PayloadAction<{
      completed: number;
      failed: number;
      currentPatient: string | null;
    }>) => {
      state.signProgress.completed = action.payload.completed;
      state.signProgress.failed = action.payload.failed;
      state.signProgress.currentPatient = action.payload.currentPatient;
    },

    updateReportSignStatus: (state, action: PayloadAction<{
      examinationId: number;
      status: ReportToSign['signStatus'];
      errorMessage?: string;
    }>) => {
      const report = state.reports.find(r => r.examinationId === action.payload.examinationId);
      if (report) {
        report.signStatus = action.payload.status;
        report.errorMessage = action.payload.errorMessage;
      }
    },

    finishSigning: (state, action: PayloadAction<{
      successCount: number;
      failCount: number;
    }>) => {
      state.isSigningInProgress = false;

      if (action.payload.failCount === 0) {
        state.successMessage = `${action.payload.successCount} referti firmati con successo`;
      } else if (action.payload.successCount === 0) {
        state.errorMessage = `Firma fallita per tutti i ${action.payload.failCount} referti`;
      } else {
        state.successMessage = `${action.payload.successCount} firmati, ${action.payload.failCount} errori`;
      }
    },

    // -------------------------------------------------------------------------
    // MESSAGGI
    // -------------------------------------------------------------------------

    setErrorMessage: (state, action: PayloadAction<string | null>) => {
      state.errorMessage = action.payload;
    },

    setSuccessMessage: (state, action: PayloadAction<string | null>) => {
      state.successMessage = action.payload;
    },

    clearMessages: (state) => {
      state.errorMessage = null;
      state.successMessage = null;
    },

    // -------------------------------------------------------------------------
    // RESET
    // -------------------------------------------------------------------------

    resetState: () => initialState
  },

  extraReducers: (builder) => {
    // Fetch reports
    builder
      .addCase(fetchReportsToSign.pending, (state) => {
        state.isLoadingReports = true;
        state.loadError = null;
      })
      .addCase(fetchReportsToSign.fulfilled, (state, action) => {
        state.isLoadingReports = false;
        state.reports = action.payload;
        state.loadError = null;
      })
      .addCase(fetchReportsToSign.rejected, (state, action) => {
        state.isLoadingReports = false;
        state.loadError = action.payload as string;
        state.reports = [];
      });

    // Fetch providers
    builder
      .addCase(fetchAvailableProviders.fulfilled, (state, action) => {
        state.availableProviders = action.payload;
        // Seleziona il primo provider abilitato come default
        const firstEnabled = action.payload.find(p => p.enabled && p.configured);
        if (firstEnabled && !state.selectedProviderId) {
          state.selectedProviderId = firstEnabled.id;
        }
      });
  }
});

// ============================================================================
// EXPORTS
// ============================================================================

export const {
  openModal,
  closeModal,
  openAuthDialog,
  closeAuthDialog,
  setAvailableProviders,
  setSelectedProvider,
  updateSession,
  clearSession,
  toggleReportSelection,
  selectAllReports,
  deselectAllReports,
  setFilters,
  resetFilters,
  startSigning,
  updateSignProgress,
  updateReportSignStatus,
  finishSigning,
  setErrorMessage,
  setSuccessMessage,
  clearMessages,
  resetState
} = bulkSignSlice.actions;

export default bulkSignSlice.reducer;

// ============================================================================
// SELECTORS
// ============================================================================

export const selectReports = (state: { bulkSign: BulkSignState }) => state.bulkSign.reports;

// Memoized selector per evitare re-render non necessari
export const selectSelectedReports = createSelector(
  [selectReports],
  (reports) => reports.filter(r => r.selected)
);

export const selectSelectedCount = createSelector(
  [selectReports],
  (reports) => reports.filter(r => r.selected).length
);
export const selectIsModalOpen = (state: { bulkSign: BulkSignState }) => state.bulkSign.isModalOpen;
export const selectSession = (state: { bulkSign: BulkSignState }) => state.bulkSign.session;
export const selectSignProgress = (state: { bulkSign: BulkSignState }) => state.bulkSign.signProgress;
export const selectFilters = (state: { bulkSign: BulkSignState }) => state.bulkSign.filters;
