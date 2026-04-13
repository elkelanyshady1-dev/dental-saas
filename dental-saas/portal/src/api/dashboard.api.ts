/**
 * dashboard.api.ts
 * Patient Portal — Dashboard, Appointments, Invoices, Medical History
 *
 * All endpoints require patientProtect (JWT attached by portalApi).
 */

import portalApi from './portalApi';
import type { ApiResponse, DashboardData, Appointment, ClinicalData } from '@/types/portal.types';

export const dashboardApi = {
  /** GET /patient/portal/dashboard */
  getDashboard: async () => {
    const res = await portalApi.get<ApiResponse<DashboardData>>('/patient/portal/dashboard');
    return res.data;
  },

  /** GET /patient/portal/appointments */
  getAppointments: async () => {
    const res = await portalApi.get<ApiResponse<Appointment[]>>('/patient/portal/appointments');
    return res.data;
  },

  /** GET /patient/portal/invoices */
  getInvoices: async () => {
    const res = await portalApi.get<ApiResponse<Record<string, unknown>>>('/patient/portal/invoices');
    return res.data;
  },

  /** GET /patient/portal/medical-history */
  getMedicalHistory: async () => {
    const res = await portalApi.get<ApiResponse<ClinicalData>>('/patient/portal/medical-history');
    return res.data;
  },
};
