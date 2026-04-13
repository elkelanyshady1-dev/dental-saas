import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  FlipHorizontal,
  FlipVertical,
  Crop,
  Trash2,
  Upload,
  X,
  Activity,
  RotateCcw,
  RotateCw,
  Undo2,
  Redo2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Cropper from 'react-easy-crop';
import { PhotoRecord } from '../../types';
import { resolveFileUrl } from '@/utils/resolveFileUrl';

/* ═══════════════════════════════════════════════════════════════
   ImageEditorModal — Photo edit modal with crop, flip, rotate, remove.
   v3.0 — Added undo/redo history for all transform operations.

   History tracks: { flipH, flipV, rotation }
   Each transform action pushes a snapshot before applying.
   Undo/redo steps through the stack and syncs parent state.
   Crop is irreversible (destructive) and clears history.
   ═══════════════════════════════════════════════════════════════ */

export interface ImageEditorModalProps {
  isOpen: boolean;
  selectedPhoto: PhotoRecord | null;
  getAspectRatioClass: (ratio: string) => string;
  onClose: () => void;
  onFlipH: (id: string) => void;
  onFlipV: (id: string) => void;
  onRemove: (id: string) => void;
  onUpload: () => void;
  onSaveCrop: (photoId: string, croppedUrl: string) => void;
  onRotationChange: (photoId: string, rotation: number) => void;
  onUpdateAnalysis: (photoId: string, key: string, value: string) => void;
  cephMeasurements: { id: string; label: string; norm: number; sd: number; unit: string }[];
}

// ── History Snapshot ─────────────────────────────────────────────────────────

interface TransformSnapshot {
  flipH: boolean;
  flipV: boolean;
  rotation: number;
}

const getAspectRatioNumber = (ratio: string) => {
  if (!ratio) return 1;
  const [w, h] = ratio.split(':').map(Number);
  if (ratio === '7:5') return 5/7;
  if (ratio === '4:5') return 4/5;
  return w / h;
};

const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
  isOpen,
  selectedPhoto,
  getAspectRatioClass,
  onClose,
  onFlipH,
  onFlipV,
  onRemove,
  onUpload,
  onSaveCrop,
  onRotationChange,
  onUpdateAnalysis,
  cephMeasurements,
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isCropping, setIsCropping] = useState(false);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [isRotating, setIsRotating] = useState(false);

  // Local rotation state — synced from selectedPhoto on open/change
  const [rotation, setRotation] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── History (Undo/Redo) ────────────────────────────────────────────────────
  const [history, setHistory] = useState<TransformSnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const skipHistoryRef = useRef(false); // Flag to prevent history push during undo/redo

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Get current snapshot from photo state
  const getCurrentSnapshot = useCallback((): TransformSnapshot => ({
    flipH: selectedPhoto?.flipH ?? false,
    flipV: selectedPhoto?.flipV ?? false,
    rotation: rotation,
  }), [selectedPhoto?.flipH, selectedPhoto?.flipV, rotation]);

  // Push a snapshot to history (called BEFORE applying a change)
  const pushHistory = useCallback((snapshot: TransformSnapshot) => {
    setHistory(prev => {
      // Truncate any redo stack beyond current index
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, snapshot];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  // Initialize history when modal opens or photo changes
  useEffect(() => {
    if (isOpen && selectedPhoto) {
      const initial: TransformSnapshot = {
        flipH: selectedPhoto.flipH,
        flipV: selectedPhoto.flipV,
        rotation: selectedPhoto.rotation || 0,
      };
      setHistory([initial]);
      setHistoryIndex(0);
      setRotation(selectedPhoto.rotation || 0);
    }
  }, [isOpen, selectedPhoto?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync rotation from photo (e.g., if parent changes it externally)
  useEffect(() => {
    if (selectedPhoto && !skipHistoryRef.current) {
      setRotation(selectedPhoto.rotation || 0);
    }
  }, [selectedPhoto?.rotation]);

  // Apply a snapshot to both local and parent state
  const applySnapshot = useCallback((snapshot: TransformSnapshot) => {
    if (!selectedPhoto) return;
    skipHistoryRef.current = true;

    // Sync flipH
    if (snapshot.flipH !== selectedPhoto.flipH) {
      onFlipH(selectedPhoto.id);
    }
    // Sync flipV
    if (snapshot.flipV !== selectedPhoto.flipV) {
      onFlipV(selectedPhoto.id);
    }
    // Sync rotation
    setRotation(snapshot.rotation);
    onRotationChange(selectedPhoto.id, snapshot.rotation);

    // Reset skip flag after React processes the state updates
    requestAnimationFrame(() => {
      skipHistoryRef.current = false;
    });
  }, [selectedPhoto, onFlipH, onFlipV, onRotationChange]);

  // ── Undo ─────────────────────────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const newIndex = historyIndex - 1;
    const snapshot = history[newIndex];
    setHistoryIndex(newIndex);
    applySnapshot(snapshot);
  }, [canUndo, historyIndex, history, applySnapshot]);

  // ── Redo ─────────────────────────────────────────────────────────────────
  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const newIndex = historyIndex + 1;
    const snapshot = history[newIndex];
    setHistoryIndex(newIndex);
    applySnapshot(snapshot);
  }, [canRedo, historyIndex, history, applySnapshot]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleUndo, handleRedo]);

  // ── Wrapped Transform Actions (push history before applying) ─────────────

  const handleFlipH = useCallback(() => {
    if (!selectedPhoto || skipHistoryRef.current) return;
    // Push current state before change
    const current = getCurrentSnapshot();
    pushHistory({ ...current, flipH: !current.flipH });
    onFlipH(selectedPhoto.id);
  }, [selectedPhoto, getCurrentSnapshot, pushHistory, onFlipH]);

  const handleFlipV = useCallback(() => {
    if (!selectedPhoto || skipHistoryRef.current) return;
    const current = getCurrentSnapshot();
    pushHistory({ ...current, flipV: !current.flipV });
    onFlipV(selectedPhoto.id);
  }, [selectedPhoto, getCurrentSnapshot, pushHistory, onFlipV]);

  // ── Crop ─────────────────────────────────────────────────────────────────

  const onCropComplete = (_: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const saveCroppedImage = async () => {
    if (!selectedPhoto?.url || !croppedAreaPixels) return;

    try {
      const image = new Image();
      image.src = selectedPhoto.url;
      await new Promise((resolve) => (image.onload = resolve));

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) return;

      canvas.width = croppedAreaPixels.width;
      canvas.height = croppedAreaPixels.height;

      ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        croppedAreaPixels.width,
        croppedAreaPixels.height
      );

      const croppedUrl = canvas.toDataURL('image/jpeg');
      onSaveCrop(selectedPhoto.id, croppedUrl);
      setIsCropping(false);

      // Crop is destructive — reset history with new baseline
      const newSnapshot: TransformSnapshot = {
        flipH: selectedPhoto.flipH,
        flipV: selectedPhoto.flipV,
        rotation: rotation,
      };
      setHistory([newSnapshot]);
      setHistoryIndex(0);
    } catch (e) {
      console.error(e);
    }
  };

  const handleClose = () => {
    // Commit rotation on close
    if (selectedPhoto && rotation !== (selectedPhoto.rotation || 0)) {
      onRotationChange(selectedPhoto.id, rotation);
    }
    onClose();
    setIsCropping(false);
    setIsRotating(false);
  };

  // ── Rotation Controls ──────────────────────────────────────────────────────

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newRotation = Number(e.target.value);
    setRotation(newRotation);
  }, []);

  const handleResetRotation = useCallback(() => {
    setRotation(0);
  }, []);

  const handleSnap90 = useCallback(() => {
    const snapped = Math.round(rotation / 90) * 90;
    setRotation(snapped);
  }, [rotation]);

  const handleRotateCW = useCallback(() => {
    setRotation(prev => {
      let next = prev + 90;
      if (next > 180) next -= 360;
      return next;
    });
  }, []);

  const handleRotateCCW = useCallback(() => {
    setRotation(prev => {
      let next = prev - 90;
      if (next < -180) next += 360;
      return next;
    });
  }, []);

  // ── Mouse Drag Rotation ────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current || isCropping) return;
    if (!isRotating) return;

    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    const startRotation = rotation;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const currentAngle = Math.atan2(
        moveEvent.clientY - centerY,
        moveEvent.clientX - centerX
      );
      const delta = (currentAngle - startAngle) * (180 / Math.PI);
      let newRotation = startRotation + delta;
      while (newRotation > 180) newRotation -= 360;
      while (newRotation < -180) newRotation += 360;
      setRotation(Math.round(newRotation * 10) / 10);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [isCropping, isRotating, rotation]);

  // ── Apply Rotation (commits to parent + history) ───────────────────────────

  const handleApplyRotation = useCallback(() => {
    if (!selectedPhoto) return;

    // Push to history
    const newSnapshot: TransformSnapshot = {
      flipH: selectedPhoto.flipH,
      flipV: selectedPhoto.flipV,
      rotation: rotation,
    };
    pushHistory(newSnapshot);
    onRotationChange(selectedPhoto.id, rotation);
    setIsRotating(false);
  }, [selectedPhoto, rotation, onRotationChange, pushHistory]);

  const isOutsideNorm = (val: string, norm: number, sd: number) => {
    const num = parseFloat(val);
    if (isNaN(num)) return false;
    return num < (norm - sd) || num > (norm + sd);
  };

  return (
    <AnimatePresence>
      {isOpen && selectedPhoto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className={`relative bg-white rounded-[40px] shadow-2xl w-full overflow-hidden flex flex-col lg:flex-row ${selectedPhoto.id === 'ceph' ? 'max-w-6xl' : 'max-w-4xl'}`}
          >
            <div className="flex-1 bg-slate-100 p-8 flex items-center justify-center min-h-[400px]">
              <div
                ref={containerRef}
                onMouseDown={handleMouseDown}
                className={`relative bg-white shadow-xl rounded-2xl overflow-hidden ${getAspectRatioClass(selectedPhoto.aspectRatio)} w-full max-w-2xl ${isRotating ? 'cursor-grab active:cursor-grabbing' : ''}`}
              >
                {selectedPhoto.url && (
                  isCropping ? (
                    <Cropper
                      image={resolveFileUrl(selectedPhoto.url)}
                      crop={crop}
                      zoom={zoom}
                      aspect={getAspectRatioNumber(selectedPhoto.aspectRatio)}
                      onCropChange={setCrop}
                      onCropComplete={onCropComplete}
                      onZoomChange={setZoom}
                    />
                  ) : (
                    <>
                      <img 
                        src={resolveFileUrl(selectedPhoto.url)} 
                        alt="Edit" 
                        className="w-full h-full object-contain select-none"
                        draggable={false}
                        style={{ 
                          transform: `rotate(${rotation}deg) scaleX(${selectedPhoto.flipH ? -1 : 1}) scaleY(${selectedPhoto.flipV ? -1 : 1})`,
                          transition: isRotating ? 'none' : 'transform 0.3s ease',
                          referrerPolicy: 'no-referrer'
                        } as any}
                      />
                      {/* ── Grid Overlay (visible in rotate mode) ──────────── */}
                      {isRotating && (
                        <div className="absolute inset-0 pointer-events-none transition-opacity duration-300">
                          <div className="absolute inset-0">
                            <div className="absolute top-0 bottom-0 left-1/3 w-px bg-white/30" />
                            <div className="absolute top-0 bottom-0 left-2/3 w-px bg-white/30" />
                            <div className="absolute left-0 right-0 top-1/3 h-px bg-white/30" />
                            <div className="absolute left-0 right-0 top-2/3 h-px bg-white/30" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-px bg-emerald-400/70" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-8 bg-emerald-400/70" />
                          </div>
                          <div className="absolute inset-0 border-2 border-emerald-400/30 rounded-2xl" />
                        </div>
                      )}
                    </>
                  )
                )}
              </div>
            </div>
            
            <div className={`w-full lg:w-80 bg-white p-8 flex flex-col gap-8 overflow-y-auto ${selectedPhoto.id === 'ceph' ? 'lg:w-[450px]' : ''}`}>
              {/* ── Header with Undo/Redo ─────────────────────────────── */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">{selectedPhoto.label}</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{selectedPhoto.aspectRatio} Ratio</p>
                </div>
                <div className="flex items-center gap-1">
                  {/* Undo */}
                  <button
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className={`p-2 rounded-xl transition-all ${
                      canUndo
                        ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                        : 'text-slate-200 cursor-not-allowed'
                    }`}
                    title="Undo (Ctrl+Z)"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                  {/* Redo */}
                  <button
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className={`p-2 rounded-xl transition-all ${
                      canRedo
                        ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                        : 'text-slate-200 cursor-not-allowed'
                    }`}
                    title="Redo (Ctrl+Shift+Z)"
                  >
                    <Redo2 className="w-4 h-4" />
                  </button>
                  {/* Close */}
                  <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors ml-1">
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
              </div>

              {selectedPhoto.id === 'ceph' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-blue-600" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cephalometric Analysis</span>
                  </div>
                  <div className="bg-slate-900 rounded-2xl border border-white/10 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/5">
                          <th className="px-4 py-2.5 text-[9px] font-bold text-white/30 uppercase tracking-widest">Measurement</th>
                          <th className="px-4 py-2.5 text-[9px] font-bold text-white/30 uppercase tracking-widest">Value</th>
                          <th className="px-4 py-2.5 text-[9px] font-bold text-white/30 uppercase tracking-widest">Norm</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cephMeasurements.map(m => (
                          <tr key={m.id} className="border-b border-white/5 last:border-0">
                            <td className="px-4 py-2 text-[11px] font-bold text-white/80">{m.label}</td>
                            <td className="px-4 py-2">
                              <input
                                type="text"
                                value={(selectedPhoto.analysis as any)?.[m.id] || ''}
                                onChange={(e) => onUpdateAnalysis(selectedPhoto.id, m.id, e.target.value)}
                                className={`w-16 px-2 py-1 rounded-lg text-[11px] font-bold text-center border transition-all ${
                                  isOutsideNorm((selectedPhoto.analysis as any)?.[m.id] || '', m.norm, m.sd)
                                    ? 'bg-red-500/20 border-red-500/30 text-red-300'
                                    : 'bg-white/10 border-white/10 text-white'
                                }`}
                                placeholder="—"
                              />
                            </td>
                            <td className="px-4 py-2 text-[10px] text-white/40">{m.norm}±{m.sd}{m.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Transform</span>
                  <div className="grid grid-cols-4 gap-2">
                    <button 
                      onClick={handleFlipH}
                      className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${selectedPhoto.flipH ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'}`}
                    >
                      <FlipHorizontal className="w-5 h-5" />
                      <span className="text-[10px] font-bold">Flip H</span>
                    </button>
                    <button 
                      onClick={handleFlipV}
                      className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${selectedPhoto.flipV ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'}`}
                    >
                      <FlipVertical className="w-5 h-5" />
                      <span className="text-[10px] font-bold">Flip V</span>
                    </button>
                    <button 
                      onClick={() => { setIsCropping(!isCropping); setIsRotating(false); }}
                      className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${isCropping ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'}`}
                    >
                      <Crop className="w-5 h-5" />
                      <span className="text-[10px] font-bold">Crop</span>
                    </button>
                    <button 
                      onClick={() => { setIsRotating(!isRotating); setIsCropping(false); }}
                      className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${isRotating ? 'bg-violet-50 border-violet-200 text-violet-600' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'}`}
                    >
                      <RotateCw className="w-5 h-5" />
                      <span className="text-[10px] font-bold">Rotate</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</span>
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={onUpload}
                      className="flex items-center gap-3 w-full p-4 bg-slate-50 text-slate-700 rounded-2xl font-bold text-xs hover:bg-slate-100 transition-all"
                    >
                      <Upload className="w-5 h-5" />
                      Replace Photo
                    </button>
                    <button 
                      onClick={() => {
                        onRemove(selectedPhoto.id);
                        handleClose();
                      }}
                      className="flex items-center gap-3 w-full p-4 bg-red-50 text-red-600 rounded-2xl font-bold text-xs hover:bg-red-100 transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                      Remove Photo
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-auto">
                {isCropping ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-4 px-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Zoom</span>
                      <input 
                        type="range" 
                        min={1} 
                        max={3} 
                        step={0.1} 
                        value={zoom} 
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="flex-1 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                      />
                    </div>
                    <button 
                      onClick={saveCroppedImage}
                      className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
                    >
                      Apply Crop
                    </button>
                  </div>
                ) : isRotating ? (
                  /* ── Rotation Controls Panel ────────────────────────── */
                  <div className="flex flex-col gap-4">
                    {/* Degree display */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Rotation</span>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-xl">
                        <span className="text-sm font-black text-violet-600 tabular-nums min-w-[4ch] text-right">
                          {rotation.toFixed(1)}
                        </span>
                        <span className="text-xs text-violet-400 font-bold">°</span>
                      </div>
                    </div>

                    {/* Slider */}
                    <div className="relative">
                      <input 
                        type="range" 
                        min={-180} 
                        max={180} 
                        step={0.1} 
                        value={rotation} 
                        onChange={handleSliderChange}
                        className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-violet-600"
                      />
                      <div className="flex justify-between px-1 mt-1">
                        <span className="text-[8px] text-slate-300 font-bold">-180°</span>
                        <span className="text-[8px] text-slate-300 font-bold">-90°</span>
                        <span className="text-[8px] text-violet-400 font-bold">0°</span>
                        <span className="text-[8px] text-slate-300 font-bold">90°</span>
                        <span className="text-[8px] text-slate-300 font-bold">180°</span>
                      </div>
                    </div>

                    {/* Quick action buttons */}
                    <div className="grid grid-cols-4 gap-2">
                      <button
                        onClick={handleRotateCCW}
                        className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-600 transition-all"
                        title="-90°"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span className="text-[8px] font-bold">-90°</span>
                      </button>
                      <button
                        onClick={handleRotateCW}
                        className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-600 transition-all"
                        title="+90°"
                      >
                        <RotateCw className="w-4 h-4" />
                        <span className="text-[8px] font-bold">+90°</span>
                      </button>
                      <button
                        onClick={handleSnap90}
                        className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-600 transition-all"
                        title="Snap to nearest 90°"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                        <span className="text-[8px] font-bold">Snap</span>
                      </button>
                      <button
                        onClick={handleResetRotation}
                        className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-all"
                        title="Reset to 0°"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span className="text-[8px] font-bold">Reset</span>
                      </button>
                    </div>

                    {/* Drag hint */}
                    <p className="text-[10px] text-slate-400 text-center italic">
                      Drag the image to rotate freely
                    </p>

                    {/* Apply button */}
                    <button 
                      onClick={handleApplyRotation}
                      className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-violet-700 transition-all shadow-lg shadow-violet-200"
                    >
                      Apply Rotation
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={handleClose}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                  >
                    Save Changes
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default React.memo(ImageEditorModal);
