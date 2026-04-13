/**
 * NoActiveVisitScreen.tsx — Phase 2: Visit Gate UI
 *
 * Displayed in SnapshotEditor when no active visit session exists.
 * Prompts the clinician to start a visit before making clinical changes.
 * 
 * State machine:
 *   idle      → user sees the unlock card
 *   starting  → loading spinner (API call in flight)
 *   error     → error message displayed, retry available
 */

import React, { useState } from 'react';
import { Calendar, Clock, ShieldCheck, AlertTriangle, Loader2, Play } from 'lucide-react';
import { type ActiveVisit } from '../api/visitSession.api';

interface NoActiveVisitScreenProps {
  caseId: string;
  onVisitStarted: (visit: ActiveVisit) => void;
  onStartVisit: () => Promise<ActiveVisit>;
  /** Previous visit info for context */
  lastVisitDate?: string | null;
  visitCount?: number;
}

export const NoActiveVisitScreen: React.FC<NoActiveVisitScreenProps> = ({
  caseId,
  onVisitStarted,
  onStartVisit,
  lastVisitDate,
  visitCount = 0,
}) => {
  const [status, setStatus] = useState<'idle' | 'starting' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleStart = async () => {
    setStatus('starting');
    setErrorMsg(null);

    try {
      const visit = await onStartVisit();
      onVisitStarted(visit);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.code === 'VISIT_ALREADY_ACTIVE'
          ? 'A visit session was already opened (possibly in another tab). Refresh to continue.'
          : (err?.response?.data?.error?.message ?? err.message ?? 'Failed to start visit');
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  return (
    <div
      id="no-active-visit-screen"
      className="no-visit-container"
      role="status"
      aria-label="No active visit session"
    >
      {/* ── Icon banner ─────────────────────────────────────────────────── */}
      <div className="no-visit-icon-wrap">
        <ShieldCheck className="no-visit-icon" size={48} />
      </div>

      {/* ── Heading ──────────────────────────────────────────────────────── */}
      <h2 className="no-visit-title">No Active Visit Session</h2>
      <p className="no-visit-subtitle">
        Clinical mutations are locked until a visit session is started.
        <br />
        All charts, events, and snapshots will be linked to this session.
      </p>

      {/* ── Context meta ─────────────────────────────────────────────────── */}
      <div className="no-visit-meta">
        {visitCount > 0 && (
          <span className="no-visit-meta-chip">
            <Clock size={14} />
            Visit #{visitCount + 1}
          </span>
        )}
        {lastVisitDate && (
          <span className="no-visit-meta-chip">
            <Calendar size={14} />
            Last visit: {new Date(lastVisitDate).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {status === 'error' && errorMsg && (
        <div className="no-visit-error" role="alert">
          <AlertTriangle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <button
        id="btn-start-visit"
        className="no-visit-cta"
        onClick={handleStart}
        disabled={status === 'starting'}
        aria-busy={status === 'starting'}
      >
        {status === 'starting' ? (
          <>
            <Loader2 size={18} className="spin" />
            Starting visit…
          </>
        ) : (
          <>
            <Play size={18} />
            Start Clinical Visit
          </>
        )}
      </button>

      {/* ── Safety note ──────────────────────────────────────────────────── */}
      <p className="no-visit-note">
        You can cancel the visit without saving a snapshot if needed.
      </p>
    </div>
  );
};
