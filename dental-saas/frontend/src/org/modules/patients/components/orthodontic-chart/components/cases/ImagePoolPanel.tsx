import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trash2, MousePointerClick, Loader2, Image as ImageIcon, Check } from 'lucide-react';
import { useImagePool, useAssignPoolPhoto, useDeletePoolPhoto } from '../../hooks/useImagePool';
import { resolveFileUrl } from '@/utils/resolveFileUrl';
import type { PoolImageDTO } from '../api/case.api';

/* ═══════════════════════════════════════════════════════════════
   ImagePoolPanel — right-side drawer listing the current recordSet's
   unassigned image pool.

   Click "Assign" on a thumbnail → a slot picker reveals the grid of
   slots. Clicking a slot triggers the backend assign endpoint, which
   also handles Scenario 6 (push displaced slot photo back to pool).

   Click "Delete" → soft-delete + blob removal + usage decrement.
   ═══════════════════════════════════════════════════════════════ */

export interface PoolSlot {
  id: string;
  label: string;
  filled: boolean;
}

export interface ImagePoolPanelProps {
  isOpen: boolean;
  caseId: string;
  recordSetId: string;
  slots: PoolSlot[];
  onClose: () => void;
}

const ImagePoolPanel: React.FC<ImagePoolPanelProps> = ({
  isOpen,
  caseId,
  recordSetId,
  slots,
  onClose,
}) => {
  const { data, isLoading, isError, refetch } = useImagePool(caseId, recordSetId, isOpen);
  const assignMutation = useAssignPoolPhoto(caseId, recordSetId);
  const deleteMutation = useDeletePoolPhoto(caseId, recordSetId);
  const [pickerFor, setPickerFor] = useState<PoolImageDTO | null>(null);

  const pool = useMemo<PoolImageDTO[]>(() => data?.pool ?? [], [data]);

  const handlePickSlot = async (slotId: string) => {
    if (!pickerFor) return;
    try {
      await assignMutation.mutateAsync({ photoId: pickerFor.id, view: slotId });
      setPickerFor(null);
    } catch {
      // onError in hook rolls back optimistic update; keep picker open so user can retry.
    }
  };

  const handleDelete = async (photo: PoolImageDTO) => {
    if (!confirm(`Delete "${photo.originalName ?? 'photo'}"? This cannot be undone.`)) return;
    await deleteMutation.mutateAsync({ photoId: photo.id });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Image pool</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {pool.length} unassigned · this record set only
                </p>
              </div>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : isError ? (
                <div className="text-center py-10">
                  <p className="text-sm text-rose-600 mb-3">Failed to load pool.</p>
                  <button
                    onClick={() => refetch()}
                    className="px-3 py-1.5 text-xs rounded-lg bg-rose-50 text-rose-700 font-semibold hover:bg-rose-100"
                  >
                    Retry
                  </button>
                </div>
              ) : pool.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <ImageIcon className="w-10 h-10 mb-3" />
                  <p className="text-sm font-semibold">No pool images yet</p>
                  <p className="text-xs mt-1">Upload a batch to get started.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {pool.map((photo) => {
                    const isBusy =
                      (assignMutation.isPending && assignMutation.variables?.photoId === photo.id) ||
                      (deleteMutation.isPending && deleteMutation.variables?.photoId === photo.id);
                    const resolved = resolveFileUrl(photo.url ?? undefined) || photo.url || undefined;
                    return (
                      <div
                        key={photo.id}
                        className="group relative rounded-xl border border-slate-200 overflow-hidden bg-slate-50 aspect-square"
                      >
                        {resolved ? (
                          <img
                            src={resolved}
                            alt={photo.originalName ?? 'Pool photo'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-slate-400" />
                          </div>
                        )}

                        <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                          <button
                            onClick={() => setPickerFor(photo)}
                            disabled={isBusy}
                            className="px-3 py-1.5 bg-white rounded-lg text-xs font-bold text-slate-800 shadow-lg hover:bg-blue-50 disabled:opacity-50 flex items-center gap-1.5"
                            title="Assign to a slot"
                          >
                            <MousePointerClick className="w-3.5 h-3.5" />
                            Assign
                          </button>
                          <button
                            onClick={() => handleDelete(photo)}
                            disabled={isBusy}
                            className="px-3 py-1.5 bg-white rounded-lg text-xs font-bold text-rose-700 shadow-lg hover:bg-rose-50 disabled:opacity-50 flex items-center gap-1.5"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>

                        {isBusy && (
                          <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 text-white animate-spin" />
                          </div>
                        )}

                        <div className="absolute bottom-0 left-0 right-0 bg-slate-900/70 text-white text-[10px] px-2 py-1 truncate">
                          {photo.originalName ?? 'Photo'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.aside>

          {/* Slot picker overlay */}
          <AnimatePresence>
            {pickerFor && (
              <motion.div
                className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setPickerFor(null)}
              >
                <motion.div
                  className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
                  initial={{ scale: 0.95 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0.95 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-bold text-slate-900">Pick a slot</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Filled slots will send their current photo back to the pool.
                      </p>
                    </div>
                    <button
                      onClick={() => setPickerFor(null)}
                      className="p-1.5 rounded-full hover:bg-slate-100"
                    >
                      <X className="w-4 h-4 text-slate-600" />
                    </button>
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto p-3">
                    {slots.length === 0 ? (
                      <p className="text-sm text-slate-500 p-4 text-center">No slots available.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {slots.map((slot) => (
                          <li key={slot.id}>
                            <button
                              onClick={() => handlePickSlot(slot.id)}
                              disabled={assignMutation.isPending}
                              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 hover:bg-blue-50 hover:border-blue-300 disabled:opacity-50 transition"
                            >
                              <span className="text-sm font-semibold text-slate-800">{slot.label}</span>
                              {slot.filled ? (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5">
                                  Will swap
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5 flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Empty
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
};

export default ImagePoolPanel;
