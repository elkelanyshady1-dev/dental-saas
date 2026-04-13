/**
 * useClinicalEvents — React Query hook for Clinical Event Engine
 *
 * USAGE:
 *   const { data: events } = useClinicalEvents({ caseId });
 *   const { data: recent } = useRecentClinicalEvents({ severity: "critical" });
 *   const { data: critical } = useCriticalClinicalEvents();
 */

import { useQuery } from "@tanstack/react-query";
import api from "@services/api";

const isValidObjectId = (id?: string): boolean =>
  !!id && /^[a-f\d]{24}$/i.test(id);

export interface ClinicalEvent {
  _id: string;
  organizationId: string;
  caseId: string;
  snapshotId: string | null;
  patientId: string | null;
  type: string;
  severity: "info" | "warning" | "critical";
  payload: Record<string, unknown>;
  metadata: {
    toothId?: number;
    relatedEntityId?: string;
    relatedEntityType?: string;
  };
  createdBy: string;
  createdAt: string;
}

export interface UseClinicalEventsOptions {
  caseId?: string;
  type?: string;
  severity?: "info" | "warning" | "critical";
  limit?: number;
  enabled?: boolean;
}

export const useClinicalEvents = (options: UseClinicalEventsOptions) => {
  const { caseId, type, severity, limit = 100, enabled = true } = options;

  return useQuery({
    queryKey: ["clinicalEvents", caseId, type, severity, limit],
    queryFn: async () => {
      if (!isValidObjectId(caseId)) return [];

      const params = new URLSearchParams();
      if (type) params.append("type", type);
      if (severity) params.append("severity", severity);
      if (limit) params.append("limit", String(limit));

      const res = await api.get(`/org/events/case/${caseId}?${params}`);
      return res.data.data as ClinicalEvent[];
    },
    enabled: enabled && isValidObjectId(caseId),
    staleTime: 30000,
  });
};

export interface UseRecentClinicalEventsOptions {
  types?: string[];
  severity?: "info" | "warning" | "critical";
  limit?: number;
}

export const useRecentClinicalEvents = (options?: UseRecentClinicalEventsOptions) => {
  const { types, severity, limit = 50 } = options || {};

  return useQuery({
    queryKey: ["recentClinicalEvents", types, severity, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (types?.length) params.append("types", types.join(","));
      if (severity) params.append("severity", severity);
      if (limit) params.append("limit", String(limit));

      const res = await api.get(`/org/events/recent?${params}`);
      return res.data.data as ClinicalEvent[];
    },
    staleTime: 60000,
  });
};

export const useCriticalClinicalEvents = (limit = 20) => {
  return useQuery({
    queryKey: ["criticalClinicalEvents", limit],
    queryFn: async () => {
      const res = await api.get(`/org/events/critical?limit=${limit}`);
      return res.data.data as ClinicalEvent[];
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });
};
