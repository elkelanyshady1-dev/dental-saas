import api from "./api";

export const getPatients = (params) =>
    api.get("/patients", { params });

export const getPatient = (id) =>
    api.get(`/patients/${id}`);

export const getPatientFamilies = (id) =>
    api.get(`/patients/${id}/families`);
