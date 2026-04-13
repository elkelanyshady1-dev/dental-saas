/**
 * safeguard.api.ts — Frontend API client for Clinical Safeguard endpoints (Phase 9)
 *
 * ENDPOINTS:
 *   POST /safeguard/verify-consistency/:caseId   — UI ↔ DB state comparison
 *   GET  /safeguard/validate-state/:caseId       — Server-side invariant check
 *   POST /safeguard/validate-event/:caseId       — Pre-commit event validation
 *   GET  /safeguard/replay-parity/:caseId        — Snapshot ↔ replay parity check
 *
 * USAGE:
 *   Used by safeguardLayer.ts for consistency checks and by
 *   useChartSafeguard hook for periodic health checks.
 *
 * @per-org-safe — all requests go through org-protected endpoints
 */

import api from '@/services/api';
import type { ChartState } from '../types';

const BASE = '/org/safeguard';

export interface ConsistencyResult {
  consistent: boolean;
  differences: string[];
  serverState?: ChartState;
}

export interface StateValidationResult {
  valid: boolean;
  violations: Array<{
    code: string;
    message: string;
    severity: 'critical' | 'warning';
  }>;
  entityCounts: Record<string, number>;
}

export interface EventValidationResult {
  valid: boolean;
  error?: string;
}

export interface ReplayParityResult {
  parity: boolean;
  differences: string[];
}

/**
 * Compare the frontend chart state against the server-rebuilt state.
 * Used after commit to detect UI ↔ DB drift.
 */
export async function verifyConsistency(
  caseId: string,
  chartState: ChartState,
): Promise<ConsistencyResult> {
  const { data } = await api.post(`${BASE}/verify-consistency/${caseId}`, { chartState });
  return data.data;
}

/**
 * Run server-side invariant checks on the current state.
 * Server rebuilds from events and validates.
 */
export async function validateServerState(
  caseId: string,
): Promise<StateValidationResult> {
  const { data } = await api.get(`${BASE}/validate-state/${caseId}`);
  return data.data;
}

/**
 * Pre-validate a clinical event against server state BEFORE committing.
 * Backend gatekeeper — catches stale frontend state issues.
 */
export async function validateEventOnServer(
  caseId: string,
  event: { type: string; payload: Record<string, unknown>; eventId?: string },
): Promise<EventValidationResult> {
  const { data } = await api.post(`${BASE}/validate-event/${caseId}`, { event });
  return data.data;
}

/**
 * Check snapshot ↔ replay parity.
 * Detects stale or corrupted snapshots.
 */
export async function checkReplayParity(
  caseId: string,
): Promise<ReplayParityResult> {
  const { data } = await api.get(`${BASE}/replay-parity/${caseId}`);
  return data.data;
}

/**
 * Fetch the server-rebuilt chart state for a case.
 * Used by the consistency checker as the DB state source.
 *
 * Delegates to the existing /org/clinical-state/:caseId endpoint
 * which rebuilds state from events (snapshot + replay).
 * This function wraps the pattern for safeguardLayer's fetchDbState callback.
 */
export async function fetchServerChartState(
  caseId: string,
): Promise<ChartState> {
  const { data } = await api.get(`/org/clinical-state/${caseId}`);
  return (data.data?.derivedState ?? data.data?.chartState ?? data.data) as ChartState;
}
