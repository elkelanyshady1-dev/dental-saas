/**
 * messaging.api.ts
 * Patient Portal — Patient-Doctor Messaging
 *
 * GET uses /portal/messages/patient (patientProtect route)
 * POST uses /portal/messages (patientProtect route)
 */

import portalApi from './portalApi';
import type { ApiResponse, PatientMessage } from '@/types/portal.types';

export const messagingApi = {
  /** POST /portal/messages — Send a message */
  sendMessage: async (data: {
    message: string;
    caseId?: string;
    messageType?: 'text' | 'image';
    attachments?: { fileKey: string; originalFileName: string; mimeType: string; fileSize: number }[];
  }) => {
    const res = await portalApi.post<ApiResponse<PatientMessage>>('/portal/messages', data);
    return res.data;
  },

  /** GET /portal/messages/patient — List patient messages (patientProtect) */
  getMessages: async (params?: { caseId?: string; page?: number; limit?: number }) => {
    const res = await portalApi.get<ApiResponse<PatientMessage[]>>('/portal/messages/patient', { params });
    return res.data;
  },

  /** Mark messages as read */
  markRead: async () => {
    const res = await portalApi.patch<ApiResponse<{ modified: number }>>('/portal/messages/read');
    return res.data;
  },
};
