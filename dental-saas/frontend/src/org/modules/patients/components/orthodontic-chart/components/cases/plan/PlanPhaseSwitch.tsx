/**
 * PlanPhaseSwitch.tsx — Routes the treatment-plan surface per record-set type.
 *
 *   PRE   (no approved): TreatmentPlanEditor (drafts list + form + Approve)
 *   PRE   (approved)   : TreatmentPlanViewer (locked) + VersionHistory
 *   MID                : VersionHistory + Viewer + "Create Revision" button
 *   POST / CUSTOM      : VersionHistory + Viewer (no writes)
 */

import React, { useEffect, useState } from 'react';
import { GitBranch, AlertTriangle } from 'lucide-react';
import type { RecordSet } from '../../../types';
import TreatmentPlanEditor from './TreatmentPlanEditor';
import TreatmentPlanViewer from './TreatmentPlanViewer';
import VersionHistory from './VersionHistory';
import NewVersionModal from './NewVersionModal';
import CompareModal from './CompareModal';
import {
  useApprovedPlanVersion,
  useActivePlanVersion,
  useTreatmentPlanVersions,
} from '../../../hooks/useTreatmentPlanVersions';

type RecordSetType = 'PRE' | 'MID' | 'POST' | 'CUSTOM';

interface PlanPhaseSwitchProps {
  caseId: string | null;
  recordSetId: string | null;
  recordSetType: RecordSetType;
  data: RecordSet;
  onOpenPhotoViewer: () => void;
}

const PlanPhaseSwitch: React.FC<PlanPhaseSwitchProps> = ({ caseId, recordSetId, recordSetType, data, onOpenPhotoViewer }) => {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [compareFromId, setCompareFromId] = useState<string | null>(null);
  const [compareToId, setCompareToId]     = useState<string | null>(null);

  const { data: approved } = useApprovedPlanVersion(caseId ?? undefined);
  const { data: active }   = useActivePlanVersion(caseId ?? undefined);
  const { data: versions } = useTreatmentPlanVersions(caseId ?? undefined);

  // Default the viewer to the active version if nothing is selected yet.
  useEffect(() => {
    if (!selectedVersionId && active) setSelectedVersionId(active.id);
  }, [active, selectedVersionId]);

  // Bail-out: no caseId or no recordSetId means we're in a pre-persist state.
  if (!caseId || !recordSetId) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-bold text-amber-800">Record set not persisted yet</h4>
          <p className="text-xs text-amber-700">Save the record set first to begin authoring a treatment plan.</p>
        </div>
      </div>
    );
  }

  // ── PRE ─────────────────────────────────────────────────────────────────────
  if (recordSetType === 'PRE') {
    return (
      <TreatmentPlanEditor
        caseId={caseId}
        recordSetId={recordSetId}
        data={data}
        onOpenPhotoViewer={onOpenPhotoViewer}
      />
    );
  }

  // ── MID / POST / CUSTOM ─────────────────────────────────────────────────────
  const canRevise = recordSetType === 'MID' && !!approved;
  const noApproved = !approved;

  const openCompare = (fromId: string, toId: string) => {
    setCompareFromId(fromId);
    setCompareToId(toId);
  };
  const closeCompare = () => {
    setCompareFromId(null);
    setCompareToId(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 space-y-4">
        <VersionHistory
          caseId={caseId}
          selectedVersionId={selectedVersionId}
          onSelect={setSelectedVersionId}
          onCompare={openCompare}
        />

        {canRevise && (
          <button
            onClick={() => setRevisionOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200"
          >
            <GitBranch className="w-3.5 h-3.5" />
            Create Revision
          </button>
        )}

        {recordSetType === 'MID' && noApproved && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>No approved plan yet. A PRE draft must be approved before revisions can be created.</span>
          </div>
        )}
      </div>

      <div className="lg:col-span-2">
        {selectedVersionId ? (
          <TreatmentPlanViewer caseId={caseId} versionId={selectedVersionId} />
        ) : (
          <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
            <p className="text-sm text-slate-500">Select a version from the history to view it.</p>
          </div>
        )}
      </div>

      <NewVersionModal
        open={revisionOpen}
        caseId={caseId}
        recordSetId={recordSetId}
        onClose={() => setRevisionOpen(false)}
        onCreated={(newVersionId) => setSelectedVersionId(newVersionId)}
      />

      <CompareModal
        open={!!compareFromId && !!compareToId}
        caseId={caseId}
        fromVersionId={compareFromId}
        toVersionId={compareToId}
        onClose={closeCompare}
      />
    </div>
  );
};

export default PlanPhaseSwitch;
