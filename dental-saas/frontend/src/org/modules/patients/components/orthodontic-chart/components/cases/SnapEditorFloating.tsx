import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Minus, ScanLine, CheckCircle2, AlertCircle,
  RotateCcw, ZoomIn, ZoomOut, Activity,
} from 'lucide-react';
import { DentalNotationChart } from './DentalNotationChart';

/* ═══════════════════════════════════════════════════════════════
   SnapEditorFloating
   ─────────────────────────────────────────────────────────────
   FLOATING / MINIMIZABLE dental chart editor panel.
   Replaces the embedded DentalNotationChart in OPG and Occlusal
   analysis sidebars.

   State:
   • Owns its own `chartData` (Record<string, string[]>)
   • Hydrates from `initialData` on first open
   • Emits `onChange` on every chart mutation
   • Never resets state on minimize — hides via AnimatePresence
   • Restored state is preserved until `isOpen` → false

   Props:
   • isOpen / isMinimized / onMinimize / onRestore / onClose
   • initialData — snapshot baseline chartData from server
   • mode — 'opg' | 'clinical' (drives DentalNotationChart status set)
   • onChange — emits current chartData up to parent
═══════════════════════════════════════════════════════════════ */

export interface SnapEditorFloatingProps {
  isOpen:          boolean;
  isMinimized:     boolean;
  onMinimize:      () => void;
  onRestore:       () => void;
  onClose:         () => void;
  /** Chart baseline from server snapshot (dentalChart JSON string or parsed object) */
  initialData?:    Record<string, string[]> | string | null;
  /** Drives DentalNotationChart status legend */
  mode?:           'opg' | 'clinical';
  onChange?:       (data: Record<string, string[]>) => void;
}

function parseInitialData(raw: Record<string, string[]> | string | null | undefined): Record<string, string[]> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw;
}

const SnapEditorFloating: React.FC<SnapEditorFloatingProps> = ({
  isOpen,
  isMinimized,
  onMinimize,
  onRestore,
  onClose,
  initialData,
  mode = 'clinical',
  onChange,
}) => {
  const [chartData, setChartData] = useState<Record<string, string[]>>(
    () => parseInitialData(initialData)
  );

  const hydratedRef = useRef(false);

  // Hydrate from initialData when panel first opens
  useEffect(() => {
    if (!isOpen) {
      hydratedRef.current = false;
      return;
    }
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const parsed = parseInitialData(initialData);
    setChartData(parsed);
    onChange?.(parsed);
  }, [isOpen, initialData]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback((tooth: string, statuses: string[]) => {
    setChartData(prev => {
      const next = { ...prev, [tooth]: statuses };
      onChange?.(next);
      return next;
    });
  }, [onChange]);

  const handleReset = () => {
    setChartData({});
    onChange?.({});
    hydratedRef.current = false;
  };

  const hasEdits = Object.values(chartData).some(s => s.length > 0);

  // Mobile breakpoint
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  if (!isOpen) return null;

  return (
    <>
      {/* ── Floating minimized pill ──────────────────────────────────────── */}
      <AnimatePresence>
        {isMinimized && (
          <motion.div
            key="snap-pill"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{    opacity: 0, y: 20, scale: 0.9  }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="fixed bottom-6 right-6 z-[101]"
          >
            <button
              id="snap-editor-restore-btn"
              onClick={onRestore}
              className="group flex items-center gap-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white pl-3 pr-4 py-3 rounded-2xl shadow-xl shadow-purple-900/30 hover:shadow-purple-900/50 hover:scale-105 active:scale-95 transition-all"
            >
              <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
                <ScanLine className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold tracking-wide">Snap Editor</span>
              {hasEdits && (
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Full panel ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            key="snap-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{    opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-3"
            onClick={(e) => e.target === e.currentTarget && onMinimize()}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 6 }}
              animate={{ scale: 1,    opacity: 1, y: 0 }}
              exit={{    scale: 0.97, opacity: 0        }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
              className={[
                'flex flex-col bg-[#0B1120] rounded-2xl shadow-2xl shadow-black/60',
                'border border-white/10 overflow-hidden',
                isMobile ? 'w-full h-full' : 'w-[90vw] max-w-[860px] max-h-[90vh]',
              ].join(' ')}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header ──────────────────────────────────────────────────── */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  {/* macOS traffic-light dots */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={onClose}
                      className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors"
                      title="Close"
                    />
                    <button
                      onClick={onMinimize}
                      className="w-3 h-3 rounded-full bg-yellow-400 hover:bg-yellow-300 transition-colors"
                      title="Minimize"
                    />
                    <div className="w-3 h-3 rounded-full bg-green-500/30 cursor-not-allowed" />
                  </div>

                  <div className="w-px h-4 bg-white/10" />

                  <span className="text-white/90 text-xs font-bold tracking-wide">
                    Snap Editor
                    <span className="ml-2 text-[10px] font-medium text-white/40 uppercase tracking-widest">
                      {mode === 'opg' ? 'OPG Chart' : 'Clinical Chart'}
                    </span>
                  </span>

                  {/* Status badge */}
                  {hasEdits ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 border border-green-500/30 rounded-full text-[9px] font-bold text-green-400 uppercase tracking-widest">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Chart Ready
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[9px] font-medium text-white/30 uppercase tracking-widest">
                      <AlertCircle className="w-2.5 h-2.5" />
                      No edits
                    </span>
                  )}
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleReset}
                    className="p-1.5 rounded-lg text-white/40 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                    title="Reset chart"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={onMinimize}
                    className="p-1.5 rounded-lg text-white/40 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                    title="Minimize"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Close"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Status bar ────────────────────────────────────────────────── */}
              <div className="flex items-center gap-2 px-4 py-2 bg-white/[0.02] border-b border-white/5 flex-shrink-0">
                <Activity className="w-3 h-3 text-white/20" />
                <p className="text-[10px] text-white/25 font-medium">
                  Click a tooth to annotate · Click again to deselect
                </p>
              </div>

              {/* Chart area ─────────────────────────────────────────────────── */}
              <div className="flex-1 overflow-y-auto p-5">
                <div className="bg-white rounded-2xl p-4 shadow-inner">
                  <DentalNotationChart
                    arch="both"
                    mode={mode}
                    data={chartData}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* Footer done button ─────────────────────────────────────────── */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 flex-shrink-0">
                <p className="text-[9px] text-white/20 font-medium">
                  Edits are applied when you save the snapshot
                </p>
                <button
                  onClick={onMinimize}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-900/30"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SnapEditorFloating;
