/**
 * SnapEditorPanel.tsx
 * Domain: clinical-snapshots / orthodontic-analysis
 * Phase: 3.X — Modular Clinical Workspace
 *
 * Self-contained floating SnapEditor panel for use inside
 * OPGAnalysisModal and OcclusalAnalysisModal.
 *
 * Architecture:
 *  - Owns its own chart state (upperTeeth, lowerTeeth, elastics, etc.)
 *  - Hydrates from `initialChartState` on first mount (snapshot baseline)
 *  - Bubbles serialized chartState to parent via `onChange` on every mutation
 *  - NEVER resets state on minimize — panel hides via CSS visibility, not unmount
 *  - Works without an Appointment object (pretreatment context)
 *  - Mobile: renders fullscreen (width < 768px)
 *
 * Usage:
 *   <SnapEditorPanel
 *     isOpen={snapEditorOpen}
 *     isMinimized={snapEditorMinimized}
 *     onMinimize={() => setSnapEditorMinimized(true)}
 *     onRestore={() => setSnapEditorMinimized(false)}
 *     onClose={() => setSnapEditorOpen(false)}
 *     initialChartState={existingSnapshot?.chartState}
 *     onChange={(cs) => setChartState(cs)}
 *   />
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Minus, Maximize2, RotateCcw, ZoomIn, ZoomOut,
  ScanLine, Activity, CheckCircle2, AlertCircle,
} from 'lucide-react';
import OrthodonticChartCanvas from './OrthodonticChartCanvas';
import {
  ToothData,
  ElasticConnection,
  Appliance,
  Miniscrew,
  IPRMarker,
  SpaceMarker,
  PowerChainConfig,
  Accessory,
  ArchwireConfig,
  ToothAnchors,
  UPPER_TEETH,
  LOWER_TEETH,
  ToothStatus,
} from '../../../types';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SnapChartState {
  upperTeeth:    ToothData[];
  lowerTeeth:    ToothData[];
  elastics:      ElasticConnection[];
  appliances:    Appliance[];
  miniscrews:    Miniscrew[];
  iprMarkers:    IPRMarker[];
  spaceMarkers:  SpaceMarker[];
  powerChains:   PowerChainConfig[];
  accessories:   Accessory[];
  upperArchwire?: ArchwireConfig;
  lowerArchwire?: ArchwireConfig;
}

interface SnapEditorPanelProps {
  isOpen:           boolean;
  isMinimized:      boolean;
  onMinimize:       () => void;
  onRestore:        () => void;
  onClose:          () => void;
  /** Snapshot chartState from the server — hydrates on first open */
  initialChartState?: Record<string, unknown> | null;
  /** Called every time internal chart state mutates */
  onChange:         (chartState: SnapChartState) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function hydrateTeeth(
  raw: unknown,
  defaults: ToothData[]
): ToothData[] {
  if (!Array.isArray(raw) || raw.length === 0) return defaults;
  try {
    return (raw as ToothData[]).map((t) => ({
      ...defaults.find((d) => d.id === t.id) ?? defaults[0],
      ...t,
    }));
  } catch {
    return defaults;
  }
}

function buildEmptyState(): SnapChartState {
  return {
    upperTeeth:   [...UPPER_TEETH],
    lowerTeeth:   [...LOWER_TEETH],
    elastics:     [],
    appliances:   [],
    miniscrews:   [],
    iprMarkers:   [],
    spaceMarkers: [],
    powerChains:  [],
    accessories:  [],
  };
}

function hydrateFromRecord(raw: Record<string, unknown> | null | undefined): SnapChartState {
  if (!raw) return buildEmptyState();
  return {
    upperTeeth:    hydrateTeeth(raw.upperTeeth,   UPPER_TEETH),
    lowerTeeth:    hydrateTeeth(raw.lowerTeeth,   LOWER_TEETH),
    elastics:      (raw.elastics      as ElasticConnection[]) ?? [],
    appliances:    (raw.appliances    as Appliance[])         ?? [],
    miniscrews:    (raw.miniscrews    as Miniscrew[])         ?? [],
    iprMarkers:    (raw.iprMarkers    as IPRMarker[])         ?? [],
    spaceMarkers:  (raw.spaceMarkers  as SpaceMarker[])       ?? [],
    powerChains:   (raw.powerChains   as PowerChainConfig[])  ?? [],
    accessories:   (raw.accessories   as Accessory[])         ?? [],
    upperArchwire: raw.upperArchwire as ArchwireConfig | undefined,
    lowerArchwire: raw.lowerArchwire as ArchwireConfig | undefined,
  };
}

// Tooth-click cycles through: healthy → bracket → alert → missing → healthy
const STATUS_CYCLE: ToothStatus[] = ['healthy', 'bracket', 'alert', 'missing'];

// ── Anchor coordinate resolver ─────────────────────────────────────────────────

function useAnchorCoords(
  upperTeeth: ToothData[],
  lowerTeeth: ToothData[]
) {
  return useCallback(
    (id: number, type: keyof ToothAnchors): { x: number; y: number } => {
      const allTeeth  = [...upperTeeth, ...lowerTeeth];
      const tooth     = allTeeth.find((t) => t.id === id);
      if (!tooth) return { x: 0, y: 0 };

      const baseX = tooth.isUpper
        ? 50 + upperTeeth.indexOf(tooth) * 65
        : 50 + lowerTeeth.indexOf(tooth) * 65;
      const baseY = tooth.isUpper ? 50 : 300;

      const anchors = tooth.anchors[type];
      if (!anchors) return { x: baseX, y: baseY };
      return { x: baseX + anchors.x, y: baseY + anchors.y };
    },
    [upperTeeth, lowerTeeth]
  );
}

// ── TOOTH STATUS BADGE ─────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  healthy:   'bg-green-100 text-green-700',
  bracket:   'bg-blue-100  text-blue-700',
  alert:     'bg-amber-100 text-amber-700',
  missing:   'bg-red-100   text-red-700',
  extracted: 'bg-slate-100 text-slate-500',
  impacted:  'bg-purple-100 text-purple-700',
};

// ── Main Component ─────────────────────────────────────────────────────────────

const SnapEditorPanel: React.FC<SnapEditorPanelProps> = ({
  isOpen,
  isMinimized,
  onMinimize,
  onRestore,
  onClose,
  initialChartState,
  onChange,
}) => {
  // ── Chart state (single source of truth) ────────────────────────────────────
  const [cs, setCs] = useState<SnapChartState>(() =>
    hydrateFromRecord(initialChartState as Record<string, unknown> | null)
  );

  const hasEdits = useMemo(() => {
    const defaultIds  = UPPER_TEETH.map((t) => t.status);
    const currentIds  = cs.upperTeeth.map((t) => t.status);
    const changed     = defaultIds.some((s, i) => s !== currentIds[i]);
    return changed
      || cs.elastics.length > 0
      || cs.appliances.length > 0
      || cs.miniscrews.length > 0
      || cs.accessories.length > 0;
  }, [cs]);

  // ── Hydrate when initialChartState changes (e.g. after refetch) ─────────────
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      hydratedRef.current = false;
      return;
    }
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const hydrated = hydrateFromRecord(initialChartState as Record<string, unknown> | null);
    setCs(hydrated);
    onChange(hydrated);
  }, [isOpen, initialChartState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Internal mutation helper ─────────────────────────────────────────────────
  const update = useCallback((patch: Partial<SnapChartState>) => {
    setCs((prev) => {
      const next = { ...prev, ...patch };
      onChange(next);
      return next;
    });
  }, [onChange]);

  // ── Tooth click — cycle status ───────────────────────────────────────────────
  const handleToothClick = useCallback((id: number) => {
    const isUpper    = cs.upperTeeth.some((t) => t.id === id);
    const key        = isUpper ? 'upperTeeth' : 'lowerTeeth';
    const teeth      = isUpper ? cs.upperTeeth : cs.lowerTeeth;
    const idx        = teeth.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const current    = teeth[idx].status;
    const nextStatus = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current as ToothStatus) + 1) % STATUS_CYCLE.length] as ToothStatus;
    const next       = teeth.map((t, i) => i === idx ? { ...t, status: nextStatus } : t);
    update({ [key]: next });
  }, [cs, update]);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [selectedToothIds, setSelectedToothIds] = useState<number[]>([]);
  const [zoom, setZoom]                         = useState(1);
  const [showBrackets]                          = useState(true);
  const [showArchwire]                          = useState(true);
  const [showAnchors]                           = useState(false);
  const [showAnnotations]                       = useState(true);
  const notationSystem                          = 'fdi' as const;

  const getAnchorCoords = useAnchorCoords(cs.upperTeeth, cs.lowerTeeth);

  const handleReset = () => {
    const empty = buildEmptyState();
    setCs(empty);
    onChange(empty);
    hydratedRef.current = false;
  };

  // ── Noop handlers (canvas requires them) ────────────────────────────────────
  const noop = useCallback(() => {}, []);
  const handleContextMenu  = useCallback((_e: React.MouseEvent, _id: number) => {}, []);
  const handleAnchorClick  = useCallback((_id: number, _type: keyof ToothAnchors) => {}, []);

  // ── Mobile detection ─────────────────────────────────────────────────────────
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  if (!isOpen) return null;

  return (
    <>
      {/* ── Floating minimized pill ─────────────────────────────────────────── */}
      <AnimatePresence>
        {isMinimized && (
          <motion.div
            key="snap-pill"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="fixed bottom-6 right-6 z-[101]"
          >
            <button
              onClick={onRestore}
              id="snap-editor-restore-btn"
              className="group flex items-center gap-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white pl-3 pr-4 py-3 rounded-2xl shadow-xl shadow-purple-900/30 hover:shadow-purple-900/50 hover:scale-105 active:scale-95 transition-all"
            >
              <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
                <ScanLine className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold tracking-wide">Snap Editor</span>
              {hasEdits && (
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" title="Chart has edits" />
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Full panel ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            key="snap-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-3"
            onClick={(e) => e.target === e.currentTarget && onMinimize()}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 6 }}
              animate={{ scale: 1,    opacity: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
              className={`
                flex flex-col bg-[#0B1120] rounded-2xl shadow-2xl shadow-black/60
                border border-white/10 overflow-hidden
                ${isMobile ? 'w-full h-full' : 'w-[94vw] h-[90vh] max-w-[1400px]'}
              `}
              onClick={(e) => e.stopPropagation()}
            >
              {/* ── Header ─────────────────────────────────────────────────── */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  {/* Traffic-light dots */}
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
                    <div className="w-3 h-3 rounded-full bg-green-500/40 cursor-not-allowed" />
                  </div>

                  <div className="w-px h-4 bg-white/10" />

                  <span className="text-white/90 text-xs font-bold tracking-wide">
                    Snap Editor
                    <span className="ml-2 text-[10px] font-medium text-white/40 uppercase tracking-widest">
                      Pretreatment Chart
                    </span>
                  </span>

                  {/* Chart status badge */}
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
                  {/* Zoom */}
                  <button
                    onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
                    className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
                    title="Zoom out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] text-white/30 font-mono min-w-[36px] text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
                    className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
                    title="Zoom in"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>

                  <div className="w-px h-4 bg-white/10 mx-1" />

                  {/* Reset */}
                  <button
                    onClick={handleReset}
                    className="p-1.5 rounded-lg text-white/40 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                    title="Reset chart"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>

                  {/* Minimize */}
                  <button
                    onClick={onMinimize}
                    className="p-1.5 rounded-lg text-white/40 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                    title="Minimize"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  {/* Close */}
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Close"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* ── Status bar ─────────────────────────────────────────────── */}
              <div className="flex items-center gap-2 px-4 py-2 bg-white/[0.02] border-b border-white/5 flex-shrink-0">
                <Activity className="w-3 h-3 text-white/20" />
                <p className="text-[10px] text-white/25 font-medium">
                  Click a tooth to cycle its status &nbsp;·&nbsp; Hover a marking to remove it
                </p>
                {selectedToothIds.length > 0 && (
                  <span className="ml-auto text-[10px] font-bold text-purple-400">
                    {selectedToothIds.length} selected
                  </span>
                )}
              </div>

              {/* ── Canvas area ─────────────────────────────────────────────── */}
              <div className="flex-1 overflow-hidden p-4">
                <div className="w-full h-full rounded-xl overflow-hidden border border-white/10 bg-white">
                  <OrthodonticChartCanvas
                    upperTeeth={cs.upperTeeth}
                    lowerTeeth={cs.lowerTeeth}
                    selectedToothIds={selectedToothIds}
                    onToothClick={handleToothClick}
                    onToothContextMenu={handleContextMenu}
                    onAnchorClick={handleAnchorClick}
                    elastics={cs.elastics}
                    appliances={cs.appliances}
                    miniscrews={cs.miniscrews}
                    iprMarkers={cs.iprMarkers}
                    spaceMarkers={cs.spaceMarkers}
                    powerChains={cs.powerChains}
                    accessories={cs.accessories}
                    upperArchwire={cs.upperArchwire}
                    lowerArchwire={cs.lowerArchwire}
                    showBrackets={showBrackets}
                    showArchwire={showArchwire}
                    showAnchors={showAnchors}
                    showAnnotations={showAnnotations}
                    zoom={zoom}
                    notationSystem={notationSystem}
                    getAnchorCoords={getAnchorCoords}
                    removeElastic={(id) => update({ elastics: cs.elastics.filter((e) => e.id !== id) })}
                    removeAppliance={(id) => update({ appliances: cs.appliances.filter((a) => a.id !== id) })}
                    removeMiniscrew={(id) => update({ miniscrews: cs.miniscrews.filter((m) => m.id !== id) })}
                    removeIPRMarker={(id) => update({ iprMarkers: cs.iprMarkers.filter((i) => i.id !== id) })}
                    removeSpaceMarker={(id) => update({ spaceMarkers: cs.spaceMarkers.filter((s) => s.id !== id) })}
                    removePowerChain={(id) => update({ powerChains: cs.powerChains.filter((p) => p.id !== id) })}
                    removeAccessory={(id) => update({ accessories: cs.accessories.filter((a) => a.id !== id) })}
                    selectedMiniscrewId={null}
                  />
                </div>
              </div>

              {/* ── Legend footer ─────────────────────────────────────────── */}
              <div className="flex items-center gap-4 px-4 py-3 border-t border-white/5 flex-shrink-0">
                {Object.entries({
                  healthy: '● Healthy',
                  bracket: '● Bracket',
                  alert:   '● Alert',
                  missing: '● Missing',
                }).map(([status, label]) => (
                  <span key={status} className={`text-[9px] font-bold ${STATUS_COLORS[status] ?? ''} px-2 py-0.5 rounded-full`}>
                    {label}
                  </span>
                ))}
                <span className="ml-auto text-[9px] text-white/20 font-medium">
                  Click tooth to cycle status
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SnapEditorPanel;
export type { SnapEditorPanelProps };
