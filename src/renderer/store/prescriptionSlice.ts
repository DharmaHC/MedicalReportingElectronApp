// store/prescriptionSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface PrescriptionState {
  /** ➜ Contenuto HTML della prescrizione corrente */
  prescriptionContent: string;
  /** ➜ ID del risultato esame per cui si sta lavorando */
  currentExamResultId: number | null;
  /** ➜ ID dell'esame corrente */
  currentExaminationId: number | null;
  /** ➜ Flag che indica se l'editor modale è aperto */
  isEditingPrescription: boolean;
  /** ➜ Flag che indica se esiste già una prescrizione salvata */
  hasExistingPrescription: boolean;
  /** ➜ ID della prescrizione esistente (se presente) */
  existingPrescriptionId: number | null;
  /** ➜ Username di chi ha creato la prescrizione originale */
  createdBy: string | null;
  /** ➜ Data ultima modifica */
  lastModified: string | null;
  /** ➜ Flag di read-only (se tecnico diverso da creatore) */
  isReadOnly: boolean;
  /** ➜ Descrizione della prestazione */
  examDescription: string | null;
  /** ➜ Lista di esami collegati per prescrizione unica */
  linkedExams: Array<{ examResultId: number; examId: number; examName: string; subExamName: string | null }>;
}

const initialState: PrescriptionState = {
  prescriptionContent: '',
  currentExamResultId: null,
  currentExaminationId: null,
  isEditingPrescription: false,
  hasExistingPrescription: false,
  existingPrescriptionId: null,
  createdBy: null,
  lastModified: null,
  isReadOnly: false,
  examDescription: null,
  linkedExams: [],
};

const prescriptionSlice = createSlice({
  name: 'prescription',
  initialState,
  reducers: {
    setPrescriptionContent(state, action: PayloadAction<string>) {
      state.prescriptionContent = action.payload;
    },
    setCurrentExamResultId(state, action: PayloadAction<number | null>) {
      state.currentExamResultId = action.payload;
    },
    setCurrentExaminationId(state, action: PayloadAction<number | null>) {
      state.currentExaminationId = action.payload;
    },
    setIsEditingPrescription(state, action: PayloadAction<boolean>) {
      state.isEditingPrescription = action.payload;
    },
    setHasExistingPrescription(state, action: PayloadAction<boolean>) {
      state.hasExistingPrescription = action.payload;
    },
    setExistingPrescriptionId(state, action: PayloadAction<number | null>) {
      state.existingPrescriptionId = action.payload;
    },
    setCreatedBy(state, action: PayloadAction<string | null>) {
      state.createdBy = action.payload;
    },
    setLastModified(state, action: PayloadAction<string | null>) {
      state.lastModified = action.payload;
    },
    setIsReadOnly(state, action: PayloadAction<boolean>) {
      state.isReadOnly = action.payload;
    },
    setExamDescription(state, action: PayloadAction<string | null>) {
      state.examDescription = action.payload;
    },
    setLinkedExams(state, action: PayloadAction<Array<{ examResultId: number; examId: number; examName: string; subExamName: string | null }>>) {
      state.linkedExams = action.payload;
    },
    /** Reset completo dello stato (quando si chiude l'editor) */
    resetPrescriptionState(state) {
      state.prescriptionContent = '';
      state.currentExamResultId = null;
      state.currentExaminationId = null;
      state.isEditingPrescription = false;
      state.hasExistingPrescription = false;
      state.existingPrescriptionId = null;
      state.createdBy = null;
      state.lastModified = null;
      state.isReadOnly = false;
      state.examDescription = null;
      state.linkedExams = [];
    },
  },
});

export const {
  setPrescriptionContent,
  setCurrentExamResultId,
  setCurrentExaminationId,
  setIsEditingPrescription,
  setHasExistingPrescription,
  setExistingPrescriptionId,
  setCreatedBy,
  setLastModified,
  setIsReadOnly,
  setExamDescription,
  setLinkedExams,
  resetPrescriptionState,
} = prescriptionSlice.actions;

export default prescriptionSlice.reducer;
