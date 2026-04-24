import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, Loader2, Check, AlertCircle, Image as ImageIcon, Trash2, RefreshCw } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { useBulkUploadPhotos } from '../../hooks/useImagePool';

/* ═══════════════════════════════════════════════════════════════
   BulkPhotoUploadModal — pick many images, optionally compress,
   upload them into a recordSet's image pool.

   Hardening (TDS Group E):
     - H8: idempotencyKeyRef locked for the lifetime of one submit
           attempt. Retries of the same batch reuse the key so the
           server replays cached responses and fingerprint-dedup
           skips already-landed files.
     - H6: client-side 200 MB total-bytes cap mirrors backend guard.
     - H7: canonical ApiError rendering — never show raw err.message.
     - Retry-failed flow reuses items + same idempotencyKeyRef.
     - Overall progress bar wired via onUploadProgress.
   ═══════════════════════════════════════════════════════════════ */

const MAX_FILES = 30;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // matches backend photoUpload 25 MB cap
const MAX_BATCH_BYTES = 200 * 1024 * 1024; // matches backend quotaGuard.maxBatchBytes

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  fileType: 'image/jpeg' as const,
};

interface QueueItem {
  id: string;
  file: File;
  previewUrl: string;
  status: 'queued' | 'compressing' | 'ready' | 'uploading' | 'done' | 'failed';
  errorMessage?: string;
  originalBytes: number;
  compressedBytes?: number;
}

interface ApiError {
  code: string;
  message: string;
  traceId?: string | null;
  location?: string | null;
}

interface BulkPhotoUploadModalProps {
  isOpen: boolean;
  caseId: string;
  recordSetId: string;
  onClose: () => void;
  onUploaded?: (summary: { uploaded: number; rejected: number }) => void;
}

function fmtBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function extractApiError(err: any): ApiError {
  const envelope = err?.response?.data?.error;
  if (envelope && typeof envelope === 'object') {
    return {
      code:     envelope.code     || 'UPLOAD_ERROR',
      message:  envelope.message  || err?.message || 'Upload failed',
      traceId:  envelope.traceId  || err?.response?.headers?.['x-request-id'] || null,
      location: envelope.location || null,
    };
  }
  return {
    code:     'UPLOAD_ERROR',
    message:  err?.message || 'Upload failed',
    traceId:  err?.response?.headers?.['x-request-id'] || null,
    location: null,
  };
}

const BulkPhotoUploadModal: React.FC<BulkPhotoUploadModalProps> = ({
  isOpen,
  caseId,
  recordSetId,
  onClose,
  onUploaded,
}) => {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [compressFirst, setCompressFirst] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [summary, setSummary] = useState<{
    uploaded: number;
    rejected: number;
    rejectedReasons: string[];
    apiError?: ApiError;
  } | null>(null);
  const [droppedNonImageCount, setDroppedNonImageCount] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * H8 — one Idempotency-Key per submit attempt, locked for the lifetime of
   * that attempt (including user-initiated retries of the same batch). A
   * fresh key is only minted when:
   *   - the modal closes (unmount clears it), OR
   *   - the user has seen the success summary and closed it.
   * Never regenerated on "Retry failed" — that's the whole point.
   */
  const idempotencyKeyRef = useRef<string | null>(null);

  const bulkUpload = useBulkUploadPhotos(caseId, recordSetId);

  // Cleanup preview URLs on unmount / close
  useEffect(() => {
    return () => {
      items.forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isOpen) {
      items.forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl));
      setItems([]);
      setSummary(null);
      setDroppedNonImageCount(0);
      setUploadProgress(0);
      idempotencyKeyRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Auto-dismiss the "ignored" banner after a few seconds
  useEffect(() => {
    if (droppedNonImageCount === 0) return;
    const t = window.setTimeout(() => setDroppedNonImageCount(0), 5000);
    return () => window.clearTimeout(t);
  }, [droppedNonImageCount]);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    const available = MAX_FILES - items.length;
    const accepted: QueueItem[] = [];
    let ignored = 0;
    for (const file of arr.slice(0, available)) {
      if (!file.type.startsWith('image/')) {
        ignored += 1;
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        accepted.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          status: 'failed',
          errorMessage: 'Too large (>25MB)',
          originalBytes: file.size,
        });
        continue;
      }
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'queued',
        originalBytes: file.size,
      });
    }
    if (ignored > 0) setDroppedNonImageCount((c) => c + ignored);
    setItems((prev) => [...prev, ...accepted]);
  }, [items.length]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const filesReadyCount = useMemo(
    () => items.filter((i) => i.status !== 'failed').length,
    [items]
  );

  /**
   * Run one batch attempt. Uses whichever items are currently `queued` or
   * `ready` in the queue. The caller (`handleSubmit` / `handleRetryFailed`)
   * is responsible for marking items `queued` before invoking.
   */
  const runBatch = useCallback(async () => {
    // H8 — lazily initialise once; never overwrite.
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    const idempotencyKey = idempotencyKeyRef.current;

    let prepared: QueueItem[] = items;

    if (compressFirst) {
      setItems((prev) =>
        prev.map((i) => (i.status === 'queued' ? { ...i, status: 'compressing' as const } : i))
      );
      const compressed: QueueItem[] = [];
      for (const it of items) {
        if (it.status !== 'queued') { compressed.push(it); continue; }
        try {
          const out = await imageCompression(it.file, COMPRESSION_OPTIONS);
          compressed.push({
            ...it,
            file: new File([out], it.file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }),
            compressedBytes: out.size,
            status: 'ready',
          });
        } catch {
          compressed.push({ ...it, status: 'ready' }); // fall back to original
        }
      }
      setItems(compressed);
      prepared = compressed;
    } else {
      setItems((prev) =>
        prev.map((i) => (i.status === 'queued' ? { ...i, status: 'ready' as const } : i))
      );
      prepared = items.map((i) => (i.status === 'queued' ? { ...i, status: 'ready' as const } : i));
    }

    const uploadable = prepared.filter((i) => i.status === 'ready');
    if (uploadable.length === 0) return;

    // H6 — client-side total-bytes cap. Short-circuit before the network call.
    const totalBytes = uploadable.reduce(
      (sum, i) => sum + (i.compressedBytes ?? i.originalBytes),
      0
    );
    if (totalBytes > MAX_BATCH_BYTES) {
      setItems((prev) =>
        prev.map((i) =>
          i.status === 'ready'
            ? { ...i, status: 'failed' as const, errorMessage: 'Batch exceeds 200 MB limit' }
            : i
        )
      );
      setSummary({
        uploaded: 0,
        rejected: uploadable.length,
        rejectedReasons: [`Batch total ${fmtBytes(totalBytes)} exceeds 200 MB limit — remove some files and retry`],
        apiError: {
          code: 'PAYLOAD_TOO_LARGE',
          message: `Batch total ${fmtBytes(totalBytes)} exceeds the 200 MB limit.`,
        },
      });
      return;
    }

    setItems((prev) => prev.map((i) => (i.status === 'ready' ? { ...i, status: 'uploading' as const } : i)));
    setUploadProgress(0);

    try {
      const result = await bulkUpload.mutateAsync({
        files: uploadable.map((i) => i.file),
        compressed: compressFirst,
        idempotencyKey,
        onUploadProgress: (e: ProgressEvent) => {
          if (!e.lengthComputable || e.total === 0) return;
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      const uploadedNames = new Set((result?.uploaded ?? []).map((u) => u.originalName));
      const rejectedMap = new Map(
        (result?.rejected ?? []).map((r) => [r.originalName, r.reason])
      );

      setItems((prev) =>
        prev.map((i) => {
          if (i.status !== 'uploading') return i;
          if (uploadedNames.has(i.file.name)) return { ...i, status: 'done' };
          if (rejectedMap.has(i.file.name)) {
            return { ...i, status: 'failed', errorMessage: rejectedMap.get(i.file.name) };
          }
          return { ...i, status: 'done' }; // optimistic: server said success overall
        })
      );

      setSummary({
        uploaded: result?.uploaded?.length ?? 0,
        rejected: result?.rejected?.length ?? 0,
        rejectedReasons: (result?.rejected ?? []).map((r) => `${r.originalName}: ${r.reason}`),
      });
      onUploaded?.({ uploaded: result?.uploaded?.length ?? 0, rejected: result?.rejected?.length ?? 0 });
    } catch (err: any) {
      const apiError = extractApiError(err);
      setItems((prev) =>
        prev.map((i) =>
          i.status === 'uploading'
            ? { ...i, status: 'failed', errorMessage: apiError.message }
            : i
        )
      );
      setSummary({
        uploaded: 0,
        rejected: uploadable.length,
        rejectedReasons: [apiError.message],
        apiError,
      });
    } finally {
      setUploadProgress(0);
    }
  }, [items, compressFirst, bulkUpload, onUploaded]);

  const handleSubmit = () => {
    if (filesReadyCount === 0) return;
    void runBatch();
  };

  /**
   * User-initiated retry. Keeps only items that failed, re-queues them,
   * and reuses the same idempotencyKeyRef — so a retry of a partially-
   * completed batch is safe even if the server actually succeeded.
   */
  const handleRetryFailed = () => {
    setItems((prev) => {
      // Revoke previews for the ones we're dropping
      prev
        .filter((i) => i.status !== 'failed')
        .forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl));
      return prev
        .filter((i) => i.status === 'failed')
        .map((i) => ({ ...i, status: 'queued' as const, errorMessage: undefined }));
    });
    setSummary(null);
    // DO NOT clear idempotencyKeyRef — the whole point of retry is to reuse it.
    // schedule the actual upload on the next tick so state flushes first
    window.setTimeout(() => { void runBatch(); }, 0);
  };

  const handleCloseSummary = () => {
    // User acknowledged the outcome — safe to mint a new key next time.
    idempotencyKeyRef.current = null;
    onClose();
  };

  const isBusy = bulkUpload.isPending || items.some((i) => i.status === 'compressing' || i.status === 'uploading');

  const failedCount = items.filter((i) => i.status === 'failed').length;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !isBusy && onClose()}
        >
          <motion.div
            className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden bg-white rounded-3xl shadow-2xl flex flex-col"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Bulk photo upload</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Upload up to {MAX_FILES} images into this record set's pool. Assign them to slots afterwards.
                </p>
              </div>
              <button
                onClick={() => !isBusy && onClose()}
                disabled={isBusy}
                className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-40"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl px-6 py-10 flex flex-col items-center justify-center cursor-pointer transition ${
                  isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <Upload className="w-8 h-8 text-slate-500 mb-3" />
                <p className="text-sm font-semibold text-slate-700">Drop images here or click to choose</p>
                <p className="text-xs text-slate-500 mt-1">JPG / PNG / WEBP · up to {MAX_FILES} files · 25 MB each · 200 MB total</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>

              {/* Non-image drop banner */}
              {droppedNonImageCount > 0 && (
                <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>
                    {droppedNonImageCount} file{droppedNonImageCount === 1 ? '' : 's'} ignored (not an image).
                  </span>
                </div>
              )}

              {/* Compress toggle */}
              <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={compressFirst}
                  onChange={(e) => setCompressFirst(e.target.checked)}
                  disabled={isBusy}
                  className="rounded"
                />
                <span className="font-medium">Compress before upload</span>
                <span className="text-xs text-slate-500">(recommended — reduces bandwidth)</span>
              </label>

              {/* Queue grid */}
              {items.length > 0 && (
                <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="relative border border-slate-200 rounded-xl overflow-hidden bg-slate-50 aspect-square"
                    >
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-slate-900/70 text-white text-[10px] px-2 py-1 flex items-center justify-between">
                        <span className="truncate">{item.file.name}</span>
                        <span>{fmtBytes(item.compressedBytes ?? item.originalBytes)}</span>
                      </div>

                      {item.status === 'compressing' && (
                        <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center">
                          <Loader2 className="w-5 h-5 text-white animate-spin" />
                        </div>
                      )}
                      {item.status === 'uploading' && (
                        <div className="absolute inset-0 bg-blue-900/40 flex items-center justify-center">
                          <Loader2 className="w-5 h-5 text-white animate-spin" />
                        </div>
                      )}
                      {item.status === 'done' && (
                        <div className="absolute top-1.5 right-1.5 bg-emerald-500 rounded-full p-1">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                      {item.status === 'failed' && (
                        <div className="absolute inset-0 bg-rose-900/60 flex flex-col items-center justify-center gap-1 p-2 text-center">
                          <AlertCircle className="w-4 h-4 text-white" />
                          <span className="text-[10px] text-white font-semibold">{item.errorMessage}</span>
                        </div>
                      )}

                      {!isBusy && item.status !== 'done' && (
                        <button
                          onClick={() => removeItem(item.id)}
                          className="absolute top-1.5 left-1.5 bg-slate-900/70 hover:bg-slate-900 rounded-full p-1"
                          title="Remove"
                        >
                          <Trash2 className="w-3 h-3 text-white" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {items.length === 0 && (
                <div className="mt-8 flex items-center justify-center text-slate-400 text-sm gap-2">
                  <ImageIcon className="w-4 h-4" />
                  <span>No files selected</span>
                </div>
              )}

              {/* Summary — canonical error envelope + retry-failed */}
              {summary && (
                <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {summary.uploaded} uploaded · {summary.rejected} rejected
                      </p>
                      {summary.apiError && (
                        <div className="mt-2 text-xs text-rose-700 space-y-0.5">
                          <p className="font-semibold">Upload failed — {summary.apiError.message}</p>
                          <p className="font-mono text-[11px] text-rose-500">
                            Code: {summary.apiError.code}
                            {summary.apiError.traceId ? `  ·  Ref: ${summary.apiError.traceId}` : ''}
                          </p>
                        </div>
                      )}
                      {!summary.apiError && summary.rejectedReasons.length > 0 && (
                        <ul className="mt-2 text-xs text-rose-600 space-y-0.5">
                          {summary.rejectedReasons.map((r, idx) => (
                            <li key={idx}>• {r}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {failedCount > 0 && !isBusy && (
                      <button
                        onClick={handleRetryFailed}
                        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 flex items-center gap-1.5"
                        title="Retry only the files that failed — safe because the Idempotency-Key is reused"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Retry failed ({failedCount})
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center gap-4 bg-slate-50/60">
              <div className="text-xs text-slate-500 shrink-0">
                {items.length}/{MAX_FILES} selected · {filesReadyCount} ready
              </div>

              {/* Overall progress bar — only visible while a batch is uploading */}
              {isBusy && uploadProgress > 0 && (
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-[width] duration-200 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-slate-600 w-10 text-right">{uploadProgress}%</span>
                </div>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={summary ? handleCloseSummary : onClose}
                  disabled={isBusy}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                >
                  {summary ? 'Close' : 'Cancel'}
                </button>
                {!summary && (
                  <button
                    onClick={handleSubmit}
                    disabled={isBusy || filesReadyCount === 0}
                    className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 flex items-center gap-2"
                  >
                    {isBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                    Upload {filesReadyCount > 0 ? `(${filesReadyCount})` : ''}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BulkPhotoUploadModal;
