import React, { useState } from 'react';
import {
  Activity,
  X,
  ScanLine,
  CheckCircle2,
} from 'lucide-react';
import { PhotoRecord } from '../../types';
import CaseWorkflowModal from './CaseWorkflowModal';

/* ═══════════════════════════════════════════════════════════════
   OPGAnalysisSidebar — OPG radiograph analysis sidebar.
   Phase 3.X UI Refactor: DentalNotationChart removed.
   Replaced with CaseWorkflowModal (REAL editor, same as
   Adjustment Visit) — floating + minimizable.
   ═══════════════════════════════════════════════════════════════ */

export interface OPGAnalysisSidebarProps {
  selectedPhoto:    PhotoRecord;
  records:          PhotoRecord[];
  onUpdateAnalysis: (photoId: string, key: string, value: any) => void;
  onClose:          () => void;
  /** Case context — required to launch the real CaseWorkflowModal */
  caseId?:          string;
  patientId?:       string;
  patientName?:     string;
}

const OPGAnalysisSidebar: React.FC<OPGAnalysisSidebarProps> = ({
  selectedPhoto,
  records,
  onUpdateAnalysis,
  onClose,
  caseId,
  patientId,
  patientName,
}) => {
  // ── CaseWorkflowModal state ───────────────────────────────────────────────
  const [editorOpen,      setEditorOpen]      = useState(false);
  const [editorMinimized, setEditorMinimized] = useState(false);

  const canLaunchEditor = !!caseId && !!patientId;

  return (
    <>
      <div className="w-96 bg-slate-900/40 backdrop-blur-2xl border-l border-white/10 p-8 overflow-y-auto flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Activity className="w-4 h-4" />
            </div>
            <h3 className="text-lg font-bold text-white">OPG Analysis</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-8">
          {/* ── Open Snap Editor button ────────────────────────────────────── */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block">
              Radiographic Chart
            </span>

            {canLaunchEditor ? (
              <button
                id="opg-open-snap-editor-btn"
                onClick={() => {
                  setEditorOpen(true);
                  setEditorMinimized(false);
                }}
                className="w-full flex items-center justify-between px-4 py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-xs hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-purple-900/20"
              >
                <span className="flex items-center gap-2.5">
                  <ScanLine className="w-4 h-4" />
                  Open Full Snap Editor
                </span>
                <span className="text-[9px] font-medium text-white/60">
                  Same as Adjustment Visit
                </span>
              </button>
            ) : (
              <div className="w-full flex items-center justify-center px-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-white/30 text-xs font-medium">
                <ScanLine className="w-4 h-4 mr-2 opacity-40" />
                No case linked — open from Case View
              </div>
            )}
          </div>

          {/* Additional Findings */}
          <div className="space-y-4">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
              Additional Radiographic Findings
            </span>
            <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
              <textarea
                value={selectedPhoto.analysis?.additionalFindings || ''}
                onChange={(e) => onUpdateAnalysis(selectedPhoto.id, 'additionalFindings', e.target.value)}
                placeholder="Describe bone levels, TMJ, or other findings..."
                className="w-full bg-transparent border-none text-xs text-white placeholder:text-white/20 focus:ring-0 resize-none h-32"
              />
            </div>
          </div>
        </div>

        <div className="mt-auto pt-8 border-t border-white/10">
          <button
            onClick={onClose}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-900/20"
          >
            Complete Analysis
          </button>
        </div>
      </div>

      {/* ── CaseWorkflowModal — real editor, fullscreen + minimizable ─────── */}
      {canLaunchEditor && (
        <CaseWorkflowModal
          isOpen={editorOpen}
          isMinimized={editorMinimized}
          onMinimize={() => setEditorMinimized(true)}
          onRestore={() => setEditorMinimized(false)}
          onClose={() => {
            setEditorOpen(false);
            setEditorMinimized(false);
          }}
          caseId={caseId!}
          patientId={patientId!}
          patientName={patientName}
        />
      )}
    </>
  );
};

export default React.memo(OPGAnalysisSidebar);
