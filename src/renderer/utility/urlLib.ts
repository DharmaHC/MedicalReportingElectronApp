// URL base viene caricato da company-ui-settings.json all'avvio dell'applicazione
let url_base: string | null = null;

// Funzione per impostare l'URL base dalle settings
export const setApiBaseUrl = (baseUrl: string) => {
  url_base = baseUrl;
  console.log("✓ API Base URL configurato:", url_base);
};

// Funzione per ottenere l'URL base corrente (con validazione)
export const getApiBaseUrl = (): string => {
  if (!url_base) {
    throw new Error(
      "⚠️ ERRORE CONFIGURAZIONE: URL API non configurato!\n" +
      "Verifica che il file company-ui-settings.json contenga il campo 'apiBaseUrl'.\n" +
      "Percorso: C:\\ProgramData\\MedReportAndSign\\config\\company-ui-settings.json"
    );
  }
  return url_base;
};

// Helper per costruire URL in modo sicuro
const buildUrl = (endpoint: string): string => {
  return getApiBaseUrl() + endpoint;
};

// ⚠️ IMPORTANTE: Gli URL sono ora costruiti DINAMICAMENTE (getter) invece di costanti statiche
// Questo permette di cambiare url_base dopo l'import del modulo

// Getter per ogni URL (costruiti al momento dell'accesso)
export const url_token = (): string => buildUrl("Auth/token");
export const url_login = (): string => buildUrl("Account/login");
export const url_info = (): string => buildUrl("Account/manage/info");
export const url_getWorkareas = (): string => buildUrl("Workareas/getWorkareasByDoctor");
export const url_getWorkareasDefault = (): string => buildUrl("Workareas/getDefaultVisibleWorkareasByDoctor");
export const url_getClinicDepartements = (): string => buildUrl("ClinicDepartments/getClinicDepartmentsByDoctor");
export const url_getClinicDepartementsDefault = (): string => buildUrl("ClinicDepartments/getDefaultVisibleClinicDepartmentsByDoctor");
export const url_doctors = (): string => buildUrl("Doctors/");
export const url_doctors_id = (): string => buildUrl("User/Check/userDoctor");
export const url_worklist = (): string => buildUrl("Worklist");
export const url_getDistinctExamNames = (): string => buildUrl("Worklist/GetDistinctExamNames");
export const url_examResults = (): string => buildUrl("ExamResults/getExamResults");
export const url_singleReport = (): string => buildUrl("ExamResults/GetSingleReportTemplate");
export const url_moreReports = (): string => buildUrl("ExamResults/GetLinkedReportTemplates");
export const url_singleReport_Word = (): string => buildUrl("ExamResults/GetSingleReportTemplateWord");
export const url_singleReportHTML = (): string => buildUrl("ExamResults/GetSingleReportTemplateHTML");
export const url_GetPatientRTFHtmlResult = (): string => buildUrl("ExamResults/GetPatientRtfHtmlResult");
export const url_send_singleReportHTML = (): string => buildUrl("ExamResults/SendReportResultHTML");
export const url_linkedReportTemplatesHTML = (): string => buildUrl("ExamResults/GetLinkedReportTemplatesHTML");
export const url_processReport = (): string => buildUrl("ExamResults/ProcessRtfAndPdfReport");
export const url_getPredefinedTexts = (): string => buildUrl("Doctors/getPredefinedTexts");
export const url_insertPdfAttachment = (): string => buildUrl("ExamResults/InsertPdfAttachment");
export const url_getPatientReports = (): string => buildUrl("ExamResults/GetPatientReports"); // retro compatibilità
export const url_getPatientReportsNoPdf = (): string => buildUrl("ExamResults/GetPatientReportsNoPdf");
export const url_getPatientReport = (): string => buildUrl("ExamResults/GetPatientPdfResult");
export const url_getPatientSignedReport = (): string => buildUrl("ExamResults/GetPatientSignedReport");
export const url_DeletePatientPdfReport = (): string => buildUrl("ExamResults/DeletePatientPdfReport");
export const url_changePassword = (): string => buildUrl("Account/changePassword");
export const url_passwordForgot = (): string => buildUrl("Account/forgotPasswordForm");
export const url_registerUser = (): string => buildUrl("Account/register");

// Technician Authorization
export const url_isTechnician = (): string => buildUrl("MedicalPrescriptions/IsTechnician");
export const url_getUserDetailsId = (): string => buildUrl("MedicalPrescriptions/GetUserDetailsId");

// Medical Prescriptions
export const url_getPrescriptionTemplate = (): string => buildUrl("MedicalPrescriptions/GetPrescriptionTemplate");
export const url_savePrescription = (): string => buildUrl("MedicalPrescriptions/SavePrescription");
export const url_getExistingPrescription = (): string => buildUrl("MedicalPrescriptions/GetExistingPrescription");
export const url_getUserDisplayName = (): string => buildUrl("MedicalPrescriptions/GetUserDisplayName");
