import api from "./api";

/* ── Calendar day view ────────────────────────────────── */
export const getCalendar = (date, branchIds, doctorId) => {
    const params = { date };
    if (branchIds?.length) params.branchIds = branchIds.join(",");
    if (doctorId) params.doctorId = doctorId;
    return api.get("/appointments/calendar", { params });
};

/* ── Availability (slot grid) ─────────────────────────── */
export const getAvailability = (branchId, chairId, dentistId, date) =>
    api.get("/appointments/availability", {
        params: { branchId, chairId, dentistId, date },
    });

/* ── CRUD ─────────────────────────────────────────────── */
export const createAppointment = (data) =>
    api.post("/appointments", data);

export const updateAppointmentStatus = (id, status) =>
    api.patch(`/appointments/${id}/status`, { status });

export const getAppointments = (params) =>
    api.get("/appointments", { params });
