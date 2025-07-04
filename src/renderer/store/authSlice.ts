// store/authSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  userName: string | null;
  email: string | null;   
  token: string | null;
  userId: string | null;
  doctorCode: string | null;
  rememberMe: boolean;
  allowMedicalReportDigitalSignature: boolean;
  printReportWhenFinished: boolean;
    /** ➜ PIN della smart-card, valido solo per la sessione */
  pin: string | null;
  userCN: string | null;
}

const initialState: AuthState = {
  userName: null,
  email: null,
  token: null,
  userId: null,
  doctorCode: null,
  rememberMe: false,
  allowMedicalReportDigitalSignature: false,
  printReportWhenFinished: false,
  pin: null,
  userCN: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // userName e rememberMe
    login(state, action: PayloadAction<{ userName: string; rememberMe: boolean }>) {
      state.userName = action.payload.userName;
      state.rememberMe = action.payload.rememberMe;
    },
    logout(state) {
      state.userName = null;
      state.token = null;
      state.userId = null;
      state.doctorCode = null;
      state.rememberMe = false;
      state.allowMedicalReportDigitalSignature = false;
      state.printReportWhenFinished = false;
    },
    setToken(state, action: PayloadAction<string | null>) {
      state.token = action.payload;
    },
    setUserId(state, action: PayloadAction<string | null>) {
      state.userId = action.payload;
    },
    setAllowMedicalReportDigitalSignature(state, action: PayloadAction<boolean>) {
      state.allowMedicalReportDigitalSignature = action.payload;
    },
    setprintReportWhenFinished(state, action: PayloadAction<boolean>) {
      state.printReportWhenFinished = action.payload;
    },
    setDoctorCode(state, action: PayloadAction<string | null>) {
      state.doctorCode = action.payload;
    },
    setPin(state, action: PayloadAction<string | null>) {
      state.pin = action.payload;},
    setUserCN: (state, action) => {
      state.userCN = action.payload;},
   },
});

export const {
  login,
  logout,
  setToken,
  setUserId,
  setAllowMedicalReportDigitalSignature,
  setprintReportWhenFinished,
  setDoctorCode,
  setPin,
  setUserCN,
} = authSlice.actions;

export default authSlice.reducer;
