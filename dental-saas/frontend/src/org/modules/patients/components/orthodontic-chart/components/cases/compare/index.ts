/**
 * Compare Module — Barrel Export
 * ===============================
 * Pre vs Post comparison engine for orthodontic records.
 */

export { default as CompareEngine } from './CompareEngine';
export { default as CompareSlider } from './CompareSlider';
export { default as CompareGrid } from './CompareGrid';
export { default as DiffOverlay } from './DiffOverlay';
export { matchRecords, groupPairsByType, TYPE_LABELS } from './types';
export type { MatchedPair, CompareViewMode, CompareConfig } from './types';
