/**
 * useRecordSets.ts — React Query hook for fetching workflow recordSets
 * 
 * Extracts OPG/panoramic images from orthodontic case workflow data.
 * Used by SnapshotEditor to populate PrescriptionOPGModal.
 * 
 * SERVER STATE LAW:
 *   ✅ useQuery for reads
 *   ❌ useState(apiData) — FORBIDDEN
 * 
 * IMAGING TYPE FILTERING:
 *   - OPG: Panoramic radiographs only (type = 'panoramic' | 'opg')
 *   - CEPH: Cephalometric radiographs (excluded from OPG list)
 *   - CBCT: Cone beam CT (excluded from OPG list)
 *   - INTRAORAL: Intraoral photos (excluded from OPG list)
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import api from '@/services/api';

export interface WorkflowRecord {
  id: string;
  type: string;
  label?: string;
  url: string | null;
  uploadedAt?: string;
}

export interface WorkflowRecordSet {
  id: string;
  name?: string;
  type?: string;
  records: WorkflowRecord[];
}

export interface OPGRecord {
  _id: string;
  name: string;
  date: string;
  fileUrl: string;
  /** Whether this is the primary/latest OPG */
  isPrimary?: boolean;
}

/**
 * Valid OPG imaging types.
 * Only panoramic radiographs are included.
 * CEPH (cephalometric), CBCT, and intraoral photos are EXCLUDED.
 */
const OPG_TYPES: string[] = ['panoramic', 'opg'];

/**
 * Types that should be EXCLUDED (not OPG despite being X-rays)
 */
const EXCLUDED_TYPES: string[] = ['ceph', 'cephalometric', 'cbct', 'intraoral', 'photo', 'portrait', 'smile'];

const isValidObjectId = (id: string | undefined): id is string =>
  typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

/**
 * Determines if a record is a valid OPG image.
 * Excludes CEPH, CBCT, and other non-panoramic imaging types.
 */
function isOPGRecord(record: WorkflowRecord): boolean {
  if (!record.url) return false;
  
  const typeLower = (record.type || '').toLowerCase().trim();
  
  // Explicitly excluded types (CEPH, CBCT, intraoral, etc.)
  if (EXCLUDED_TYPES.some(excluded => typeLower.includes(excluded))) {
    return false;
  }
  
  // Must be explicitly panoramic or OPG
  return OPG_TYPES.some(opg => typeLower === opg || typeLower.includes(opg));
}

export const useRecordSets = (caseId: string | undefined) => {
  return useQuery<WorkflowRecordSet[]>({
    queryKey: ['workflow', 'recordSets', caseId],
    queryFn: async () => {
      if (!caseId) return [];
      const res = await api.get(`/org/orthodontic-cases/${caseId}/workflow`);
      return res.data?.data?.workflowData?.recordSets || res.data?.recordSets || [];
    },
    enabled: isValidObjectId(caseId),
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
};

export const useOPGRecords = (caseId: string | undefined) => {
  const { data: recordSets = [], ...rest } = useRecordSets(caseId);

  // Memoize derived OPG data so downstream useEffects don't re-fire on every render
  const { opgRecords, primaryOpgUrl } = useMemo(() => {
    const opg: OPGRecord[] = [];

    if (recordSets.length > 0) {
      const allRecords = recordSets.flatMap(rs => rs.records || []);
      for (const r of allRecords) {
        if (!isOPGRecord(r)) continue;
        opg.push({
          _id: r.id,
          name: r.label || `Panoramic X-ray`,
          date: r.uploadedAt || new Date().toISOString(),
          fileUrl: r.url!,
          isPrimary: false,
        });
      }
    }

    // Sort by date (newest first) and mark the first as primary
    opg.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (opg.length > 0) opg[0].isPrimary = true;

    return {
      opgRecords: opg,
      primaryOpgUrl: opg.length > 0 ? opg[0].fileUrl : undefined,
    };
  }, [recordSets]);

  return {
    recordSets,
    opgRecords,
    primaryOpgUrl,
    opgCount: opgRecords.length,
    ...rest,
  };
};