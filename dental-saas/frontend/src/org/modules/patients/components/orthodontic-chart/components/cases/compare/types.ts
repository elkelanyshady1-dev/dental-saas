/**
 * Compare Engine Types
 * ====================
 * Types for the Pre vs Post comparison system.
 * Matches records by their stable `id` field across record sets.
 */

import { PhotoRecord, RecordSet } from '../../../types';

/** A matched pair of photos from two record sets */
export interface MatchedPair {
  id: string;            // Shared record ID (e.g. 'profile-rest')
  label: string;         // Display label (e.g. 'Profile rest')
  type: string;          // Photo type (e.g. 'extraoral')
  left: PhotoRecord;     // From the "before" record set
  right: PhotoRecord;    // From the "after" record set
  aspectRatio: string;   // Shared aspect ratio
  orientation: 'portrait' | 'landscape';
}

/** Comparison view modes */
export type CompareViewMode = 'slider' | 'sideBySide' | 'overlay' | 'diff';

/** Comparison config passed to the engine */
export interface CompareConfig {
  caseId: string;
  leftSet: RecordSet;
  rightSet: RecordSet;
}

/** Match records by their stable ID across two record sets */
export function matchRecords(left: RecordSet, right: RecordSet): MatchedPair[] {
  const pairs: MatchedPair[] = [];
  
  for (const leftRecord of left.records) {
    // Only match records that have valid URLs on BOTH sides
    if (!leftRecord.url || typeof leftRecord.url !== 'string' || leftRecord.url.trim() === '') continue;
    
    const rightRecord = right.records.find(r => r.id === leftRecord.id);
    if (!rightRecord?.url || typeof rightRecord.url !== 'string' || rightRecord.url.trim() === '') continue;
    
    pairs.push({
      id: leftRecord.id,
      label: leftRecord.label || leftRecord.id,
      type: leftRecord.type,
      left: leftRecord,
      right: rightRecord,
      aspectRatio: leftRecord.aspectRatio || '4:3',
      orientation: leftRecord.orientation || 'landscape',
    });
  }
  
  return pairs;
}

/** Group matched pairs by photo type for organized display */
export function groupPairsByType(pairs: MatchedPair[]): Record<string, MatchedPair[]> {
  const groups: Record<string, MatchedPair[]> = {};
  for (const pair of pairs) {
    const key = pair.type || 'other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(pair);
  }
  return groups;
}

/** Human-readable label for photo types */
export const TYPE_LABELS: Record<string, string> = {
  extraoral: 'Extraoral Photos',
  intraoral: 'Intraoral Photos',
  occlusal: 'Occlusal Views',
  xray: 'X-Rays & Ceph',
  ceph: 'Cephalometric',
  panoramic: 'Panoramic',
  other: 'Other',
};
