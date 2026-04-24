/**
 * CompareModal.tsx — Side-by-side diff between two TreatmentPlanVersion rows.
 *
 * Fetches via GET /plan-versions/:caseId/compare?from=&to=. Renders
 * `changedFields[]` as a before/after table and asset diffs as chip lists.
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, Diff, ArrowRight, Plus, Minus } from 'lucide-react';
import { useComparePlanVersions } from '../../../hooks/useTreatmentPlanVersions';

interface CompareModalProps {
  open: boolean;
  caseId: string;
  fromVersionId: string | null;
  toVersionId: string | null;
  onClose: () => void;
}

const CompareModal: React.FC<CompareModalProps> = ({ open, caseId, fromVersionId, toVersionId, onClose }) => {
  const { data: result, isLoading, error } = useComparePlanVersions(
    caseId,
    fromVersionId ?? undefined,
    toVersionId ?? undefined,
  );

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="relative bg-white rounded-[28px] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        >
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                <Diff className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Version Comparison</h3>
                <p className="text-xs text-slate-500 flex items-center gap-2">
                  {result ? (
                    <>
                      <span className="font-bold">v{result.from.version}</span>
                      <ArrowRight className="w-3 h-3" />
                      <span className="font-bold">v{result.to.version}</span>
                    </>
                  ) : 'Computing diff…'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                Failed to load comparison.
              </div>
            ) : result ? (
              <>
                {/* Changed fields */}
                <div>
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Changed Fields ({result.changedFields.length})
                  </h4>
                  {result.changedFields.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No payload differences.</p>
                  ) : (
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          <tr>
                            <th className="text-left px-3 py-2">Path</th>
                            <th className="text-left px-3 py-2 border-l border-slate-200">Before</th>
                            <th className="text-left px-3 py-2 border-l border-slate-200">After</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {result.changedFields.map((f) => (
                            <tr key={f.path} className="hover:bg-slate-50/50">
                              <td className="px-3 py-2 font-mono text-slate-700">{f.path}</td>
                              <td className="px-3 py-2 border-l border-slate-100 text-rose-600">{_fmt(f.before)}</td>
                              <td className="px-3 py-2 border-l border-slate-100 text-emerald-600">{_fmt(f.after)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Asset diff */}
                <div>
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Asset Changes
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(['photos', 'stlFiles', 'dicomFiles', 'documents'] as const).map((cat) => {
                      const added = result.assets.added[cat];
                      const removed = result.assets.removed[cat];
                      if (added.length === 0 && removed.length === 0) return null;
                      return (
                        <div key={cat} className="rounded-xl border border-slate-200 p-3">
                          <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">{cat}</div>
                          {added.length > 0 && (
                            <div className="mb-2">
                              <span className="text-[9px] font-bold text-emerald-600 flex items-center gap-0.5">
                                <Plus className="w-2.5 h-2.5" /> ADDED ({added.length})
                              </span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {added.map((id) => (
                                  <span key={id} className="text-[10px] font-mono bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 text-emerald-700">
                                    {id.slice(-6)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {removed.length > 0 && (
                            <div>
                              <span className="text-[9px] font-bold text-rose-600 flex items-center gap-0.5">
                                <Minus className="w-2.5 h-2.5" /> REMOVED ({removed.length})
                              </span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {removed.map((id) => (
                                  <span key={id} className="text-[10px] font-mono bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5 text-rose-700">
                                    {id.slice(-6)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {_noAssetChanges(result) && (
                      <p className="text-xs text-slate-500 italic md:col-span-2">No asset changes.</p>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="p-4 border-t border-slate-100 flex items-center justify-end bg-slate-50/50">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200">
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

function _fmt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function _noAssetChanges(result: { assets: { added: any; removed: any } }): boolean {
  const all = (o: any) => Object.values(o).every((arr: any) => Array.isArray(arr) && arr.length === 0);
  return all(result.assets.added) && all(result.assets.removed);
}

export default CompareModal;
