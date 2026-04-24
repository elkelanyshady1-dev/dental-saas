/**
 * TreatmentPlanEditor.tsx — PRE-phase draft editor.
 *
 * Wraps the existing TreatmentPlanTab form body and redirects its onUpdate
 * to the /plan-versions endpoints (createDraft / editDraft). Approve button
 * calls /plan-versions/:versionId/approve. Retires the legacy write path that
 * used to mutate RecordSet.treatmentPlan.
 *
 * Shows the draft list for the case (filtered to stage=DRAFT) so the clinician
 * can create multiple drafts before choosing one to approve.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, Save, Trash2, Loader2, AlertTriangle, Target, Lock } from 'lucide-react';
import { TreatmentPlanTab } from '../TreatmentPlanTab';
import type { RecordSet } from '../../../types';
import {
  useTreatmentPlanVersions,
  usePlanVersion,
  useCreateDraft,
  useEditDraft,
  useDeleteDraft,
  useApprovePlan,
  useApprovedPlanVersion,
} from '../../../hooks/useTreatmentPlanVersions';
import TreatmentPlanViewer from './TreatmentPlanViewer';

interface TreatmentPlanEditorProps {
  caseId: string;
  recordSetId: string;
  data: RecordSet;
  onOpenPhotoViewer: () => void;
}

const EMPTY_PAYLOAD: Record<string, any> = {
  typeOfTreatment: { orthopaedic: false, orthognathic: false, orthodontic: true },
  typeOfAppliance: { maxilla: 'fixed', mandible: 'fixed', details: '' },
  bracketSystem: 'metal',
  ligationSystem: 'conventional',
  slotSize: '0.022',
  prescription: 'MBT',
  company: '',
  spaceRequirement: { extraction: false, nonExtraction: true, attemptNonExtraction: false, ipr: false, expansion: false, distalization: false },
  anchorageRequirements: { maxilla: 'moderate', mandible: 'minimum', details: '' },
  disarticulation: 'no',
  specialConsideration: '',
  retention: { maxilla: 'fixed', mandible: 'fixed', details: '' },
};

const TreatmentPlanEditor: React.FC<TreatmentPlanEditorProps> = ({ caseId, recordSetId, data, onOpenPhotoViewer }) => {
  const { data: approved } = useApprovedPlanVersion(caseId);
  const { data: versions, isLoading: loadingVersions } = useTreatmentPlanVersions(caseId);

  const drafts = useMemo(() => (versions ?? []).filter((v) => v.stage === 'DRAFT'), [versions]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [workingPayload, setWorkingPayload] = useState<Record<string, any>>(EMPTY_PAYLOAD);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When a draft is selected, fetch its full doc (with versionLock) so we can edit safely.
  const { data: selectedDraft } = usePlanVersion(caseId, selectedDraftId ?? undefined);

  const createDraft = useCreateDraft(caseId);
  const editDraft   = useEditDraft(caseId);
  const deleteDraft = useDeleteDraft(caseId);
  const approve     = useApprovePlan(caseId);

  useEffect(() => {
    if (selectedDraft?.payload) {
      setWorkingPayload(selectedDraft.payload as Record<string, any>);
      setDirty(false);
    }
  }, [selectedDraft]);

  // Post-approval: editor is locked, show the approved viewer.
  if (approved) {
    return (
      <div className="space-y-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-emerald-800">Plan approved (v{approved.version})</h4>
            <p className="text-xs text-emerald-700 mt-0.5">
              PRE editing is locked once a plan is approved. To change the plan, open a MID record set and create a revision.
            </p>
          </div>
        </div>
        <TreatmentPlanViewer caseId={caseId} version={approved} />
      </div>
    );
  }

  const handleLocalUpdate = (next: Partial<RecordSet>) => {
    if (next.treatmentPlan) {
      setWorkingPayload(next.treatmentPlan as Record<string, any>);
      setDirty(true);
    }
  };

  const handleSave = async () => {
    setError(null);
    try {
      if (selectedDraftId && selectedDraft) {
        await editDraft.mutateAsync({
          versionId: selectedDraftId,
          payload: {
            payload: workingPayload,
            expectedVersionLock: selectedDraft.versionLock,
          },
        });
      } else {
        const created = await createDraft.mutateAsync({
          recordSetId,
          payload: workingPayload,
        });
        setSelectedDraftId(created.id);
      }
      setDirty(false);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Failed to save draft.');
    }
  };

  const handleCreateNew = () => {
    setSelectedDraftId(null);
    setWorkingPayload(EMPTY_PAYLOAD);
    setDirty(true);
  };

  const handleDelete = async (versionId: string) => {
    if (!confirm('Delete this draft? This cannot be undone.')) return;
    await deleteDraft.mutateAsync(versionId);
    if (selectedDraftId === versionId) {
      setSelectedDraftId(null);
      setWorkingPayload(EMPTY_PAYLOAD);
      setDirty(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedDraftId) return;
    if (dirty) {
      setError('Save your changes before approving.');
      return;
    }
    if (!confirm('Approve this draft as the final treatment plan? Once approved, PRE editing is locked and only MID revisions can modify the plan.')) return;
    setError(null);
    try {
      await approve.mutateAsync(selectedDraftId);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Failed to approve plan.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Draft list */}
      <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-slate-600" />
            <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-widest">PRE Drafts</h4>
            <span className="text-[10px] text-slate-400">({drafts.length})</span>
          </div>
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100"
          >
            <Plus className="w-3 h-3" /> New Draft
          </button>
        </div>

        {loadingVersions ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /></div>
        ) : drafts.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-xs text-slate-500">No drafts yet. Click "New Draft" to start planning.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {drafts.map((d) => (
              <li
                key={d.id}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer ${selectedDraftId === d.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                onClick={() => setSelectedDraftId(d.id)}
              >
                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                  v{d.version}
                </div>
                <div className="flex-1 min-w-0 text-[11px] text-slate-600">
                  Draft — created {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '—'}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }}
                  className="p-1 rounded-lg text-rose-500 hover:bg-rose-50"
                  title="Delete draft"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Editor form (reuses the existing TreatmentPlanTab visual) */}
      <TreatmentPlanTab
        data={{ ...data, treatmentPlan: workingPayload as any }}
        onUpdate={handleLocalUpdate}
        onOpenPhotoViewer={onOpenPhotoViewer}
      />

      {/* Save / Approve footer */}
      <div className="sticky bottom-4 z-10 bg-white rounded-2xl border border-slate-200 shadow-lg p-4 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {selectedDraftId ? (
            <>Editing draft v{drafts.find((d) => d.id === selectedDraftId)?.version ?? '?'}</>
          ) : dirty ? (
            <>New draft — unsaved</>
          ) : (
            <>Select a draft to edit or create a new one.</>
          )}
          {dirty && <span className="ml-2 text-amber-600 font-bold">● unsaved</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!dirty || createDraft.isPending || editDraft.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createDraft.isPending || editDraft.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {selectedDraftId ? 'Save Draft' : 'Create Draft'}
          </button>
          <button
            onClick={handleApprove}
            disabled={!selectedDraftId || dirty || approve.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title={!selectedDraftId ? 'Select a draft first' : dirty ? 'Save before approving' : 'Approve this draft as the final plan'}
          >
            {approve.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
            Approve Plan
          </button>
        </div>
      </div>
    </div>
  );
};

export default TreatmentPlanEditor;
