import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Check, Loader2, ArrowRight, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import imageCompression from 'browser-image-compression';

/* ═══════════════════════════════════════════════════════════════
   CompressionPreviewModal — Compare original vs compressed image.

   Flow:
     1. User picks a file via <input type="file">
     2. OrthoRecordsTab intercepts → opens this modal
     3. Modal compresses in background (Web Worker)
     4. User sees side-by-side: original ← → compressed
     5. User picks "Original" or "Compressed" via radio toggle
     6. On confirm → callback returns the chosen File object

   Props:
     isOpen          — Controls visibility
     originalFile    — The raw File from <input type="file">
     onConfirm(file) — Called with the chosen File (original or compressed)
     onCancel()      — Called when user dismisses without confirming

   PLANE: Organization
   MODULE: orthodontics/cases
   ═══════════════════════════════════════════════════════════════ */

// ─── Compression Options ──────────────────────────────────────────────────────
const COMPRESSION_OPTIONS = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: 'image/jpeg' as const,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
}

function getReductionPercent(original: number, compressed: number): number {
    if (original <= 0) return 0;
    return Math.round(((original - compressed) / original) * 100);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompressionPreviewModalProps {
    isOpen: boolean;
    originalFile: File | null;
    onConfirm: (file: File) => void;
    onCancel: () => void;
}

type CompressionMode = 'compressed' | 'original';

// ─── Component ────────────────────────────────────────────────────────────────

const CompressionPreviewModal: React.FC<CompressionPreviewModalProps> = ({
    isOpen,
    originalFile,
    onConfirm,
    onCancel,
}) => {
    const [mode, setMode] = useState<CompressionMode>('compressed');
    const [compressing, setCompressing] = useState(false);
    const [compressedFile, setCompressedFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Preview URLs
    const [originalUrl, setOriginalUrl] = useState<string>('');
    const [compressedUrl, setCompressedUrl] = useState<string>('');

    // Track if compression is skipped (file already small)
    const [alreadySmall, setAlreadySmall] = useState(false);

    // Ref to prevent double-compression
    const compressedForRef = useRef<string>('');

    // ── Compress on open ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen || !originalFile) return;

        // Create preview for original
        const origUrl = URL.createObjectURL(originalFile);
        setOriginalUrl(origUrl);

        // Prevent re-compression of same file
        const fileKey = `${originalFile.name}_${originalFile.size}_${originalFile.lastModified}`;
        if (compressedForRef.current === fileKey && compressedFile) {
            return;
        }

        // Reset state
        setCompressedFile(null);
        setCompressedUrl('');
        setError(null);
        setAlreadySmall(false);
        setMode('compressed');

        // Check if file is already small enough
        const fileMB = originalFile.size / (1024 * 1024);
        if (fileMB <= COMPRESSION_OPTIONS.maxSizeMB) {
            setAlreadySmall(true);
            setCompressedFile(originalFile);
            setCompressedUrl(origUrl);
            setMode('original');
            compressedForRef.current = fileKey;
            return;
        }

        // Compress
        let cancelled = false;
        setCompressing(true);

        (async () => {
            try {
                const result = await imageCompression(originalFile, COMPRESSION_OPTIONS);
                if (cancelled) return;

                setCompressedFile(result);
                const compUrl = URL.createObjectURL(result);
                setCompressedUrl(compUrl);
                compressedForRef.current = fileKey;
            } catch (err: any) {
                if (cancelled) return;
                console.error('[CompressionPreview] Compression failed:', err);
                setError(err?.message || 'Compression failed');
                setMode('original');
            } finally {
                if (!cancelled) setCompressing(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [isOpen, originalFile]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Cleanup URLs on unmount ───────────────────────────────────────────────
    useEffect(() => {
        return () => {
            if (originalUrl && originalUrl !== compressedUrl) URL.revokeObjectURL(originalUrl);
            if (compressedUrl && compressedUrl !== originalUrl) URL.revokeObjectURL(compressedUrl);
        };
    }, [originalUrl, compressedUrl]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleConfirm = useCallback(() => {
        if (mode === 'compressed' && compressedFile) {
            onConfirm(compressedFile);
        } else if (originalFile) {
            onConfirm(originalFile);
        }
    }, [mode, compressedFile, originalFile, onConfirm]);

    const handleClose = useCallback(() => {
        setCompressedFile(null);
        setError(null);
        compressedForRef.current = '';
        onCancel();
    }, [onCancel]);

    if (!isOpen || !originalFile) return null;

    const originalSize = originalFile.size;
    const compressedSize = compressedFile?.size || 0;
    const reduction = getReductionPercent(originalSize, compressedSize);
    const savedBytes = originalSize - compressedSize;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative bg-white w-full max-w-3xl rounded-[32px] shadow-2xl overflow-hidden"
                    >
                        {/* ── Header ────────────────────────────────────────────── */}
                        <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Optimize Image</h3>
                                    <p className="text-xs text-slate-500">Compare and choose the best version for upload</p>
                                </div>
                            </div>
                            <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        {/* ── Body ──────────────────────────────────────────────── */}
                        <div className="p-6 space-y-5">

                            {/* Already-small info */}
                            {alreadySmall && (
                                <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl">
                                    <Info className="w-4 h-4 text-emerald-600 shrink-0" />
                                    <p className="text-xs font-medium text-emerald-700">
                                        This image is already under {COMPRESSION_OPTIONS.maxSizeMB} MB — no compression needed.
                                    </p>
                                </div>
                            )}

                            {/* Compression error */}
                            {error && (
                                <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl">
                                    <Info className="w-4 h-4 text-red-600 shrink-0" />
                                    <p className="text-xs font-medium text-red-700">
                                        Compression failed: {error}. You can still upload the original.
                                    </p>
                                </div>
                            )}

                            {/* ── Side-by-Side Preview ─────────────────────────── */}
                            <div className="grid grid-cols-2 gap-4">
                                {/* Original */}
                                <button
                                    type="button"
                                    onClick={() => setMode('original')}
                                    className={`relative rounded-2xl border-2 overflow-hidden transition-all group ${
                                        mode === 'original'
                                            ? 'border-blue-500 ring-4 ring-blue-100 shadow-lg shadow-blue-100'
                                            : 'border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                    <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                                        <img
                                            src={originalUrl}
                                            alt="Original"
                                            className="w-full h-full object-contain transition-transform group-hover:scale-105"
                                        />
                                    </div>
                                    <div className="p-3 bg-white">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                                                    mode === 'original' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                                                }`}>
                                                    {mode === 'original' && <Check className="w-2.5 h-2.5 text-white" />}
                                                </div>
                                                <span className="text-xs font-bold text-slate-700">Original</span>
                                            </div>
                                            <span className="text-xs font-semibold text-slate-500 tabular-nums">
                                                {formatFileSize(originalSize)}
                                            </span>
                                        </div>
                                    </div>
                                    {mode === 'original' && (
                                        <div className="absolute top-2 right-2 px-2 py-1 bg-blue-500 text-white text-[9px] font-bold rounded-full uppercase tracking-wider">
                                            Selected
                                        </div>
                                    )}
                                </button>

                                {/* Compressed */}
                                <button
                                    type="button"
                                    onClick={() => !compressing && !alreadySmall && !error && setMode('compressed')}
                                    disabled={compressing || alreadySmall || !!error}
                                    className={`relative rounded-2xl border-2 overflow-hidden transition-all group ${
                                        alreadySmall || error
                                            ? 'border-slate-200 opacity-50 cursor-not-allowed'
                                            : mode === 'compressed'
                                                ? 'border-emerald-500 ring-4 ring-emerald-100 shadow-lg shadow-emerald-100'
                                                : 'border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                    <div className="aspect-[4/3] bg-slate-100 overflow-hidden flex items-center justify-center">
                                        {compressing ? (
                                            <div className="flex flex-col items-center gap-3 text-slate-400">
                                                <Loader2 className="w-8 h-8 animate-spin" />
                                                <span className="text-xs font-bold uppercase tracking-wider">Compressing…</span>
                                            </div>
                                        ) : compressedUrl ? (
                                            <img
                                                src={compressedUrl}
                                                alt="Compressed"
                                                className="w-full h-full object-contain transition-transform group-hover:scale-105"
                                            />
                                        ) : (
                                            <div className="flex flex-col items-center gap-2 text-slate-300">
                                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                                                </svg>
                                                <span className="text-[10px] font-bold uppercase tracking-wider">Waiting</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-3 bg-white">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                                                    mode === 'compressed' && !alreadySmall && !error
                                                        ? 'border-emerald-500 bg-emerald-500'
                                                        : 'border-slate-300'
                                                }`}>
                                                    {mode === 'compressed' && !alreadySmall && !error && (
                                                        <Check className="w-2.5 h-2.5 text-white" />
                                                    )}
                                                </div>
                                                <span className="text-xs font-bold text-slate-700">Compressed</span>
                                            </div>
                                            <span className="text-xs font-semibold text-slate-500 tabular-nums">
                                                {compressing ? '…' : compressedSize ? formatFileSize(compressedSize) : '—'}
                                            </span>
                                        </div>
                                    </div>
                                    {mode === 'compressed' && !alreadySmall && !error && (
                                        <div className="absolute top-2 right-2 px-2 py-1 bg-emerald-500 text-white text-[9px] font-bold rounded-full uppercase tracking-wider">
                                            Selected
                                        </div>
                                    )}
                                </button>
                            </div>

                            {/* ── Savings Summary ──────────────────────────────── */}
                            {!compressing && compressedFile && !alreadySmall && !error && (
                                <div className="flex items-center gap-4 px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                                    <div className="flex items-center gap-3 flex-1">
                                        <span className="text-xs font-bold text-slate-500 tabular-nums">
                                            {formatFileSize(originalSize)}
                                        </span>
                                        <ArrowRight className="w-4 h-4 text-slate-400" />
                                        <span className="text-xs font-bold text-emerald-600 tabular-nums">
                                            {formatFileSize(compressedSize)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {reduction > 0 ? (
                                            <div className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-xl">
                                                <span className="text-xs font-bold tabular-nums">
                                                    ↓ {reduction}% smaller
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-xl">
                                                <span className="text-xs font-bold">No reduction</span>
                                            </div>
                                        )}
                                        {savedBytes > 0 && (
                                            <span className="text-[10px] text-slate-400 tabular-nums">
                                                Saves {formatFileSize(savedBytes)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Footer ────────────────────────────────────────────── */}
                        <div className="p-6 pt-3 border-t border-slate-100 flex items-center justify-between">
                            <button
                                onClick={handleClose}
                                className="px-5 py-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={compressing}
                                className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg ${
                                    compressing
                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                                        : mode === 'compressed'
                                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'
                                            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                                }`}
                            >
                                {compressing ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Compressing…
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-4 h-4" />
                                        Upload {mode === 'compressed' ? 'Compressed' : 'Original'}
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default React.memo(CompressionPreviewModal);
