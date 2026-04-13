import axios from 'axios';
import api from '@/services/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

// ─── Types ──────────────────────────────────────────────────────

export interface SharePermissions {
  canComment: boolean;
  canDownload: boolean;
  canViewAnalysis: boolean;
}

export interface CreateShareOptions {
  type: 'case' | 'records';
  recordIds?: string[];
  recordSetIds?: string[]; // Share at record set level (PRE/MID/POST)
  expiresIn: string;
  permissions: SharePermissions;
  hidePatientName: boolean;
}

export interface Collaborator {
  name: string;
  role: 'doctor' | 'lab' | 'patient';
  joinedAt: string;
}

export interface SharedCaseData {
  patient: { name: string; age: number | null };
  caseType: string;
  malocclusionClass: string;
  status: string;
  type: 'case' | 'records';
  recordIds: string[];
  recordSetIds?: string[];
  snapshotId?: string;
  snapshotVersion?: number;
  workflowData: any;
  permissions: SharePermissions;
  hidePatientName: boolean;
  expiresAt: string;
  collaborators: Collaborator[];
}

export interface SharedComment {
  id: string;
  authorName: string;
  role: 'doctor' | 'lab' | 'patient';
  text?: string;
  audioUrl?: string;
  isHighlighted?: boolean;
  createdAt: string;
}

// ─── Org-Auth Endpoints (uses centralized api with auto-refresh) ─

export const createShareLink = async (
  caseId: string,
  options: CreateShareOptions,
  _token?: string // Kept for backward compat — centralized api handles auth automatically
) => {
  const res = await api.post(
    `/org/orthodontic-cases/${caseId}/share`,
    options
  );
  return res.data;
};

// ─── Public Endpoints (no auth, token-gated) ────────────────────

export const getSharedCase = async (shareToken: string) => {
  const res = await axios.get(`${API_BASE}/shared/${shareToken}`);
  return res.data;
};

export const getSharedComments = async (shareToken: string) => {
  const res = await axios.get(`${API_BASE}/shared/${shareToken}/comments`);
  return res.data;
};

export const addSharedComment = async (
  shareToken: string,
  comment: {
    authorName: string;
    role: 'doctor' | 'lab' | 'patient';
    text?: string;
    audioUrl?: string;
  }
) => {
  const res = await axios.post(`${API_BASE}/shared/${shareToken}/comments`, comment);
  return res.data;
};

export const joinSharedCase = async (
  shareToken: string,
  collaborator: { name: string; email?: string; role?: 'doctor' | 'lab' | 'patient' }
) => {
  const res = await axios.post(`${API_BASE}/shared/${shareToken}/join`, collaborator);
  return res.data;
};
