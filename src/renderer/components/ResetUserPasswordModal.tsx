import React, { useEffect, useState } from "react";
import { Dialog, DialogActionsBar } from "@progress/kendo-react-dialogs";
import { ComboBox, ComboBoxFilterChangeEvent } from "@progress/kendo-react-dropdowns";
import { filterBy, FilterDescriptor } from "@progress/kendo-data-query";
import { useSelector } from "react-redux";
import { RootState } from "../store";
import { url_doctors, url_adminResetPassword } from "../utility/urlLib";

const DEFAULT_PASSWORD = "Aster2026!";

interface DoctorDto {
  doctorCode: string;
  doctorDescription: string;
  doctorFiscalCode: string;
  allowMedicalReportDigitalSignature?: boolean;
}

interface DoctorOption {
  text: string;
  userName: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

const ResetUserPasswordModal: React.FC<Props> = ({ visible, onClose }) => {
  const token = useSelector((s: RootState) => s.auth.token);

  const [allDoctors, setAllDoctors] = useState<DoctorOption[]>([]);
  const [filtered, setFiltered] = useState<DoctorOption[]>([]);
  const [selected, setSelected] = useState<DoctorOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setSuccessMsg(null);
    setSelected(null);

    const load = async () => {
      setLoading(true);
      try {
        const rsp = await fetch(url_doctors(), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!rsp.ok) throw new Error(`HTTP ${rsp.status}`);
        const data: DoctorDto[] = await rsp.json();
        const options = data
          .filter(d => !!d.doctorFiscalCode)
          .map(d => ({
            text: `${d.doctorDescription?.trim() || d.doctorCode?.trim()} (${d.doctorFiscalCode})`,
            userName: d.doctorFiscalCode.trim(),
          }))
          .sort((a, b) => a.text.localeCompare(b.text, "it", { sensitivity: "base" }));
        setAllDoctors(options);
        setFiltered(options);
      } catch (e: any) {
        setError(`Impossibile caricare l'elenco medici: ${e.message ?? e}`);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [visible, token]);

  const handleFilterChange = (event: ComboBoxFilterChangeEvent) => {
    const filter: FilterDescriptor = { ...event.filter, ignoreCase: true };
    setFiltered(filterBy(allDoctors, filter));
  };

  const handleConfirm = async () => {
    if (!selected) {
      setError("Seleziona un medico.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const rsp = await fetch(url_adminResetPassword(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userName: selected.userName,
          newPassword: DEFAULT_PASSWORD,
        }),
      });
      if (!rsp.ok) {
        const body = await rsp.text();
        throw new Error(body || `HTTP ${rsp.status}`);
      }
      setSuccessMsg(`Password reimpostata a "${DEFAULT_PASSWORD}" per ${selected.text}.`);
    } catch (e: any) {
      setError(`Errore: ${e.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Dialog title="Reset Password Medico" onClose={onClose}>
      <div style={{ minWidth: "420px", padding: "12px" }}>
        <p style={{ marginTop: 0 }}>
          Seleziona il medico e conferma: la password verrà forzata a{" "}
          <strong>{DEFAULT_PASSWORD}</strong>.
        </p>

        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", marginBottom: 4 }}>Medico</label>
          <ComboBox
            data={filtered}
            textField="text"
            dataItemKey="userName"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            filterable={true}
            onFilterChange={handleFilterChange}
            loading={loading}
            disabled={loading || submitting}
            placeholder="Inizia a digitare cognome, nome o CF..."
            style={{ width: "100%" }}
          />
        </div>

        {error && (
          <div style={{ color: "#b71c1c", marginBottom: 8, whiteSpace: "pre-wrap" }}>
            {error}
          </div>
        )}
        {successMsg && (
          <div style={{ color: "#1b5e20", marginBottom: 8 }}>
            {successMsg}
          </div>
        )}
      </div>

      <DialogActionsBar>
        <button
          className="k-button k-button-md k-rounded-md k-button-solid"
          onClick={onClose}
          disabled={submitting}
        >
          {successMsg ? "Chiudi" : "Annulla"}
        </button>
        {!successMsg && (
          <button
            className="k-button k-button-md k-rounded-md k-button-solid k-button-solid-primary"
            onClick={handleConfirm}
            disabled={submitting || loading || !selected}
          >
            {submitting ? "Reset in corso..." : "Conferma"}
          </button>
        )}
      </DialogActionsBar>
    </Dialog>
  );
};

export default ResetUserPasswordModal;
