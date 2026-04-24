import React, { useState, useMemo } from 'react';
import { ImageIcon, X, Check, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useImagePool,
  useAssignPoolImage,
  useDeletePoolImage,
} from '@/modules/org/orthodontics/hooks/useBulkPhotoUpload';
import { QK } from '@/lib/query/queryKeys';
import { resolveFileUrl } from '@/utils/resolveFileUrl';
import type { PoolPhotoDTO } from '../../api/case.api';

// Inline 1×1 transparent gray PNG used when a signed URL expires or 404s.
// Using a data URI avoids shipping an extra asset and guarantees the
// fallback cannot itself 404 (which would spin in an onError loop).
const IMG_FALLBACK =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" fill="#f1f5f9"/>' +
    '<path d="M20 22h24v20H20z" fill="#cbd5e1"/>' +
    '<circle cx="27" cy="29" r="2.5" fill="#94a3b8"/>' +
    '<path d="M22 40l7-7 6 6 4-4 5 5v2H22z" fill="#94a3b8"/>' +
    '</svg>'
  );

/* ═══════════════════════════════════════════════════════════════
   ImagePoolModal — "Assign from Uploads" picker.

   Opens from a canvas view slot. Shows unassigned bulk-uploaded
   images for the current case in a 4–6 column thumbnail grid.

   Flow:
     1. Open → GET /photos/pool?filter=unassigned
     2. User selects a thumbnail → highlighted state
     3. Hover → larger zoom preview
     4. Confirm → PATCH /photos/:photoId/assign { view }
        (transaction auto-unassigns any incumbent on `targetView`)
     5. onAssigned() → parent refreshes canvas / closes modal
   ═══════════════════════════════════════════════════════════════ */

export interface ImagePoolModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  /** Active recordSet (TDS-BULK-UPLOAD-v1.1 §4 — strict per-recordset isolation) */
  recordSetId: string;
  /** Target canvas view slot (e.g. "profileRest", "frontSmile") */
  targetView: string;
  /** Human-readable view label shown in the header */
  targetLabel?: string;
  /** Fired after a successful assignment (photoId + view) */
  onAssigned?: (photoId: string, view: string) => void;
}

const ImagePoolModal: React.FC<ImagePoolModalProps> = ({
  isOpen,
  onClose,
  caseId,
  recordSetId,
  targetView,
  targetLabel,
  onAssigned,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId]   = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);

  const qc = useQueryClient();
  const poolQuery  = useImagePool(isOpen ? caseId : '', isOpen ? recordSetId : '', 'unassigned');
  const assignMut  = useAssignPoolImage(caseId, recordSetId);
  const deleteMut  = useDeletePoolImage(caseId, recordSetId);

  // Signed-URL expiry fallback (§3.3). On first <img> failure we substitute
  // an inline placeholder AND trigger a background refetch so the next paint
  // ships a fresh signed URL. The `data-fallback` flag prevents an infinite
  // loop if the placeholder itself were ever broken.
  const handleImgError = React.useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const el = e.currentTarget;
      if (el.dataset.fallback === 'true') return;
      el.dataset.fallback = 'true';
      el.src = IMG_FALLBACK;
      qc.invalidateQueries({ queryKey: QK.orthodontics.poolAll(caseId, recordSetId) });
    },
    [qc, caseId, recordSetId]
  );

  const pool = useMemo<PoolPhotoDTO[]>(
    () => (poolQuery.data?.pool as PoolPhotoDTO[]) || [],
    [poolQuery.data]
  );

  const selected = pool.find((p) => p.id === selectedId) || null;
  const hovered  = pool.find((p) => p.id === hoveredId)  || null;
  const preview  = hovered || selected;

  const handleConfirm = async () => {
    if (!selectedId) return;
    setErrorMsg(null);
    const snapshot = selected; // capture before async gap
    try {
      await assignMut.mutateAsync({ photoId: selectedId, view: targetView });
      onAssigned?.(selectedId, targetView);
      setSelectedId(null);
      onClose();
    } catch (err: any) {
      // Clear selection so user sees unambiguous state — the assignment did not
      // happen and the thumbnail ring should not persist.
      setSelectedId(null);

      // Detect stale-state (pool photo was modified / deleted concurrently).
      const status: number | undefined = (err as any)?.response?.status;
      if (status === 404) {
        setErrorMsg('This image is no longer in the pool. It may have been deleted. Refreshing…');
        // Pool query will re-fetch via invalidation triggered by the failed mutation.
        return;
      }

      // Generic error surfacing.
      const serverMsg: string | undefined = (err as any)?.response?.data?.message;
      setErrorMsg(serverMsg || (err as any)?.message || 'Assignment failed. Please try again.');
    }
  };

  const handleDelete = async (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setErrorMsg(null);
    setDeletingId(photoId);
    try {
      await deleteMut.mutateAsync({ photoId });
      if (selectedId === photoId) setSelectedId(null);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || err?.message || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const handleClose = () => {
    setSelectedId(null);
    setHoveredId(null);
    setErrorMsg(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white rounded-[40px] shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col"
          >
            {/* ── Header ──────────────────────────────────────────── */}
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Assign from Uploads</h3>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Target: {targetLabel || targetView}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                aria-label="Close"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            {/* ── Body ────────────────────────────────────────────── */}
            <div className="flex min-h-[420px] max-h-[65vh]">
              {/* Grid (pool) */}
              <div className="flex-1 overflow-y-auto p-6">
                {poolQuery.isLoading ? (
                  <div className="h-full flex items-center justify-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : poolQuery.isError ? (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-rose-500">
                    <AlertCircle className="w-8 h-8" />
                    <p className="text-sm">Failed to load image pool</p>
                  </div>
                ) : pool.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400">
                    <ImageIcon className="w-10 h-10" />
                    <p className="text-sm font-medium">No unassigned images</p>
                    <p className="text-xs">Use "Bulk Upload" to add photos to the pool.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {pool.map((p) => {
                      const isSelected = p.id === selectedId;
                      const isDeleting = p.id === deletingId;
                      return (
                        <div
                          key={p.id}
                          onClick={() => setSelectedId(p.id)}
                          onMouseEnter={() => setHoveredId(p.id)}
                          onMouseLeave={() => setHoveredId(null)}
                          className={`group relative aspect-square rounded-2xl overflow-hidden cursor-pointer transition-all bg-slate-50 ${
                            isSelected
                              ? 'ring-4 ring-indigo-500 shadow-lg shadow-indigo-200'
                              : 'ring-1 ring-slate-200 hover:ring-indigo-300'
                          }`}
                        >
                          <img
                            src={resolveFileUrl(p.thumbnailUrl || p.url) || IMG_FALLBACK}
                            alt={p.originalName || 'pool image'}
                            onError={handleImgError}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            style={{ referrerPolicy: 'no-referrer' } as any}
                          />
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg">
                              <Check className="w-4 h-4 text-white" />
                            </div>
                          )}
                          <button
                            onClick={(e) => handleDelete(p.id, e)}
                            disabled={isDeleting}
                            className="absolute top-2 left-2 w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm text-rose-500 opacity-0 group-hover:opacity-100 hover:bg-rose-50 transition-all flex items-center justify-center shadow"
                            title="Delete"
                          >
                            {isDeleting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-slate-900/70 to-transparent">
                            <p className="text-[9px] font-bold text-white/90 uppercase tracking-wider truncate">
                              {p.originalName || p.id}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Preview pane */}
              <div className="hidden md:flex w-[320px] border-l border-slate-100 bg-slate-50/60 flex-col">
                <div className="p-4 border-b border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Preview
                  </p>
                </div>
                <div className="flex-1 flex items-center justify-center p-6">
                  {preview ? (
                    <img
                      src={resolveFileUrl(preview.url) || IMG_FALLBACK}
                      alt="preview"
                      onError={handleImgError}
                      className="max-w-full max-h-[340px] object-contain rounded-xl shadow-lg"
                      style={{ referrerPolicy: 'no-referrer' } as any}
                    />
                  ) : (
                    <p className="text-xs text-slate-400 text-center">
                      Hover or click a thumbnail to preview
                    </p>
                  )}
                </div>
                {preview && (
                  <div className="p-4 border-t border-slate-100 space-y-1">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">
                      {preview.originalName || preview.id}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {(preview.sizeBytes / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Footer ──────────────────────────────────────────── */}
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {errorMsg ? (
                  <>
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                    <span className="text-rose-600 font-medium">{errorMsg}</span>
                  </>
                ) : (
                  <span>
                    {pool.length} unassigned {pool.length === 1 ? 'image' : 'images'}
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!selectedId || assignMut.isPending}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {assignMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Assign to {targetLabel || targetView}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ImagePoolModal;
