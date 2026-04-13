import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Minus, ScanLine } from 'lucide-react';
import { Appointment } from '../../types';
import SnapshotEditor from '../SnapshotEditor';

/* ═══════════════════════════════════════════════════════════════
   CaseWorkflowModal
   ─────────────────────────────────────────────────────────────
   Wraps the REAL SnapshotEditor (identical to Adjustment Visit)
   in a modal launched from the OPG / Occlusal analysis sidebars.

   SnapshotEditor is already fullscreen (fixed inset-0 z-[200]).
   This wrapper simply manages open/minimize state and constructs
   a synthetic Appointment object so SnapshotEditor boots cleanly.

   Minimize → floating "Snap Editor" pill
   Restore  → remounts SnapshotEditor from pill click
═══════════════════════════════════════════════════════════════ */

export interface CaseWorkflowModalProps {
  isOpen:       boolean;
  isMinimized:  boolean;
  onMinimize:   () => void;
  onRestore:    () => void;
  onClose:      () => void;
  caseId:       string;
  patientId:    string;
  patientName?: string;
}

const CaseWorkflowModal: React.FC<CaseWorkflowModalProps> = ({
  isOpen,
  isMinimized,
  onMinimize,
  onRestore,
  onClose,
  caseId,
  patientId,
  patientName,
}) => {
  // Construct a synthetic Appointment so SnapshotEditor can boot.
  // The snapshot editor only uses appointment.caseId, appointment.id,
  // and display fields (date, type, doctor) for the header.
  const syntheticAppointment: Appointment = {
    id:        `snap-session-${caseId.slice(-6)}`,
    patientId,
    caseId,
    date:      new Date().toISOString().split('T')[0],
    time:      new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    type:      'Pretreatment Analysis',
    doctor:    patientName ?? 'Dr.',
    status:    'in-progress',
  };

  if (!isOpen) return null;

  return (
    <>
      {/* ── Minimized Floating Pill ─────────────────────────────────────── */}
      <AnimatePresence>
        {isMinimized && (
          <motion.div
            key="snap-pill"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{    opacity: 0, y: 20, scale: 0.9  }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="fixed bottom-6 right-6 z-[600]"
          >
            <button
              id="case-workflow-modal-restore-btn"
              onClick={onRestore}
              className="group flex items-center gap-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white pl-3 pr-5 py-3 rounded-2xl shadow-xl shadow-purple-900/30 hover:shadow-purple-900/50 hover:scale-105 active:scale-95 transition-all"
            >
              <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
                <ScanLine className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-xs font-bold leading-none">Snap Editor</span>
                <span className="text-[9px] font-medium text-white/60 mt-0.5">Click to restore</span>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SnapshotEditor (fullscreen, identical to Adjustment Visit) ──── */}
      {/*
          SnapshotEditor renders as `fixed inset-0 z-[200]`.
          We raise it to z-[500] via a wrapper div so it sits
          above the photo viewer (z-[200]) and analysis sidebar.
          We hide it (not unmount) when minimized to preserve state.
      */}
      <div
        style={{ zIndex: isMinimized ? -1 : 500, position: 'fixed', inset: 0 }}
        aria-hidden={isMinimized}
      >
        <SnapshotEditor
          appointment={syntheticAppointment}
          caseId={caseId}
          onBack={onClose}
          onSave={(_snapshot) => {
            /* Snapshot saved — stay open so user can keep editing */
          }}
        />
      </div>

      {/* Minimize overlay button — appears in top-right corner of SnapshotEditor */}
      {!isMinimized && (
        <div className="fixed top-3 right-20 z-[600]">
          <button
            onClick={onMinimize}
            title="Minimize editor"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 backdrop-blur-sm border border-white/10 rounded-xl text-white/60 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors text-[11px] font-bold"
          >
            <Minus className="w-3.5 h-3.5" />
            Minimize
          </button>
        </div>
      )}
    </>
  );
};

export default CaseWorkflowModal;
