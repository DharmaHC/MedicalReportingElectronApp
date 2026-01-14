/**
 * bulkSignSlice.ts
 * Redux slice per la gestione della firma remota massiva dei referti.
 */

import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { url_worklist } from '../utility/urlLib';

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
 * Referto da firmare
 */
export interface ReportToSign {
  /** ID examination */
  examinationId: number;
  /** ID result */
  examResultId: number;
  /** Cognome paziente */
  patientLastName: string;
  /** Nome paziente */
  patientFirstName: string;
  /** Nome esame */
  examName: string;
  /** Data esame */
  examinationDate: string;
  /** Stato referto (6=Bozza, 7=Da Firmare) */
  examResultStateId: number;
  /** Codice medico */
  doctorCode: string;
  /** ID azienda per footer */
  companyId: string;
  /** Se selezionato per firma */
  selected: boolean;
  /** Stato firma */
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
  status: 'all' | 'draft' | 'toSign';
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
    status: 'toSign'
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
 * Carica i referti da firmare dal backend
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

      // Costruisci query params
      const params = new URLSearchParams();
      if (filters.dateFrom) params.append('fromDate', filters.dateFrom);
      if (filters.dateTo) params.append('toDate', filters.dateTo);
      params.append('doctorCodes', doctorCode);
      params.append('completedExaminations', 'false');

      const url = `${url_worklist()}?${params.toString()}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Filtra per stato (6=Bozza, 7=Da Firmare) e converti
      const reports: ReportToSign[] = data
        .filter((item: any) => {
          // Prima filtra per stato
          const stateOk = item.examResultStateId === 6 || item.examResultStateId === 7;
          if (!stateOk) return false;

          // Poi applica filtro status UI
          if (filters.status === 'draft') return item.examResultStateId === 6;
          if (filters.status === 'toSign') return item.examResultStateId === 7;
          return true; // 'all'
        })
        .filter((item: any) => {
          // Filtro per nome paziente
          if (!filters.patientName) return true;
          const search = filters.patientName.toLowerCase();
          const fullName = `${item.lastName || ''} ${item.firstName || ''}`.toLowerCase();
          return fullName.includes(search);
        })
        .map((item: any) => ({
          examinationId: item.examinationId,
          examResultId: item.examResultId || 0,
          patientLastName: item.lastName || '',
          patientFirstName: item.firstName || '',
          examName: item.examName || item.examinationMnemonicCodeFull || '',
          examinationDate: item.examinationStartDate || item.withdrawalDate || '',
          examResultStateId: item.examResultStateId,
          doctorCode: item.doctorCode || doctorCode,
          companyId: item.companyId || 'ASTER',
          selected: false,
          signStatus: 'pending' as const,
          errorMessage: undefined
        }));

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
export const selectSelectedReports = (state: { bulkSign: BulkSignState }) =>
  state.bulkSign.reports.filter(r => r.selected);
export const selectSelectedCount = (state: { bulkSign: BulkSignState }) =>
  state.bulkSign.reports.filter(r => r.selected).length;
export const selectIsModalOpen = (state: { bulkSign: BulkSignState }) => state.bulkSign.isModalOpen;
export const selectSession = (state: { bulkSign: BulkSignState }) => state.bulkSign.session;
export const selectSignProgress = (state: { bulkSign: BulkSignState }) => state.bulkSign.signProgress;
export const selectFilters = (state: { bulkSign: BulkSignState }) => state.bulkSign.filters;
