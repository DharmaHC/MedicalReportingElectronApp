import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface Exam {
  examResultId: number;
  examId: number;
  examVersion: number;
  examBriefName: string;
  examName: string;
  subExamId: number;
  subExamName: string | null;
  subExamTypeId: number;
  numericResult: number | null;
  textResult: string | null;
  imageResult: string | null;
  examResultStateId: number;
  testUnitMeasure: string | null;
  isLinkedResult: boolean;
  linkedResults: Exam[] | null;
  medicalReportOrder: number;
  examinationId: number;
  clinicDepartmentId: string;
  workareaId: string;
  examinationExamInsertDate: string;
  examinationExamWithdrawalDate: string;
  doctorCode: string;
  prescriptionId: number;
  companyId: string;
  isScheduled: boolean;
  isReported: boolean;
  isComplete: boolean;
  isDraft: boolean;
  streamResultId: number | null;
  patientId: number;
  hasCustomReportTemplate: boolean | null;
}

interface ExaminationState {
  selectedExaminationId: string | null;
  selectedClinicDepartmentId: string | null;
  selectedWorkareaId: string | null;
  selectedExamId: string | null;
  selectedDoctorCode: string | null;
  selectedPatientId: string | null;
  selectedFromDate: string | null;
  selectedToDate: string | null;
  selectedMoreExams: Exam[]; 
  searchParams: {
    fromDate: string | null;
    toDate: string | null;
    searchByEacStartDate: boolean;
    searchByEacWithdrawalDate: boolean;
    searchModeStartsWith: boolean;
    searchModeContains: boolean;
    lastName: string | null;
    firstName: string | null;
    doctorCodes: string | null;
    clinicDepartmentIds: string | null;
    workareaIds: string | null;
    completedExaminations: boolean;
  };
}

const initialState: ExaminationState = {
  selectedExaminationId: null,
  selectedClinicDepartmentId: null,
  selectedWorkareaId: null,
  selectedExamId: null,
  selectedDoctorCode: null,
  selectedPatientId: null,
  selectedFromDate: null,
  selectedToDate: null,
  selectedMoreExams: [], // array vuoto iniziale
  searchParams: {
    fromDate: null,
    toDate: null,
    searchByEacStartDate: false,
    searchByEacWithdrawalDate: false,
    searchModeStartsWith: false,
    searchModeContains: false,
    lastName: null,
    firstName: null,
    doctorCodes: null,
    clinicDepartmentIds: null,
    workareaIds: null,
    completedExaminations: false,
  },
};

const examinationSlice = createSlice({
  name: "examination",
  initialState,
  reducers: {
    setSelectedExaminationId: (state, action: PayloadAction<string>) => {
      state.selectedExaminationId = action.payload;
    },
    setSearchParams: (
      state,
      action: PayloadAction<Partial<ExaminationState["searchParams"]>>
    ) => {
      state.searchParams = { ...state.searchParams, ...action.payload };
    },
    setSelectedDoctorCode: (state, action: PayloadAction<string>) => {
      state.selectedDoctorCode = action.payload;
    },
    setSelectedClinicDepartmentId: (state, action: PayloadAction<string>) => {
      state.selectedClinicDepartmentId = action.payload;
    },
    setSelectedWorkareaId: (state, action: PayloadAction<string>) => {
      state.selectedWorkareaId = action.payload;
    },
    setSelectedExamId: (state, action: PayloadAction<string>) => {
      state.selectedExamId = action.payload;
    },
    setSelectedPatientId: (state, action: PayloadAction<string>) => {
      state.selectedPatientId = action.payload;
    },
    addExamToSelectedMoreExams: (state, action: PayloadAction<Exam>) => {
      state.selectedMoreExams.push(action.payload);
    },
    removeExamFromSelectedMoreExams: (state, action: PayloadAction<number>) => {
      state.selectedMoreExams = state.selectedMoreExams.filter(
        (exam) => exam.examId !== action.payload
      );
    },
    setSelectedFromDate: (state, action: PayloadAction<string | null>) => {
      state.selectedFromDate = action.payload;
    },
    setSelectedToDate: (state, action: PayloadAction<string | null>) => {
      state.selectedToDate = action.payload;
    },
    addMultipleExamsToSelectedMoreExams: (state, action: PayloadAction<Exam[]>) => {
      state.selectedMoreExams.push(...action.payload);
    },
    clearSelectedMoreExams: (state) => {
      state.selectedMoreExams = [];
    },
    // Reset generico dello stato degli esami
    resetExaminationState: (state) => {
      state.selectedExaminationId = null; // <-- riga aggiunta per coerenza
      state.selectedExamId = null;
      state.selectedMoreExams = [];
      state.selectedDoctorCode = null;
      state.selectedPatientId = null;
      state.selectedClinicDepartmentId = null;
      state.selectedWorkareaId = null;
    },
  },
});

export const {
  setSearchParams,
  setSelectedExaminationId,
  setSelectedClinicDepartmentId,
  setSelectedWorkareaId,
  setSelectedDoctorCode,
  setSelectedExamId,
  setSelectedPatientId,
  addExamToSelectedMoreExams,
  removeExamFromSelectedMoreExams,
  addMultipleExamsToSelectedMoreExams,
  clearSelectedMoreExams,
  resetExaminationState,
  setSelectedFromDate,
  setSelectedToDate,
} = examinationSlice.actions;

export default examinationSlice.reducer;
