/**
 * NewVersionModal.tsx — MID "Create Revision" flow.
 *
 * Pre-fills a textarea (JSON) with a deep-clone of the active version's payload
 * and assets, requires a non-empty changeSummary, and POSTs to /plan-versions/revision.
 * Simpler than a full form-editor — revisions are clinician-authored JSON edits
 * that the viewer renders. Can be upgraded to a structured form later.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, AlertTriangle, GitBranch, Save } from 'lucide-react';
import { useActivePlanVersion, useCreateRevision } from '../../../hooks/useTreatmentPlanVersions';

interface NewVersionModalProps {
  open: boolean;
  caseId: string;
  recordSetId: string;
  onClose: () => void;
  onCreated?: (newVersionId: string) => void;
}

const NewVersionModal: React.FC<NewVersionModalProps> = ({ open, caseId, recordSetId, onClose, onCreated }) => {
  const { data: active, isLoading: loadingActive } = useActivePlanVersion(caseId);
  const createRevision = useCreateRevision(caseId);

  const [payloadJson, setPayloadJson] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [error, setError] = useState<string | null>(null);

  const initialJson = useMemo(() => {
    if (!active?.payload) return '{\n\n}';
    try { return JSON.stringify(active.payload, null, 2); } catch { return '{}'; }
  }, [active]);

  useEffect(() => {
    if (open) {
      setPayloadJson(initialJson);
      setChangeSummary('');
      setError(null);
    }
  }, [open, initialJson]);

  if (!open) return null;

  const handleSave = async () => {
    setError(null);
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadJson);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('not an object');
    } catch {
      setError('Plan payload must be valid JSON (object).');
      return;
    }
    if (!changeSummary.trim()) {
      setError('Please describe what changed in this revision.');
      return;
    }
    try {
      const created = await createRevision.mutateAsync({
        recordSetId,
        payload,
        changeSummary: changeSummary.trim(),
        // assets inherited from parent by default — backend clones them
      });
      onCreated?.(created.id);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Failed to create revision.');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="relative bg-white rounded-[28px] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        >
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <GitBranch className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Create Plan Revision</h3>
                <p className="text-xs text-slate-500">
                  {active ? `Based on v${active.version} (${active.stage})` : 'No active plan to revise'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {loadingActive ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              </div>
            ) : !active ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>No active plan found. Approve a PRE draft before creating revisions.</span>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                    Change Summary (required)
                  </label>
                  <textarea
                    value={changeSummary}
                    onChange={(e) => setChangeSummary(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="e.g. Switched maxilla anchorage to maximum after Class II correction delay"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                    Plan Payload (JSON)
                  </label>
                  <textarea
                    value={payloadJson}
                    onChange={(e) => setPayloadJson(e.target.value)}
                    rows={18}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono text-slate-700 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Pre-filled from the active version. Assets are inherited from the parent automatically.
                  </p>
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                    {error}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={createRevision.isPending || !active}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createRevision.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Create Revision
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default NewVersionModal;
