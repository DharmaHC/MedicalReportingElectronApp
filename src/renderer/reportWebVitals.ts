// web-vitals: ReportHandler è stato rimosso dalla v3+.
// Questo file è un residuo CRA non utilizzato nell'app Electron.
type ReportHandler = (metric: Record<string, unknown>) => void;

const reportWebVitals = (_onPerfEntry?: ReportHandler) => {
  // no-op in Electron
};

export default reportWebVitals;
