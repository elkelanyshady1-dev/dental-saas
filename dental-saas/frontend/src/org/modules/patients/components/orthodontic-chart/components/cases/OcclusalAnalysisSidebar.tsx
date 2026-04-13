import React, { useState } from 'react';
import {
  Activity, X, FlipVertical,
  ScanLine, CheckCircle2,
} from 'lucide-react';
import { PhotoRecord } from '../../types';
import CaseWorkflowModal from './CaseWorkflowModal';

/* ═══════════════════════════════════════════════════════════════
   OcclusalAnalysisSidebar — Occlusal analysis sidebar.
   Phase 3.X UI Refactor: DentalNotationChart removed.
   Replaced with CaseWorkflowModal (REAL editor, same as
   Adjustment Visit) — floating + minimizable.
   ═══════════════════════════════════════════════════════════════ */

export interface OcclusalAnalysisSidebarProps {
  selectedPhoto:       PhotoRecord;
  records:             PhotoRecord[];
  onUpdateAnalysis:    (photoId: string, key: string, value: any) => void;
  onClose:             () => void;
  occlusalViewMode:    string;
  setOcclusalViewMode: (mode: any) => void;
  onSelectPhoto:       (photo: PhotoRecord) => void;
  /** Case context — required to launch the real CaseWorkflowModal */
  caseId?:             string;
  patientId?:          string;
  patientName?:        string;
}

const OcclusalAnalysisSidebar: React.FC<OcclusalAnalysisSidebarProps> = ({
  selectedPhoto,
  records,
  onUpdateAnalysis,
  onClose,
  occlusalViewMode,
  setOcclusalViewMode,
  onSelectPhoto,
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
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
              <Activity className="w-4 h-4" />
            </div>
            <h3 className="text-lg font-bold text-white">Occlusal Analysis</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const otherId = selectedPhoto.id === 'occlusal-upper' ? 'occlusal-lower' : 'occlusal-upper';
                const otherRecord = records.find(r => r.id === otherId);
                if (otherRecord) onSelectPhoto(otherRecord);
              }}
              className="p-2 hover:bg-white/10 rounded-lg text-purple-400 transition-all border border-purple-500/20"
              title={`Switch to ${selectedPhoto.id === 'occlusal-upper' ? 'Lower' : 'Upper'} Arch`}
            >
              <FlipVertical className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="space-y-8">
          {/* View Mode Toggle */}
          <div className="space-y-4">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest text-center block">
              View Mode
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'upper', label: 'Upper' },
                { id: 'both',  label: 'Both'  },
                { id: 'lower', label: 'Lower' },
              ].map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setOcclusalViewMode(mode.id as any)}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    occlusalViewMode === mode.id
                      ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/20'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  <span className="text-xs font-bold">{mode.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 1. Arch Form */}
          <div className="space-y-4">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
              1. Arch Form
            </span>
            <div className="grid grid-cols-3 gap-2">
              {['Ovoid', 'Square', 'Tapered'].map(form => (
                <button
                  key={form}
                  onClick={() => onUpdateAnalysis(selectedPhoto.id, 'archForm', form)}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    selectedPhoto.analysis?.archForm === form
                      ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/20'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  <span className="text-xs font-bold">{form}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Gingival Health */}
          <div className="space-y-4">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
              2. Gingival Health
            </span>
            <div className="grid grid-cols-2 gap-2">
              {['Healthy', 'Inflamed', 'Calculus', 'Recession'].map(status => (
                <button
                  key={status}
                  onClick={() => onUpdateAnalysis(selectedPhoto.id, 'gingivalHealth', status)}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    selectedPhoto.analysis?.gingivalHealth === status
                      ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/20'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  <span className="text-xs font-bold">{status}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Open Full Snap Editor (replaces embedded chart) ─────────────── */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest block">
              Dental Chart
            </span>

            {canLaunchEditor ? (
              <button
                id="occlusal-open-snap-editor-btn"
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
        </div>

        <div className="mt-auto pt-8 border-t border-white/10">
          <button
            onClick={onClose}
            className="w-full py-4 bg-purple-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-purple-700 transition-all shadow-lg shadow-purple-900/20"
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

export default React.memo(OcclusalAnalysisSidebar);
