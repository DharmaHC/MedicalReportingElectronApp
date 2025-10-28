const url_base = "https://medicalreportingapi.asterdiagnostica.it/api/";
//const url_base = "https://current-mostly-toad.ngrok-free.app/api/";

export const url_token = url_base + "Auth/token";
export const url_login = url_base + "Account/login";
export const url_info = url_base + "Account/manage/info";
export const url_getWorkareas = url_base + "Workareas/getWorkareasByDoctor";
export const url_getWorkareasDefault =
  url_base + "Workareas/getDefaultVisibleWorkareasByDoctor";
export const url_getClinicDepartements =
  url_base + "ClinicDepartments/getClinicDepartmentsByDoctor";
export const url_getClinicDepartementsDefault =
  url_base + "ClinicDepartments/getDefaultVisibleClinicDepartmentsByDoctor";
export const url_doctors = url_base + "Doctors/";
export const url_doctors_id = url_base + "User/Check/userDoctor";
export const url_worklist = url_base + "Worklist";
export const url_examResults = url_base + "ExamResults/getExamResults";
export const url_singleReport =
  url_base + "ExamResults/GetSingleReportTemplate";
export const url_moreReports =
  url_base + "ExamResults/GetLinkedReportTemplates";
export const url_singleReport_Word =
  url_base + "ExamResults/GetSingleReportTemplateWord";
export const url_singleReportHTML =
  url_base + "ExamResults/GetSingleReportTemplateHTML";
export const url_GetPatientRTFHtmlResult =
  url_base + "ExamResults/GetPatientRtfHtmlResult";
export const url_send_singleReportHTML =
  url_base + "ExamResults/SendReportResultHTML";
export const url_linkedReportTemplatesHTML =
  url_base + "ExamResults/GetLinkedReportTemplatesHTML";
export const url_processReport =
  url_base + "ExamResults/ProcessRtfAndPdfReport";
export const url_getPredefinedTexts = url_base + "Doctors/getPredefinedTexts";
export const url_insertPdfAttachment =
  url_base + "ExamResults/InsertPdfAttachment";
export const url_getPatientReports = url_base + "ExamResults/GetPatientReports"; // solo per retro compatibilità, sostituito dal "NoPdf" più leggero. Il pdf viene richiesto on demand
export const url_getPatientReportsNoPdf = url_base + "ExamResults/GetPatientReportsNoPdf";
export const url_getPatientReport = url_base + "ExamResults/GetPatientPdfResult";
export const url_getPatientSignedReport = url_base + "ExamResults/GetPatientSignedReport";
export const url_DeletePatientPdfReport =
  url_base + "ExamResults/DeletePatientPdfReport";
export const url_changePassword =
  url_base + "Account/changePassword";
export const url_passwordForgot = url_base + "Account/forgotPasswordForm";
export const url_getPrescriptionTemplate = url_base + "MedicalPrescriptions/GetPrescriptionTemplate";
export const url_savePrescription = url_base + "MedicalPrescriptions/SavePrescription";
export const url_getExistingPrescription = url_base + "MedicalPrescriptions/GetExistingPrescription";
export const url_getUserDisplayName = url_base + "MedicalPrescriptions/GetUserDisplayName";
export const url_isTechnician = url_base + "MedicalPrescriptions/IsTechnician";
