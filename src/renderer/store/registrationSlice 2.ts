import { createSlice } from "@reduxjs/toolkit";

interface Registration {
  scheduleId: string;
  examinationMnemonicCodeFull: string;
  lastName: string;
  firstName: string;
  examinationId: number;
  withdrawalDate: string;
  doctorCode: string;
  clinicDepartmentId: string;
  workareaId: string;
  examinationStartDate: string;
  schedulingDateTime: string;
  age: number;
  isClosed: boolean;
  isComplete: boolean;
  createdByUser: string;
  lastModByUser: string;
  eeIsComplete: boolean;
  eeIsReported: boolean;
  medicalPrescriptionId: string | null;
  patientClinicNoteModDate: string | null;
  // aggiungi altre proprietà se necessario...
}
const initialState: Registration[] = [];

const registrationsSlice = createSlice({
  name: "registrations",
  initialState,
  reducers: {
    setRegistrations: (state, action) => {
      return action.payload;
    },
    clearRegistrations: () => {
      return [];
    },
  },
});

export const { setRegistrations, clearRegistrations } = registrationsSlice.actions;
export default registrationsSlice.reducer;
