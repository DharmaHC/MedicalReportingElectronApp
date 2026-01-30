// store/authSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  userName: string | null;
  email: string | null;
  token: string | null;
  userId: string | null;
  doctorCode: string | null;
  doctorFullName: string | null;
  rememberMe: boolean;
  allowMedicalReportDigitalSignature: boolean;
  printReportWhenFinished: boolean;
  /** ➜ PIN della smart-card, valido solo per la sessione */
  pin: string | null;
  userCN: string | null;
  /** ➜ Flag che indica se l'utente è un tecnico radiologo */
  isTechnician: boolean;
  /** ➜ Codice identificativo del tecnico (username) */
  technicianCode: string | null;
  /** ➜ Tipo di firma remota: 'otp' (richiede OTP) o 'automatic' (senza OTP) */
  signatureType: 'otp' | 'automatic' | null;
  /** ➜ Username del certificato di firma remota */
  remoteSignUsername: string | null;
  /** ➜ Provider di firma remota (OPENAPI, ARUBA, etc.) */
  remoteSignProvider: string | null;
  /** ➜ Indica se la password di firma è configurata nel DB */
  hasRemoteSignPassword: boolean;
  /** ➜ Indica se il PIN di firma è configurato nel DB (Namirial richiede password + PIN separati) */
  hasRemoteSignPin: boolean;
}

const initialState: AuthState = {
  userName: null,
  email: null,
  token: null,
  userId: null,
  doctorCode: null,
  doctorFullName: null,
  rememberMe: false,
  allowMedicalReportDigitalSignature: false,
  printReportWhenFinished: false,
  pin: null,
  userCN: null,
  isTechnician: false,
  technicianCode: null,
  signatureType: null,
  remoteSignUsername: null,
  remoteSignProvider: null,
  hasRemoteSignPassword: false,
  hasRemoteSignPin: false,
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
      state.isTechnician = false;
      state.technicianCode = null;
      state.signatureType = null;
      state.remoteSignUsername = null;
      state.remoteSignProvider = null;
      state.hasRemoteSignPassword = false;
      state.hasRemoteSignPin = false;
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
    setDoctorFullName(state, action: PayloadAction<string | null>) {
      state.doctorFullName = action.payload;
    },
    setPin(state, action: PayloadAction<string | null>) {
      state.pin = action.payload;
    },
    setUserCN: (state, action) => {
      state.userCN = action.payload;
    },
    setIsTechnician(state, action: PayloadAction<boolean>) {
      state.isTechnician = action.payload;
    },
    setTechnicianCode(state, action: PayloadAction<string | null>) {
      state.technicianCode = action.payload;
    },
    setSignatureType(state, action: PayloadAction<'otp' | 'automatic' | null>) {
      state.signatureType = action.payload;
    },
    setRemoteSignUsername(state, action: PayloadAction<string | null>) {
      state.remoteSignUsername = action.payload;
    },
    setRemoteSignProvider(state, action: PayloadAction<string | null>) {
      state.remoteSignProvider = action.payload;
    },
    setHasRemoteSignPassword(state, action: PayloadAction<boolean>) {
      state.hasRemoteSignPassword = action.payload;
    },
    setHasRemoteSignPin(state, action: PayloadAction<boolean>) {
      state.hasRemoteSignPin = action.payload;
    },
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
  setDoctorFullName,
  setPin,
  setUserCN,
  setIsTechnician,
  setTechnicianCode,
  setSignatureType,
  setRemoteSignUsername,
  setRemoteSignProvider,
  setHasRemoteSignPassword,
  setHasRemoteSignPin,
} = authSlice.actions;

export default authSlice.reducer;
