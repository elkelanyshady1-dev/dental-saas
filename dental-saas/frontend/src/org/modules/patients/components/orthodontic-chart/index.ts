/**
 * index.ts — Orthodontic Chart Module Barrel Export
 * ==================================================
 * Lazy-loaded entry point for the orthodontic chart editor.
 * 
 * Usage in parent component:
 *   const LazySnapshotEditor = React.lazy(() => import('./orthodontic-chart'));
 */

export { default } from './components/SnapshotEditor';
export type { Appointment, Snapshot } from './types';
