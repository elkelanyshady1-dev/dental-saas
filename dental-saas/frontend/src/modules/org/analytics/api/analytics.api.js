/**
 * analytics.api.js — Org Analytics API client
 *
 * PLANE:  Org only
 * CQRS:   READ side — /org/analytics/* projections.
 *
 * organizationId is NEVER sent — derived from JWT on backend.
 * Every endpoint accepts { from, to, branchId?, granularity?, timezone? }.
 */
import api from "@/services/api";

const BASE = "/org/analytics";

function clean(params = {}) {
    const out = {};
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === "") continue;
        if (k === "branchId" && v === "ALL") continue;
        out[k] = v;
    }
    return out;
}

export const analyticsApi = {
    getOverview:     (params) => api.get(`${BASE}/overview`,     { params: clean(params) }),
    getRevenue:      (params) => api.get(`${BASE}/revenue`,      { params: clean(params) }),
    getAppointments: (params) => api.get(`${BASE}/appointments`, { params: clean(params) }),
    getPatients:     (params) => api.get(`${BASE}/patients`,     { params: clean(params) }),
    getProcedures:   (params) => api.get(`${BASE}/procedures`,   { params: clean(params) }),
    getDoctors:      (params) => api.get(`${BASE}/doctors`,      { params: clean(params) }),
    getChair:        (params) => api.get(`${BASE}/chair`,        { params: clean(params) }),
    getBranches:     (params) => api.get(`${BASE}/branches`,     { params: clean(params) }),
    getLab:          (params) => api.get(`${BASE}/lab`,          { params: clean(params) }),
    getInventory:    (params) => api.get(`${BASE}/inventory`,    { params: clean(params) }),
    /**
     * Downloads the streamed CSV export. Uses the auth-attached api client
     * so the Bearer token + branch header are sent; builds a Blob URL and
     * triggers a download click. Returns a Promise that resolves once the
     * download has started (the stream may still be in flight).
     */
    async downloadCsv(params) {
        const resp = await api.get(`${BASE}/export`, {
            params: clean(params),
            responseType: "blob",
        });
        const blob = new Blob([resp.data], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const filename = `analytics_${String(params.from).slice(0, 10)}_to_${String(params.to).slice(0, 10)}.csv`;
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
};
