/**
 * VersionHistory.tsx — Ordered list of plan versions for a case.
 *
 * Each row shows version number, stage chip, phase (PRE/MID), active/approved
 * markers, createdAt, and an optional "Compare" button. Click selects a version
 * for the viewer pane.
 */

import React from 'react';
import { CheckCircle2, Circle, History, GitBranch, Eye, Diff, Loader2 } from 'lucide-react';
import { useTreatmentPlanVersions } from '../../../hooks/useTreatmentPlanVersions';
import type { TreatmentPlanVersionListItem } from '../../../api/treatmentPlanVersion.api';

interface VersionHistoryProps {
  caseId: string;
  selectedVersionId: string | null;
  onSelect: (versionId: string) => void;
  onCompare?: (fromId: string, toId: string) => void;
}

const STAGE_CLASS: Record<string, string> = {
  DRAFT:    'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REVISION: 'bg-blue-50 text-blue-700 border-blue-200',
};

const PHASE_CLASS: Record<string, string> = {
  PRE: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  MID: 'bg-purple-50 text-purple-700 border-purple-200',
};

const VersionHistory: React.FC<VersionHistoryProps> = ({ caseId, selectedVersionId, onSelect, onCompare }) => {
  const { data: versions, isLoading } = useTreatmentPlanVersions(caseId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <span className="ml-2 text-xs text-slate-500">Loading versions…</span>
      </div>
    );
  }

  const rows = versions ?? [];

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-[24px] border border-slate-200 p-8 text-center">
        <History className="w-8 h-8 mx-auto text-slate-300 mb-2" />
        <p className="text-xs text-slate-500">No plan versions yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center gap-2">
        <History className="w-4 h-4 text-slate-600" />
        <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-widest">Version History</h4>
        <span className="ml-auto text-[10px] text-slate-400">{rows.length} version{rows.length > 1 ? 's' : ''}</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((v) => {
          const selected = v.id === selectedVersionId;
          return (
            <li
              key={v.id}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                selected ? 'bg-blue-50/50' : 'hover:bg-slate-50'
              }`}
              onClick={() => onSelect(v.id)}
            >
              <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 font-bold text-xs">
                v{v.version}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${STAGE_CLASS[v.stage ?? ''] ?? ''}`}>
                    {v.stage}
                  </span>
                  {v.recordSetType && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${PHASE_CLASS[v.recordSetType] ?? ''}`}>
                      {v.recordSetType}
                    </span>
                  )}
                  {v.isActive && (
                    <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-600">
                      <Circle className="w-2 h-2 fill-emerald-500 stroke-emerald-500" /> ACTIVE
                    </span>
                  )}
                  {v.isApproved && (
                    <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-700">
                      <CheckCircle2 className="w-2.5 h-2.5" /> APPROVED
                    </span>
                  )}
                </div>
                {v.changeSummary && (
                  <p className="text-[11px] text-slate-600 truncate">{v.changeSummary}</p>
                )}
                {v.parentVersionId && (
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                    <GitBranch className="w-2.5 h-2.5" />
                    <span>from v{rows.find((r) => r.id === v.parentVersionId)?.version ?? '?'}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {selectedVersionId && selectedVersionId !== v.id && onCompare && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCompare(selectedVersionId, v.id);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                    title={`Compare v${rows.find((r) => r.id === selectedVersionId)?.version} → v${v.version}`}
                  >
                    <Diff className="w-3 h-3" />
                    Compare
                  </button>
                )}
                {selected && <Eye className="w-3.5 h-3.5 text-blue-500" />}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default VersionHistory;
export type { TreatmentPlanVersionListItem };
