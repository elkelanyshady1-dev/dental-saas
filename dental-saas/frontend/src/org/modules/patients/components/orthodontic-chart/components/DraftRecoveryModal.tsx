/**
 * DraftRecoveryModal.tsx — Phase 6: Session Crash Recovery Modal
 *
 * Displayed when a recoverable draft is found on session open.
 * Presents date/time of last save and two CTAs:
 *   1. Restore — hydrates chart from draft.chartState
 *   2. Discard — dismisses and clears the draft query
 *
 * Design: dark glassmorphism modal matching the SnapshotEditor aesthetic.
 * Animated entrance via framer-motion.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Trash2, FileWarning } from 'lucide-react';
import type { VisitDraft } from '../api/visitDraft.api';

interface DraftRecoveryModalProps {
  isOpen:    boolean;
  draft:     VisitDraft | null;
  onRestore: (draft: VisitDraft) => void;
  onDiscard: () => void;
}

function relativeTime(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const m  = Math.floor(ms / 60_000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m} minute${m !== 1 ? 's' : ''} ago`;
  const h = Math.floor(m / 60);
  return `${h} hour${h !== 1 ? 's' : ''} ago`;
}

export default function DraftRecoveryModal({
  isOpen,
  draft,
  onRestore,
  onDiscard,
}: DraftRecoveryModalProps) {
  return (
    <AnimatePresence>
      {isOpen && draft && (
        <motion.div
          key="draft-recovery-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[9000] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
        >
          <motion.div
            key="draft-recovery-card"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{ opacity: 0,   scale: 0.92, y: 16  }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: 'linear-gradient(145deg, #1a2540, #111827)',
              border:     '1px solid rgba(255,255,255,0.10)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-6 py-5"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)' }}
              >
                <FileWarning size={20} style={{ color: '#fbbf24' }} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white leading-none mb-1">
                  Resume Previous Session?
                </h2>
                <p className="text-xs text-slate-400 leading-none">
                  An unsaved draft was found from {relativeTime(draft.savedAt)}
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              <p className="text-[12px] text-slate-300 leading-relaxed mb-5">
                Your last session was auto-saved but not formally ended.
                You can restore the draft to continue where you left off,
                or discard it to start with the latest committed snapshot.
              </p>

              {/* Metadata chips */}
              <div className="flex items-center gap-2 mb-5 flex-wrap">
                <span
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                  style={{ background: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.25)' }}
                >
                  {draft.notes?.length > 0
                    ? `${draft.notes.length} chars of notes`
                    : 'No notes'}
                </span>
                {draft.savedAt && (
                  <span
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                    style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}
                  >
                    Saved: {new Date(draft.savedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  id="btn-restore-draft"
                  onClick={() => onRestore(draft)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                    color:      '#fff',
                    boxShadow:  '0 4px 14px rgba(37,99,235,0.35)',
                  }}
                >
                  <RotateCcw size={14} />
                  Restore Draft
                </button>

                <button
                  id="btn-discard-draft"
                  onClick={onDiscard}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold transition-all"
                  style={{
                    background: 'rgba(239,68,68,0.12)',
                    color:      '#f87171',
                    border:     '1px solid rgba(239,68,68,0.25)',
                  }}
                >
                  <Trash2 size={14} />
                  Discard
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
