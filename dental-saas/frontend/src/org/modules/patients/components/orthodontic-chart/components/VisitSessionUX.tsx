/**
 * VisitSessionUX.tsx — Phase 6B: Save Indicator + Presence Banner
 *
 * COMPONENTS:
 *   SaveIndicator    — Shows save status (idle/saving/saved/error) in the header
 *   VisitPresenceBanner — Shows when another doctor is viewing the same visit
 *
 * DESIGN: Matches SnapshotEditor's dark clinical aesthetic.
 *   No external dependencies beyond lucide-react (already used in the editor).
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Loader2, WifiOff, Save, Eye } from 'lucide-react';
import type { SaveStatus } from '../hooks/useSmartAutoSave';

// ─── SaveIndicator ──────────────────────────────────────────────────────────────

interface SaveIndicatorProps {
  status: SaveStatus;
}

export function SaveIndicator({ status }: SaveIndicatorProps) {
  if (status === 'idle') return null;

  const config = {
    saving: {
      icon: <Loader2 size={12} className="animate-spin" />,
      label: 'Saving…',
      color: '#94a3b8',  // slate-400
      bg:    'rgba(148,163,184,0.10)',
      border: 'rgba(148,163,184,0.20)',
    },
    saved: {
      icon: <CheckCircle size={12} />,
      label: 'Saved',
      color: '#34d399',  // emerald-400
      bg:    'rgba(52,211,153,0.10)',
      border: 'rgba(52,211,153,0.25)',
    },
    error: {
      icon: <WifiOff size={12} />,
      label: 'Save failed',
      color: '#f87171',  // red-400
      bg:    'rgba(248,113,113,0.10)',
      border: 'rgba(248,113,113,0.25)',
    },
  } as const;

  const c = config[status];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0, scale: 0.90 }}
        animate={{ opacity: 1, scale: 1    }}
        exit={{    opacity: 0, scale: 0.90 }}
        transition={{ duration: 0.15 }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold select-none"
        style={{
          color:      c.color,
          background: c.bg,
          border:     `1px solid ${c.border}`,
        }}
        title={`Auto-save: ${c.label}`}
      >
        {c.icon}
        <span>{c.label}</span>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── VisitPresenceBanner ────────────────────────────────────────────────────────

interface VisitPresenceBannerProps {
  /** Name of the other doctor currently in this visit */
  otherDoctorName: string | null;
  /** Dismiss callback */
  onDismiss?: () => void;
}

/**
 * Shown when another doctor opens the same active visit.
 * Non-blocking — positioned below the header as a soft warning strip.
 */
export function VisitPresenceBanner({
  otherDoctorName,
  onDismiss,
}: VisitPresenceBannerProps) {
  return (
    <AnimatePresence>
      {otherDoctorName && (
        <motion.div
          key="presence-banner"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0  }}
          exit={{    opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="flex items-center justify-between gap-3 px-4 py-2.5"
          style={{
            background:   'linear-gradient(90deg, rgba(251,191,36,0.12), rgba(245,158,11,0.08))',
            borderBottom: '1px solid rgba(251,191,36,0.25)',
          }}
        >
          <div className="flex items-center gap-2">
            <Eye size={14} style={{ color: '#fbbf24' }} className="flex-shrink-0" />
            <p className="text-[11px] font-semibold text-amber-300 leading-none">
              <span className="font-bold text-amber-200">{otherDoctorName}</span>
              {' '}is also viewing this visit
            </p>
          </div>

          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-[10px] text-amber-400 hover:text-amber-200 font-semibold transition-colors flex-shrink-0"
            >
              Dismiss
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
