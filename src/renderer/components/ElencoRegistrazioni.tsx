import React, { useEffect, useState } from "react";
import { Grid, GridColumn as Column, GridSortChangeEvent } from "@progress/kendo-react-grid";
import { orderBy, SortDescriptor } from "@progress/kendo-data-query";
import moment from "moment";
import labels from "../utility/label";
import "./ElencoRegistrazioni.css";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../store";
import {
  setSelectedDoctorCode,
  setSelectedExaminationId,
  setSelectedPatientId,
  setSelectedClinicDepartmentId,
  setSelectedWorkareaId,
} from "../store/examinationSlice";

const dateFormatter = (date: string) => moment(date).format("DD/MM/YYYY");

const ElencoRegistrazioni = () => {
  const data = useSelector((state: RootState) => state.registrations);
  const searchParams = useSelector((state: RootState) => state.exam.searchParams);
  const selectedExaminationId = useSelector(
    (state: RootState) => state.exam.selectedExaminationId
  );

  const dispatch = useDispatch();

  // [MODIFICA] Stato locale per mantenere i criteri di sorting
  const [sort, setSort] = useState<SortDescriptor[]>(() => {
    const saved = localStorage.getItem("elencoRegistrazioniSort");
    return saved ? JSON.parse(saved) : [];
  });

 useEffect(() => {
    localStorage.setItem("elencoRegistrazioniSort", JSON.stringify(sort));
  }, [sort]);
  
  
  const handleRowClick = (event: any) => {
    try {
      const selectedExaminationId = event.dataItem?.examinationId;
      const doctorCode = event.dataItem?.doctorCode;
      const patientId = event.dataItem?.patientId;
      const clinicDepartmentId = event.dataItem?.clinicDepartmentId;
      const workareaId = event.dataItem?.workareaId;

      console.log("Row Clicked:");
      console.log("Examination ID:", selectedExaminationId);
      console.log("Doctor Code:", doctorCode);
      console.log("Patient ID:", patientId);
      console.log("Clinic Department ID:", clinicDepartmentId);
      console.log("Workarea ID:", workareaId);

      if (selectedExaminationId) {
        dispatch(setSelectedExaminationId(selectedExaminationId));
        dispatch(setSelectedDoctorCode(doctorCode));
        dispatch(setSelectedPatientId(patientId));
        dispatch(setSelectedClinicDepartmentId(clinicDepartmentId));
        dispatch(setSelectedWorkareaId(workareaId));
      } else {
        console.log("examinationId non trovato");
      }
    } catch (error) {
      console.error("Error handling row click:", error);
    }
  };

  useEffect(() => {
    if (data.length === 0) {
      dispatch(setSelectedDoctorCode(""));
      dispatch(setSelectedPatientId(""));
      dispatch(setSelectedClinicDepartmentId(""));
      dispatch(setSelectedWorkareaId(""));
    }
  }, [data.length, dispatch]);

  // Custom row rendering to highlight the selected row
  const rowRender = (row: any, props: any) => {
    const isSelected = props.dataItem.examinationId === selectedExaminationId;
    const rowProps = {
      ...row.props,
      style: {
        ...row.props.style,
        backgroundColor: isSelected ? "lightblue" : undefined,
      },
    };
    return React.cloneElement(row, rowProps, row.props.children);
  };

  return (
    <div className="elenco-registrazioni">
      <Grid
        // [MODIFICA] Al posto di data={data}, usiamo data={orderBy(data, sort)}
        data={orderBy(data, sort)}
        style={{ height: "100%", cursor: "pointer" }}
        onRowClick={handleRowClick}
        rowRender={rowRender}
        // [MODIFICA] Abilitiamo il sorting built-in
        sortable
        sort={sort}
        onSortChange={(e: GridSortChangeEvent) => {
          setSort(e.sort);
        }}
      >
        <Column
          field="withdrawalDate"
          title={labels.elencoRegistrazioni.dataRitiro}
          width="120px"
          cell={(props) => (
            <td>{dateFormatter(props.dataItem.withdrawalDate)}</td>
          )}
        />
        <Column
          field="examinationStartDate"
          title={labels.elencoRegistrazioni.del}
          width="120px"
          cell={(props) => (
            <td>{dateFormatter(props.dataItem.examinationStartDate)}</td>
          )}
        />
        <Column
          field="lastName"
          title={labels.elencoRegistrazioni.cognome}
          width="150px"
        />
        <Column
          field="firstName"
          title={labels.elencoRegistrazioni.nome}
          width="150px"
        />
        <Column
          field="age"
          title={labels.elencoRegistrazioni.eta}
          width="80px"
        />
        <Column
          field="examinationMnemonicCodeFull"
          title={labels.elencoRegistrazioni.codice}
          width="150px"
        />
        <Column
          field="workareaId"
          title={labels.elencoRegistrazioni.settori}
          width="150px"
        />
        <Column
          field="examinationWorkflowNote"
          title={labels.elencoRegistrazioni.examinationWorkflowNote}
          width="150px"
        />
        <Column
          field="createdByUser"
          title={labels.elencoRegistrazioni.creataDa}
          width="150px"
        />
      </Grid>
    </div>
  );
};

export default ElencoRegistrazioni;
