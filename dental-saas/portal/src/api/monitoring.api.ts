/**
 * monitoring.api.ts
 * Patient Portal — Aligner Progress, Photos, Monitoring Sessions
 */

import portalApi from './portalApi';
import type { ApiResponse, AlignerProgress, PatientPhoto, MonitoringSession } from '@/types/portal.types';

export const monitoringApi = {
  /** GET /portal/progress?caseId=... */
  getProgress: async (caseId?: string) => {
    const params = caseId ? { caseId } : {};
    const res = await portalApi.get<ApiResponse<AlignerProgress[]>>('/portal/progress', { params });
    return res.data;
  },

  /** PATCH /portal/progress/:id/activate */
  activateStage: async (progressId: string) => {
    const res = await portalApi.patch<ApiResponse<AlignerProgress>>(`/portal/progress/${progressId}/activate`);
    return res.data;
  },

  /** PATCH /portal/progress/:id/complete */
  completeStage: async (progressId: string, data: { patientPainLevel?: number; patientWearHours?: number }) => {
    const res = await portalApi.patch<ApiResponse<AlignerProgress>>(`/portal/progress/${progressId}/complete`, data);
    return res.data;
  },

  /** POST /portal/photos */
  uploadPhoto: async (data: {
    caseId: string;
    fileKey: string;
    photoType: string;
    stageNumber: number;
    monitoringSessionId?: string;
    originalFileName?: string;
    fileSize?: number;
    mimeType?: string;
  }) => {
    const res = await portalApi.post<ApiResponse<{ photo: PatientPhoto; jobId: string }>>('/portal/photos', data);
    return res.data;
  },

  /** POST /portal/monitoring — Submit monitoring session */
  submitMonitoringSession: async (data: {
    caseId: string;
    stageNumber: number;
    patientNote?: string;
  }) => {
    const res = await portalApi.post<ApiResponse<MonitoringSession>>('/portal/monitoring', data);
    return res.data;
  },
};
