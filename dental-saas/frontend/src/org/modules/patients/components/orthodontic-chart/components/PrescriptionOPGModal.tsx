import React, { useState, useCallback, useRef, useEffect } from 'react';
import { X, Eye, EyeOff, ZoomIn, ZoomOut, Maximize2, FileText, Zap, CheckCircle2, ChevronDown, Image } from 'lucide-react';
import type { BracketPrescription } from '../types';


// ─── Height Reference Tables (READ-ONLY) ───────────────────────────────
const MBT_TABLE: Record<string, { tooth: string; fdi: string; height: number }[]> = {
  upper: [
    { tooth: 'U1', fdi: '11/21', height: 5.0 },
    { tooth: 'U2', fdi: '12/22', height: 4.5 },
    { tooth: 'U3', fdi: '13/23', height: 5.0 },
    { tooth: 'U4', fdi: '14/24', height: 4.5 },
    { tooth: 'U5', fdi: '15/25', height: 4.0 },
    { tooth: 'U6', fdi: '16/26', height: 3.0 },
    { tooth: 'U7', fdi: '17/27', height: 2.0 },
  ],
  lower: [
    { tooth: 'L1', fdi: '31/41', height: 4.0 },
    { tooth: 'L2', fdi: '32/42', height: 4.0 },
    { tooth: 'L3', fdi: '33/43', height: 4.5 },
    { tooth: 'L4', fdi: '34/44', height: 4.0 },
    { tooth: 'L5', fdi: '35/45', height: 3.5 },
    { tooth: 'L6', fdi: '36/46', height: 2.5 },
    { tooth: 'L7', fdi: '37/47', height: 2.5 },
  ],
};

const ROTH_TABLE: Record<string, { tooth: string; fdi: string; height: number }[]> = {
  upper: [
    { tooth: 'U1', fdi: '11/21', height: 4.5 },
    { tooth: 'U2', fdi: '12/22', height: 4.25 },
    { tooth: 'U3', fdi: '13/23', height: 5.0 },
    { tooth: 'U4', fdi: '14/24', height: 4.5 },
    { tooth: 'U5', fdi: '15/25', height: 4.0 },
    { tooth: 'U6', fdi: '16/26', height: 4.0 },
    { tooth: 'U7', fdi: '17/27', height: 3.0 },
  ],
  lower: [
    { tooth: 'L1', fdi: '31/41', height: 4.0 },
    { tooth: 'L2', fdi: '32/42', height: 4.0 },
    { tooth: 'L3', fdi: '33/43', height: 4.5 },
    { tooth: 'L4', fdi: '34/44', height: 4.5 },
    { tooth: 'L5', fdi: '35/45', height: 4.0 },
    { tooth: 'L6', fdi: '36/46', height: 4.0 },
    { tooth: 'L7', fdi: '37/47', height: 4.0 },
  ],
};

/** Parses an FDI string like '11/21' into [11, 21] */
function parseFDI(fdi: string): number[] {
  return fdi.split('/').map(Number).filter(n => !isNaN(n));
}

interface BondGroupPayload {
  /** FDI tooth IDs to select, e.g. [11, 21] */
  toothIds: number[];
  /** Prescription label shown in the modal */
  prescription: 'MBT' | 'Roth';
  /** Bonding height (mm) from the table */
  height: number;
  /** The tooth group label e.g. 'U1' */
  groupLabel: string;
}

interface PrescriptionOPGModalProps {
  open: boolean;
  onClose: () => void;
  prescription?: BracketPrescription;
  opgUrl?: string;
  /**
   * Optional — when provided, rows become clickable and fire this
   * callback so SnapshotEditor can auto-select teeth + pre-fill
   * the bracket panel.
   */
  onBondGroup?: (payload: BondGroupPayload) => void;
  /**
   * Optional — map of group label → bonded info.
   * Populated from the Bonding Engine after bonding events.
   * e.g. { 'U1': { height: 5.0, isOverride: false }, 'L3': { height: 4.5, isOverride: true } }
   */
  bondedByGroup?: Record<string, { height: number | null; isOverride: boolean }>;
  /**
   * Optional — list of OPG records for this patient.
   * Enables the OPG selector dropdown in the toolbar.
   * ONLY panoramic/OPG images should be included (no CEPH/CBCT).
   */
  opgRecords?: { _id: string; name: string; date: string; fileUrl: string; isPrimary?: boolean }[];
}

const PrescriptionOPGModal: React.FC<PrescriptionOPGModalProps> = ({
  open,
  onClose,
  prescription: initialPrescription,
  opgUrl,
  onBondGroup,
  bondedByGroup = {},
  opgRecords = [],
}) => {
  const [activePrescription, setActivePrescription] = useState<'MBT' | 'Roth'>(
    initialPrescription === 'Roth' ? 'Roth' : 'MBT'
  );
  const [showGuides, setShowGuides] = useState(true);
  const [guideOpacity, setGuideOpacity] = useState(0.35);
  const [opgZoom, setOpgZoom] = useState(1);
  const [highlightedTooth, setHighlightedTooth] = useState<string | null>(null);
  /** Flash feedback: tooth group label that was just bonded */
  const [lastBonded, setLastBonded] = useState<string | null>(null);
  /** Currently selected OPG record ID (overrides the opgUrl prop when set) */
  const [selectedOPGId, setSelectedOPGId] = useState<string>('');

  /** Resolve the active OPG URL: selected record overrides prop */
  const activeOPGUrl = selectedOPGId
    ? (opgRecords.find(r => r._id === selectedOPGId)?.fileUrl ?? opgUrl)
    : opgUrl;

  /** Ref used for outside-click containment detection (replaces naive backdrop click) */
  const modalContainerRef = useRef<HTMLDivElement>(null);

  /**
   * Safe outside-click handler — only closes the OPG modal when the user
   * clicks truly outside the modal container. Does NOT use e.stopPropagation()
   * at the backdrop level so we can still close on genuine outside clicks.
   */
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (modalContainerRef.current && !modalContainerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, onClose]);

  const handleBondRow = useCallback((e: React.MouseEvent, row: { tooth: string; fdi: string; height: number }) => {
    // CRITICAL: stop propagation so clicking a row never triggers outside-click
    e.stopPropagation();
    if (!onBondGroup) return;
    const toothIds = parseFDI(row.fdi);
    onBondGroup({
      toothIds,
      prescription: activePrescription,
      height: row.height,
      groupLabel: row.tooth,
    });
    // Flash feedback
    setLastBonded(row.tooth);
    setTimeout(() => setLastBonded(null), 1800);
  }, [onBondGroup, activePrescription]);

  if (!open) return null;

  const table = activePrescription === 'MBT' ? MBT_TABLE : ROTH_TABLE;

  /** Helper: format date string to locale short form */
  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return iso; }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      {/* Backdrop — click detection is handled by the ref-based useEffect above */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal Container — stopPropagation prevents any internal click from leaking upward */}
      <div
        ref={modalContainerRef}
        className="relative w-[95%] max-w-[1400px] h-[90%] bg-white rounded-2xl shadow-2xl flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Header ─── */}
        <div className="absolute top-0 left-0 right-0 h-14 bg-gradient-to-r from-slate-800 to-slate-700 flex items-center justify-between px-6 z-10 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <FileText className="w-4 h-4 text-blue-300" />
            </div>
            <div>
              <h2 className="text-white font-bold text-sm tracking-tight">
                Prescription & OPG Reference
              </h2>
              <p className="text-slate-400 text-[10px] font-medium">
                Read-only diagnostic reference — no chart modifications
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Prescription Selector */}
            <div className="flex bg-slate-600/50 rounded-lg p-0.5">
              <button
                onClick={() => setActivePrescription('MBT')}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                  activePrescription === 'MBT'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                MBT
              </button>
              <button
                onClick={() => setActivePrescription('Roth')}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                  activePrescription === 'Roth'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Roth
              </button>
            </div>

            {/* ── OPG Record Selector — shown only when patient has OPG records ── */}
            {opgRecords.length > 0 && (
              <div className="relative">
                <div className="flex items-center gap-2 bg-slate-900/80 rounded-lg px-3 py-1.5 border border-slate-500/50 shadow-lg">
                  {/* Icon + Label */}
                  <div className="flex items-center gap-1.5 text-slate-200">
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      OPG
                    </span>
                  </div>
                  
                  {/* Dropdown */}
                  <div className="relative">
                    <select
                      value={selectedOPGId}
                      onChange={(e) => setSelectedOPGId(e.target.value)}
                      className="appearance-none bg-slate-800 text-white text-[11px] font-semibold 
                                 pl-2 pr-6 py-1 rounded border border-slate-500/50
                                 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400
                                 cursor-pointer min-w-[140px]"
                      aria-label="Select OPG X-ray"
                    >
                      <option value="" className="bg-slate-800 text-white font-semibold">
                        Latest OPG
                      </option>
                      {opgRecords.map(opg => (
                        <option 
                          key={opg._id} 
                          value={opg._id}
                          className="bg-slate-900 text-white font-medium"
                        >
                          {opg.name} — {fmtDate(opg.date)}
                          {opg.isPrimary ? ' ★' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3 h-3 text-slate-300 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  
                  {/* Primary badge for selected */}
                  {selectedOPGId && opgRecords.find(r => r._id === selectedOPGId)?.isPrimary && (
                    <span className="text-[8px] font-bold text-emerald-400 bg-emerald-900/50 px-1.5 py-0.5 rounded uppercase tracking-wider">
                      Primary
                    </span>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-600/50 hover:bg-red-500/80 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* ─── Content ─── */}
        <div className="flex w-full h-full pt-14">
          {/* ─── LEFT: OPG Viewer ─── */}
          <div className="flex-1 bg-slate-900 relative flex flex-col">
            {/* OPG Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowGuides(!showGuides)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                    showGuides
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {showGuides ? (
                    <Eye className="w-3 h-3" />
                  ) : (
                    <EyeOff className="w-3 h-3" />
                  )}
                  Guides
                </button>

                {showGuides && (
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-[9px] text-slate-500 font-bold uppercase">Opacity</span>
                    <input
                      type="range"
                      min="0.1"
                      max="0.8"
                      step="0.05"
                      value={guideOpacity}
                      onChange={(e) => setGuideOpacity(Number(e.target.value))}
                      className="w-20 h-1 accent-blue-500"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setOpgZoom((z) => Math.min(z + 0.15, 3))}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setOpgZoom((z) => Math.max(z - 0.15, 0.5))}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setOpgZoom(1)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-slate-500 font-bold ml-1">
                  {Math.round(opgZoom * 100)}%
                </span>
              </div>
            </div>

            {/* OPG Image Area */}
            <div className="flex-1 flex items-center justify-center overflow-auto p-4 relative">
              {activeOPGUrl ? (
                <div className="relative" style={{ transform: `scale(${opgZoom})`, transformOrigin: 'center' }}>
                  <img
                    src={activeOPGUrl}
                    alt="Panoramic X-ray (OPG)"
                    className="max-w-full max-h-full object-contain rounded-lg"
                    draggable={false}
                  />

                  {/* Vertical Guide Lines for Root Parallelism */}
                  {showGuides && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                      {[...Array(16)].map((_, i) => (
                        <line
                          key={i}
                          x1={`${(i + 1) * 5.88}%`}
                          y1="0%"
                          x2={`${(i + 1) * 5.88}%`}
                          y2="100%"
                          stroke="#ef4444"
                          strokeOpacity={guideOpacity}
                          strokeWidth="1"
                          strokeDasharray="6 4"
                        />
                      ))}
                      {/* Horizontal midline */}
                      <line
                        x1="0%"
                        y1="50%"
                        x2="100%"
                        y2="50%"
                        stroke="#3b82f6"
                        strokeOpacity={guideOpacity * 0.8}
                        strokeWidth="1"
                        strokeDasharray="8 4"
                      />
                      {/* Vertical center */}
                      <line
                        x1="50%"
                        y1="0%"
                        x2="50%"
                        y2="100%"
                        stroke="#f59e0b"
                        strokeOpacity={guideOpacity}
                        strokeWidth="1.5"
                        strokeDasharray="6 3"
                      />
                    </svg>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center gap-4">
                  <div className="w-24 h-24 rounded-2xl bg-slate-800 border-2 border-dashed border-slate-600 flex items-center justify-center">
                    <FileText className="w-10 h-10 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-slate-400 font-bold text-sm">No OPG Available</p>
                    <p className="text-slate-500 text-[11px] mt-1 max-w-xs">
                      Upload a <span className="text-blue-400 font-semibold">Panoramic X-ray (OPG)</span> to the patient&apos;s record set to enable visual reference.
                    </p>
                    <p className="text-slate-600 text-[10px] mt-2">
                      ℹ️ <span className="text-slate-500">Cephalometric (CEPH) and other X-rays are not displayed here.</span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Legend */}
            {showGuides && (
              <div className="flex items-center gap-4 px-4 py-2 bg-slate-800/60 border-t border-slate-700">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0 border-t-2 border-dashed border-red-400" />
                  <span className="text-[9px] text-slate-400 font-medium">Root Parallelism</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0 border-t-2 border-dashed border-blue-400" />
                  <span className="text-[9px] text-slate-400 font-medium">Occlusal Plane</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0 border-t-2 border-dashed border-amber-400" />
                  <span className="text-[9px] text-slate-400 font-medium">Midline</span>
                </div>
              </div>
            )}
          </div>

          {/* ─── RIGHT: Height Reference Table ─── */}
          <div className="w-[380px] bg-white border-l border-slate-200 flex flex-col">
            {/* Table Header */}
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    {activePrescription} Bonding Heights
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {activePrescription === 'MBT' ? 'McLaughlin, Bennett & Trevisi (Versatile+)' : 'Ronald Roth Prescription'}
                  </p>
                </div>
                {onBondGroup ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                    <Zap className="w-3 h-3 text-blue-500" />
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                      Click Row to Bond
                    </span>
                  </div>
                ) : (
                  <div className="px-2.5 py-1 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                      Reference Only
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Tables */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Upper Arch */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Maxillary (Upper)
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Tooth
                        </th>
                        <th className="text-center px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          FDI
                        </th>
                        <th className="text-right px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Ref (mm)
                        </th>
                        <th className="text-right px-3 py-2 text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                          Bonded
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.upper.map((row, i) => (
                        <tr
                          key={row.tooth}
                          onClick={(e) => handleBondRow(e, row)}
                          className={`border-t border-slate-100 transition-colors group ${
                            onBondGroup ? 'cursor-pointer' : 'cursor-default'
                          } ${
                            lastBonded === row.tooth
                              ? 'bg-blue-50 ring-1 ring-inset ring-blue-200'
                              : highlightedTooth === row.tooth
                              ? 'bg-blue-50'
                              : i % 2 === 0
                              ? 'bg-white hover:bg-blue-50/60'
                              : 'bg-slate-50/30 hover:bg-blue-50/60'
                          }`}
                          onMouseEnter={() => setHighlightedTooth(row.tooth)}
                          onMouseLeave={() => setHighlightedTooth(null)}
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-slate-700">
                                {row.tooth}
                              </span>
                              {onBondGroup && lastBonded === row.tooth && (
                                <span className="text-[8px] font-black text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                  ✓ Selected
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="text-center px-3 py-2">
                            <span className="text-[10px] font-medium text-slate-400">
                              {row.fdi}
                            </span>
                          </td>
                          <td className="text-right px-3 py-2">
                            <div className="flex items-center justify-end gap-1.5">
                              {onBondGroup && (
                                <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 text-[8px] font-black text-blue-500 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
                                  <Zap className="w-2 h-2" /> Bond
                                </span>
                              )}
                              <span className={`inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                lastBonded === row.tooth
                                  ? 'bg-blue-600 text-white'
                                  : highlightedTooth === row.tooth
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {row.height.toFixed(row.height % 1 !== 0 ? 2 : 1)}
                              </span>
                            </div>
                          </td>
                          {/* ── BONDED status column ── */}
                          <td className="text-right px-3 py-2">
                            {bondedByGroup[row.tooth] ? (
                              <div className="flex flex-col items-end gap-0.5">
                                <div className="flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                  <span className="text-[10px] font-bold text-emerald-600">
                                    {bondedByGroup[row.tooth].height != null
                                      ? `${bondedByGroup[row.tooth].height}mm`
                                      : 'Bonded'}
                                  </span>
                                </div>
                                {bondedByGroup[row.tooth].isOverride && (
                                  <span className="text-[8px] font-bold text-amber-500 uppercase tracking-wider bg-amber-50 px-1 py-0.5 rounded">
                                    overridden
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Lower Arch */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Mandibular (Lower)
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Tooth
                        </th>
                        <th className="text-center px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          FDI
                        </th>
                        <th className="text-right px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Ref (mm)
                        </th>
                        <th className="text-right px-3 py-2 text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                          Bonded
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.lower.map((row, i) => (
                        <tr
                          key={row.tooth}
                          onClick={(e) => handleBondRow(e, row)}
                          className={`border-t border-slate-100 transition-colors group ${
                            onBondGroup ? 'cursor-pointer' : 'cursor-default'
                          } ${
                            lastBonded === row.tooth
                              ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-200'
                              : highlightedTooth === row.tooth
                              ? 'bg-emerald-50'
                              : i % 2 === 0
                              ? 'bg-white hover:bg-emerald-50/60'
                              : 'bg-slate-50/30 hover:bg-emerald-50/60'
                          }`}
                          onMouseEnter={() => setHighlightedTooth(row.tooth)}
                          onMouseLeave={() => setHighlightedTooth(null)}
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-slate-700">
                                {row.tooth}
                              </span>
                              {onBondGroup && lastBonded === row.tooth && (
                                <span className="text-[8px] font-black text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                  ✓ Selected
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="text-center px-3 py-2">
                            <span className="text-[10px] font-medium text-slate-400">
                              {row.fdi}
                            </span>
                          </td>
                          <td className="text-right px-3 py-2">
                            <div className="flex items-center justify-end gap-1.5">
                              {onBondGroup && (
                                <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 text-[8px] font-black text-emerald-500 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                                  <Zap className="w-2 h-2" /> Bond
                                </span>
                              )}
                              <span className={`inline-flex items-center justify-center min-w-[40px] px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                lastBonded === row.tooth
                                  ? 'bg-emerald-600 text-white'
                                  : highlightedTooth === row.tooth
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {row.height.toFixed(row.height % 1 !== 0 ? 2 : 1)}
                              </span>
                            </div>
                          </td>
                          {/* ── BONDED status column ── */}
                          <td className="text-right px-3 py-2">
                            {bondedByGroup[row.tooth] ? (
                              <div className="flex flex-col items-end gap-0.5">
                                <div className="flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                  <span className="text-[10px] font-bold text-emerald-600">
                                    {bondedByGroup[row.tooth].height != null
                                      ? `${bondedByGroup[row.tooth].height}mm`
                                      : 'Bonded'}
                                  </span>
                                </div>
                                {bondedByGroup[row.tooth].isOverride && (
                                  <span className="text-[8px] font-bold text-amber-500 uppercase tracking-wider bg-amber-50 px-1 py-0.5 rounded">
                                    overridden
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Comparison Note */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[9px] font-bold text-amber-600">!</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-amber-800">Clinical Note</p>
                    <p className="text-[10px] text-amber-700 mt-0.5 leading-relaxed">
                      Heights are measured from incisal/occlusal edge to center of bracket slot.
                      Adjust ±0.5mm based on individual tooth morphology and clinical judgment.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={onClose}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all shadow-sm"
              >
                Close Reference
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrescriptionOPGModal;
