/**
 * bulkSignSlice.ts
 * Redux slice per la gestione della firma remota massiva dei referti.
 */

import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import {
  url_worklist,
  url_getWorkareasDefault,
  url_getClinicDepartementsDefault,
  url_examResults
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
 * Referto da firmare (può essere singolo o composto da più examResults)
 */
export interface ReportToSign {
  /** ID examination */
  examinationId: number;
  /** ID result principale (primo del gruppo) */
  examResultId: number;
  /** Lista di tutti gli examResultId collegati (per referti composti) */
  linkedResultIds: number[];
  /** Cognome paziente */
  patientLastName: string;
  /** Nome paziente */
  patientFirstName: string;
  /** Nome esame (o lista nomi se composto) */
  examName: string;
  /** Lista nomi esami (per referti composti) */
  examNames: string[];
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
  /** Se è un referto composto (più examResults) */
  isComposite: boolean;
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
 * Carica i referti da firmare dal backend
 */
export const fetchReportsToSign = createAsyncThunk<
  ReportToSign[],
  { doctorCode: string; token: string; userId: string },
  { state: { bulkSign: BulkSignState } }
>(
  'bulkSign/fetchReportsToSign',
  async ({ doctorCode, token, userId }, { getState, rejectWithValue }) => {
    try {
      const { filters } = getState().bulkSign;

      // Date di default: ultimo mese se non specificate
      const today = new Date();
      const oneMonthAgo = new Date(today);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const fromDate = filters.dateFrom || oneMonthAgo.toISOString().split('T')[0];
      const toDate = filters.dateTo || today.toISOString().split('T')[0];

      // ==================================================================
      // STEP 1: Recupera i default workareas e clinic departments per l'utente
      // La stored procedure richiede questi parametri obbligatori
      // ==================================================================
      console.log('🔍 [BULK SIGN] Fetching default workareas and clinic departments for userId:', userId);

      // Fetch default workareas
      const workareasUrl = `${url_getWorkareasDefault()}?userId=${userId}`;
      console.log('🔍 [BULK SIGN] Fetching workareas:', workareasUrl);
      const workareasResp = await fetch(workareasUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      let workareaIds = '';
      if (workareasResp.ok) {
        const workareas = await workareasResp.json();
        workareaIds = workareas.map((w: any) => w.workareaId).join(',');
        console.log('🔍 [BULK SIGN] Default workareas:', workareaIds);
      } else {
        console.warn('🔍 [BULK SIGN] Could not fetch default workareas:', workareasResp.status);
      }

      // Fetch default clinic departments
      const deptUrl = `${url_getClinicDepartementsDefault()}?userId=${userId}`;
      console.log('🔍 [BULK SIGN] Fetching clinic departments:', deptUrl);
      const deptResp = await fetch(deptUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      let clinicDepartmentIds = '';
      if (deptResp.ok) {
        const depts = await deptResp.json();
        clinicDepartmentIds = depts.map((d: any) => d.clinicDepartmentId).join(',');
        console.log('🔍 [BULK SIGN] Default clinic departments:', clinicDepartmentIds);
      } else {
        console.warn('🔍 [BULK SIGN] Could not fetch default clinic departments:', deptResp.status);
      }

      // ==================================================================
      // STEP 2: Costruisci query params per Worklist
      // ==================================================================
      const params = new URLSearchParams();
      params.append('fromDate', fromDate);
      params.append('toDate', toDate);
      params.append('searchByEacStartDate', 'true');
      params.append('searchByEacWithdrawalDate', 'false');
      params.append('searchModeStartsWith', 'false');
      params.append('searchModeContains', 'true');
      // doctorCodes: necessario per filtrare solo i referti del medico
      params.append('doctorCodes', doctorCode);
      // clinicDepartmentIds e workareaIds: OBBLIGATORI per la stored procedure
      if (clinicDepartmentIds) {
        params.append('clinicDepartmentIds', clinicDepartmentIds);
      }
      if (workareaIds) {
        params.append('workareaIds', workareaIds);
      }
      // completedExaminations=true per includere accettazioni con referto (bozze e da firmare)
      params.append('completedExaminations', 'true');

      const url = `${url_worklist()}?${params.toString()}`;

      // Debug: log completo della richiesta
      console.log('🔍 [BULK SIGN] Chiamata API Worklist:');
      console.log('  URL:', url);
      console.log('  doctorCode:', doctorCode);
      console.log('  fromDate:', fromDate, 'toDate:', toDate);
      console.log('  Token (primi 20 char):', token?.substring(0, 20) + '...');

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('🔍 [BULK SIGN] Response status:', response.status);

      if (!response.ok) {
        // Prova a leggere il body dell'errore
        let errorBody = '';
        try {
          errorBody = await response.text();
          console.error('🔍 [BULK SIGN] Error body:', errorBody);
        } catch (e) {
          console.error('🔍 [BULK SIGN] Could not read error body');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`);
      }

      const examinations = await response.json();

      // Debug: log delle accettazioni ricevute
      console.log('🔍 [BULK SIGN] Worklist ha restituito', examinations.length, 'accettazioni');

      if (examinations.length === 0) {
        return [];
      }

      // ==================================================================
      // STEP 3: Per ogni accettazione, recupera i risultati esami (referti)
      // L'API Worklist restituisce accettazioni, non referti con stato
      // ==================================================================
      console.log('🔍 [BULK SIGN] Recupero risultati esami per ogni accettazione...');

      // Prima raccogli tutti i risultati raw con linkedResults
      interface RawResult {
        examinationId: number;
        examResultId: number;
        linkedResults: string | null;
        examName: string;
        examResultStateId: number;
        doctorCode: string;
        companyId: string;
        patientLastName: string;
        patientFirstName: string;
        examinationDate: string;
      }
      const allRawResults: RawResult[] = [];

      // Fetch exam results per ogni accettazione (in parallelo, max 10 alla volta)
      const batchSize = 10;
      for (let i = 0; i < examinations.length; i += batchSize) {
        const batch = examinations.slice(i, i + batchSize);

        const batchPromises = batch.map(async (exam: any) => {
          try {
            const examResultsUrl = `${url_examResults()}?examinationId=${exam.examinationId}&doctorCode=${doctorCode}`;
            const resultsResp = await fetch(examResultsUrl, {
              headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!resultsResp.ok) {
              console.warn(`🔍 [BULK SIGN] Errore fetch results per exam ${exam.examinationId}:`, resultsResp.status);
              return [];
            }

            const results = await resultsResp.json();

            // Filtra per stato 6 (Bozza) o 7 (Da Firmare) e mantieni linkedResults
            return results
              .filter((r: any) => r.examResultStateId === 6 || r.examResultStateId === 7)
              .map((r: any) => ({
                examinationId: exam.examinationId,
                examResultId: r.examResultId || 0,
                linkedResults: r.linkedResults || null,
                examName: r.examName || exam.examinationMnemonicCodeFull || '',
                examResultStateId: r.examResultStateId,
                doctorCode: r.doctorCode || doctorCode,
                companyId: r.companyId || 'ASTER',
                patientLastName: exam.lastName || '',
                patientFirstName: exam.firstName || '',
                examinationDate: exam.examinationStartDate || exam.withdrawalDate || ''
              }));
          } catch (err) {
            console.warn(`🔍 [BULK SIGN] Eccezione fetch results per exam ${exam.examinationId}:`, err);
            return [];
          }
        });

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(results => allRawResults.push(...results));
      }

      console.log('🔍 [BULK SIGN] Totale risultati raw trovati (stato 6 o 7):', allRawResults.length);

      // ==================================================================
      // STEP 4: Raggruppa i risultati in base a linkedResults
      // ==================================================================
      const processedIds = new Set<number>();
      const groupedReports: ReportToSign[] = [];

      for (const result of allRawResults) {
        // Salta se già processato come parte di un gruppo
        if (processedIds.has(result.examResultId)) {
          continue;
        }

        // Determina gli ID collegati
        let linkedIds: number[] = [];
        if (result.linkedResults && result.linkedResults.trim()) {
          // Parsing degli ID collegati (formato: "123,456,789")
          linkedIds = result.linkedResults
            .split(',')
            .map(id => parseInt(id.trim(), 10))
            .filter(id => !isNaN(id));
        }

        // Se non ci sono linkedResults o solo uno (se stesso), è un referto singolo
        const isComposite = linkedIds.length > 1;

        if (isComposite) {
          // Referto composto: raggruppa tutti i risultati con questi ID
          const groupResults = allRawResults.filter(r => linkedIds.includes(r.examResultId));

          // Marca tutti come processati
          linkedIds.forEach(id => processedIds.add(id));

          // Crea entry raggruppata
          const examNames = groupResults.map(r => r.examName);
          groupedReports.push({
            examinationId: result.examinationId,
            examResultId: linkedIds[0], // Primo ID come riferimento
            linkedResultIds: linkedIds,
            patientLastName: result.patientLastName,
            patientFirstName: result.patientFirstName,
            examName: examNames.join(' + '),
            examNames: examNames,
            examinationDate: result.examinationDate,
            examResultStateId: result.examResultStateId,
            doctorCode: result.doctorCode,
            companyId: result.companyId,
            selected: false,
            signStatus: 'pending',
            errorMessage: undefined,
            isComposite: true
          });

          console.log(`🔍 [BULK SIGN] Referto composto: ${examNames.join(' + ')} (${linkedIds.length} esami)`);
        } else {
          // Referto singolo
          processedIds.add(result.examResultId);

          groupedReports.push({
            examinationId: result.examinationId,
            examResultId: result.examResultId,
            linkedResultIds: [result.examResultId],
            patientLastName: result.patientLastName,
            patientFirstName: result.patientFirstName,
            examName: result.examName,
            examNames: [result.examName],
            examinationDate: result.examinationDate,
            examResultStateId: result.examResultStateId,
            doctorCode: result.doctorCode,
            companyId: result.companyId,
            selected: false,
            signStatus: 'pending',
            errorMessage: undefined,
            isComposite: false
          });
        }
      }

      console.log('🔍 [BULK SIGN] Referti dopo raggruppamento:', groupedReports.length);

      // Debug: distribuzione per stato
      if (groupedReports.length > 0) {
        const states = groupedReports.reduce((acc: any, item) => {
          acc[item.examResultStateId] = (acc[item.examResultStateId] || 0) + 1;
          return acc;
        }, {});
        console.log('🔍 [BULK SIGN] Distribuzione per stato:', states);
        const compositeCount = groupedReports.filter(r => r.isComposite).length;
        console.log(`🔍 [BULK SIGN] Referti composti: ${compositeCount}, singoli: ${groupedReports.length - compositeCount}`);
      }

      // Applica filtri UI
      const filteredReports = groupedReports
        .filter((item) => {
          // Filtro status UI
          if (filters.status === 'draft') return item.examResultStateId === 6;
          if (filters.status === 'toSign') return item.examResultStateId === 7;
          return true; // 'all'
        })
        .filter((item) => {
          // Filtro per nome paziente
          if (!filters.patientName) return true;
          const search = filters.patientName.toLowerCase();
          const fullName = `${item.patientLastName} ${item.patientFirstName}`.toLowerCase();
          return fullName.includes(search);
        });

      console.log('🔍 [BULK SIGN] Referti dopo filtri UI:', filteredReports.length);

      return filteredReports;
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
