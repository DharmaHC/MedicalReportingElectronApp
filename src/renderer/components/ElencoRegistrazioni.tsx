import React, { useEffect, useState, useMemo } from "react";
import { Grid, GridColumn as Column, GridSortChangeEvent } from "@progress/kendo-react-grid";
import { orderBy, SortDescriptor } from "@progress/kendo-data-query";
import moment from "moment";
import labels from "../utility/label";
import "./ElencoRegistrazioni.css";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../store";
import {
  resetExaminationState,
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
  // Inizializza il sort dal localStorage se disponibile
  const [sort, setSort] = useState<SortDescriptor[]>(() => {
    try {
      const savedSort = localStorage.getItem('elencoRegistrazioni_sort');
      return savedSort ? JSON.parse(savedSort) : [];
    } catch (error) {
      console.error('[SORT] Error loading sort from localStorage:', error);
      return [];
    }
  });

  // Salva il sort nel localStorage quando cambia
  useEffect(() => {
    try {
      localStorage.setItem('elencoRegistrazioni_sort', JSON.stringify(sort));
    } catch (error) {
      console.error('[SORT] Error saving sort to localStorage:', error);
    }
  }, [sort]);

  // Reset del sort quando cambiano i dati per evitare problemi con sort invalidi
  useEffect(() => {
    if (data.length > 0 && sort.length > 0) {
      const validFields = Object.keys(data[0] || {});
      const hasInvalidField = sort.some(s => !validFields.includes(s.field || ''));
      if (hasInvalidField) {
        console.log('[SORT] Resetting invalid sort criteria');
        setSort([]);
      }
    }
  }, [data.length]);

  const handleRowClick = (event: any) => {
    try {
      const selectedExaminationId = event.dataItem?.examinationId;
      const doctorCode = event.dataItem?.doctorCode;
      const patientId = event.dataItem?.patientId;
      const clinicDepartmentId = event.dataItem?.clinicDepartmentId;
      const workareaId = event.dataItem?.workareaId;

    // [AZIONE CHIAVE] Resetta completamente lo stato dell'esame precedente
      dispatch(resetExaminationState());
    
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

  // Rimuovi duplicati per examinationId e poi ordina
  const sortedData = useMemo(() => {
    // Filtra i duplicati mantenendo solo la prima occorrenza
    const uniqueData = data.filter((item, index, self) =>
      index === self.findIndex(t => t.examinationId === item.examinationId)
    );

    const originalLength = data.length;
    const uniqueLength = uniqueData.length;

    if (originalLength !== uniqueLength) {
      console.warn(
        `[DEDUPE] Rimossi ${originalLength - uniqueLength} duplicati dall'API ` +
        `(${originalLength} → ${uniqueLength} record)`
      );
    }

    return orderBy(uniqueData, sort);
  }, [data, sort]);

  // Helper per creare celle con evidenziazione
  const createCellWithSelection = (fieldGetter: (dataItem: any) => any) => {
    return (props: any) => {
      const isSelected = props.dataItem.examinationId === selectedExaminationId;
      return (
        <td style={{ backgroundColor: isSelected ? "lightblue" : undefined }}>
          {fieldGetter(props.dataItem)}
        </td>
      );
    };
  };

  return (
    <div className="elenco-registrazioni">
      <Grid
        data={sortedData}
        style={{ height: "100%", cursor: "pointer" }}
        onRowClick={handleRowClick}
        sortable={true}
        sort={sort}
        onSortChange={(e: GridSortChangeEvent) => {
          setSort(e.sort);
        }}
        dataItemKey="examinationId"
      >
        <Column
          field="withdrawalDate"
          title={labels.elencoRegistrazioni.dataRitiro}
          width="120px"
          cell={createCellWithSelection(d => dateFormatter(d.withdrawalDate))}
        />
        <Column
          field="examinationStartDate"
          title={labels.elencoRegistrazioni.del}
          width="120px"
          cell={createCellWithSelection(d => dateFormatter(d.examinationStartDate))}
        />
        <Column
          field="lastName"
          title={labels.elencoRegistrazioni.cognome}
          width="150px"
          cell={createCellWithSelection(d => d.lastName)}
        />
        <Column
          field="firstName"
          title={labels.elencoRegistrazioni.nome}
          width="150px"
          cell={createCellWithSelection(d => d.firstName)}
        />
        <Column
          field="age"
          title={labels.elencoRegistrazioni.eta}
          width="80px"
          cell={createCellWithSelection(d => d.age)}
        />
        <Column
          field="examinationMnemonicCodeFull"
          title={labels.elencoRegistrazioni.codice}
          width="150px"
          cell={createCellWithSelection(d => d.examinationMnemonicCodeFull)}
        />
        <Column
          field="workareaId"
          title={labels.elencoRegistrazioni.settori}
          width="150px"
          cell={createCellWithSelection(d => d.workareaId)}
        />
        <Column
          field="examinationWorkflowNote"
          title={labels.elencoRegistrazioni.examinationWorkflowNote}
          width="150px"
          cell={createCellWithSelection(d => d.examinationWorkflowNote)}
        />
        <Column
          field="createdByUser"
          title={labels.elencoRegistrazioni.creataDa}
          width="150px"
          cell={createCellWithSelection(d => d.createdByUser)}
        />
      </Grid>
    </div>
  );
};

export default ElencoRegistrazioni;
