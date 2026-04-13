/**
 * ToothChart.jsx
 * ==============
 * Interactive FDI tooth numbering chart with missing-tooth detection visualisation.
 *
 * Features:
 *   - Full FDI two-digit system (16 upper + 16 lower slots)
 *   - Per-tooth status: present (teal) / missing (red pulse) / unanalysed (grey)
 *   - Tooth number badge rendered above each crown
 *   - Hover tooltip with detailed tooth info
 *   - Arch summary statistics bar
 *   - Responsive: scrollable on small screens
 *
 * Props:
 *   caseId        {string}  — orthodontic case ID to fetch
 *   className     {string}  — optional extra classes
 *   compact       {boolean} — compact mode (smaller cells, hides measurements)
 */

import React, { useEffect, useState, useCallback } from 'react';
import api from '../../../../services/api';
import {
    AlertTriangle,
    CheckCircle2,
    HelpCircle,
    RefreshCw,
    Info,
    ChevronDown,
    ChevronUp
} from 'lucide-react';

// ── FDI layout constants ──────────────────────────────────────────────────────

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];  // distal → mesial
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];  // mesial → distal
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];  // mesial → distal
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];  // distal → mesial

// Human-readable tooth names for tooltips
const TOOTH_NAMES = {
    1: 'Central Incisor', 2: 'Lateral Incisor', 3: 'Canine',
    4: 'First Premolar', 5: 'Second Premolar',
    6: 'First Molar', 7: 'Second Molar', 8: 'Third Molar (Wisdom)',
};

const QUADRANT_NAMES = {
    1: 'Upper Right', 2: 'Upper Left', 3: 'Lower Left', 4: 'Lower Right',
};

function getToothName(fdi) {
    const quadrant = Math.floor(fdi / 10);
    const position = fdi % 10;
    return `${QUADRANT_NAMES[quadrant]} ${TOOTH_NAMES[position] || ''}`;
}

// ── Status styling ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
    present: {
        crown: 'bg-gradient-to-b from-teal-400 to-teal-600 border-teal-700 shadow-teal-200',
        root: 'bg-gradient-to-b from-teal-200 to-teal-300',
        label: 'text-teal-700 bg-teal-50 border-teal-200',
        dot: 'bg-teal-500',
        animate: '',
        icon: CheckCircle2,
        text: 'Present',
    },
    missing: {
        crown: 'bg-gradient-to-b from-red-100 to-red-200 border-red-300 shadow-red-100',
        root: 'bg-gradient-to-b from-red-100 to-red-50',
        label: 'text-red-700 bg-red-50 border-red-200',
        dot: 'bg-red-500 animate-pulse',
        animate: 'ring-2 ring-red-300 ring-offset-1',
        icon: AlertTriangle,
        text: 'Missing',
    },
    unanalysed: {
        crown: 'bg-gradient-to-b from-slate-200 to-slate-300 border-slate-300 shadow-slate-100',
        root: 'bg-gradient-to-b from-slate-100 to-slate-200',
        label: 'text-slate-400 bg-slate-50 border-slate-200',
        dot: 'bg-slate-400',
        animate: '',
        icon: HelpCircle,
        text: 'Not analysed',
    },
};

// ── Tooth Cell ────────────────────────────────────────────────────────────────

function ToothCell({ fdi, status, compact, flipped = false }) {
    const [hovered, setHovered] = useState(false);
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unanalysed;
    const Icon = cfg.icon;
    const name = getToothName(fdi);

    const crown = (
        <div
            className={`
                relative w-full aspect-[3/4] rounded-t-lg border-2 transition-all duration-200
                ${cfg.crown} ${cfg.animate}
                ${hovered ? 'scale-105 shadow-lg' : 'shadow-sm'}
                ${compact ? 'rounded-t' : 'rounded-t-xl'}
                flex items-center justify-center cursor-default
            `}
        >
            {/* Status dot */}
            <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${cfg.dot}`} />

            {/* Tooth number */}
            <span className={`
                text-[10px] font-black ${compact ? '' : 'md:text-[11px]'}
                ${status === 'present' ? 'text-white drop-shadow' : 'text-slate-500'}
            `}>
                {fdi}
            </span>

            {/* Tooltip */}
            {hovered && (
                <div className={`
                    absolute z-50 left-1/2 -translate-x-1/2 w-44
                    bg-slate-900 text-white text-[10px] rounded-xl p-3 shadow-2xl
                    pointer-events-none whitespace-nowrap
                    ${flipped ? 'bottom-full mb-2' : 'top-full mt-2'}
                `}>
                    <div className="font-black text-[11px] mb-1">{name}</div>
                    <div className="flex items-center gap-1.5">
                        <Icon className={`w-3 h-3 ${status === 'missing' ? 'text-red-400' : status === 'present' ? 'text-teal-400' : 'text-slate-400'}`} />
                        <span className={
                            status === 'missing' ? 'text-red-300' :
                                status === 'present' ? 'text-teal-300' : 'text-slate-300'
                        }>
                            {cfg.text}
                        </span>
                    </div>
                    {/* Arrow */}
                    <div className={`
                        absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45
                        ${flipped ? 'top-full -mt-1' : 'bottom-full -mb-1'}
                    `} />
                </div>
            )}
        </div>
    );

    const root = (
        <div className={`
            w-[60%] mx-auto h-3 rounded-b-sm
            ${cfg.root}
            ${compact ? 'h-2' : ''}
        `} />
    );

    return (
        <div
            className="flex flex-col items-center gap-0"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {flipped ? (
                <>
                    {root}
                    {crown}
                </>
            ) : (
                <>
                    {crown}
                    {root}
                </>
            )}
        </div>
    );
}

// ── Arch Row ──────────────────────────────────────────────────────────────────

function ArchRow({ leftTeeth, rightTeeth, teeth, label, flipped = false, compact }) {
    const all = [...rightTeeth, ...leftTeeth];
    const presentCount = all.filter(f => teeth[f] === 'present').length;
    const missingCount = all.filter(f => teeth[f] === 'missing').length;

    return (
        <div className="w-full">
            {/* Arch label */}
            <div className={`flex items-center justify-between px-1 mb-2 ${flipped ? '' : ''}`}>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {label}
                </span>
                <div className="flex items-center gap-3 text-[10px]">
                    <span className="flex items-center gap-1 text-teal-600 font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        {presentCount} present
                    </span>
                    {missingCount > 0 && (
                        <span className="flex items-center gap-1 text-red-500 font-bold animate-pulse">
                            <AlertTriangle className="w-3 h-3" />
                            {missingCount} missing
                        </span>
                    )}
                </div>
            </div>

            {/* Tooth grid */}
            <div className="flex items-end gap-0.5 md:gap-1 bg-gradient-to-r from-slate-50 via-white to-slate-50 rounded-2xl border border-slate-100 p-2 md:p-3">

                {/* Right quadrant */}
                <div className="flex items-end gap-0.5 md:gap-1 flex-1 justify-end">
                    {rightTeeth.map(fdi => (
                        <div key={fdi} className="flex-1 min-w-0">
                            <ToothCell
                                fdi={fdi}
                                status={teeth[fdi] || 'unanalysed'}
                                compact={compact}
                                flipped={flipped}
                            />
                        </div>
                    ))}
                </div>

                {/* Midline divider */}
                <div className="flex flex-col items-center mx-1 md:mx-2 self-stretch">
                    <div className="w-px flex-1 bg-gradient-to-b from-slate-200 via-slate-400 to-slate-200" />
                    <span className="text-[9px] font-black text-slate-300 rotate-90 my-1 whitespace-nowrap">midline</span>
                    <div className="w-px flex-1 bg-gradient-to-b from-slate-200 via-slate-400 to-slate-200" />
                </div>

                {/* Left quadrant */}
                <div className="flex items-end gap-0.5 md:gap-1 flex-1 justify-start">
                    {leftTeeth.map(fdi => (
                        <div key={fdi} className="flex-1 min-w-0">
                            <ToothCell
                                fdi={fdi}
                                status={teeth[fdi] || 'unanalysed'}
                                compact={compact}
                                flipped={flipped}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Measurement Card ──────────────────────────────────────────────────────────

function MeasurementCard({ label, value, unit, normal, info }) {
    const [showInfo, setShowInfo] = useState(false);
    const isNormal = normal && value != null;
    const inRange = isNormal && value >= normal.min && value <= normal.max;

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {label}
                </span>
                {info && (
                    <button
                        onClick={() => setShowInfo(s => !s)}
                        className="text-slate-300 hover:text-slate-500 transition-colors"
                        title="Clinical reference"
                    >
                        <Info className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            <div className="flex items-end gap-1.5">
                {value != null ? (
                    <>
                        <span className={`text-2xl font-black ${isNormal
                                ? inRange ? 'text-teal-600' : 'text-amber-500'
                                : 'text-slate-800'
                            }`}>
                            {typeof value === 'number' ? value.toFixed(1) : value}
                        </span>
                        {unit && <span className="text-xs text-slate-400 mb-0.5">{unit}</span>}
                        {isNormal && (
                            <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${inRange
                                    ? 'bg-teal-50 text-teal-600'
                                    : 'bg-amber-50 text-amber-600'
                                }`}>
                                {inRange ? 'Normal' : 'Atypical'}
                            </span>
                        )}
                    </>
                ) : (
                    <span className="text-sm text-slate-300 italic">—</span>
                )}
            </div>

            {showInfo && info && (
                <div className="mt-2 text-[10px] text-slate-500 bg-slate-50 rounded-lg p-2">
                    {info}
                </div>
            )}
        </div>
    );
}

// ── API helper ────────────────────────────────────────────────────────────────
// Uses the centralized org-plane api client (services/api.js) which:
//   - Injects org_access_token via its request interceptor
//   - Handles 401 → auto-refresh → retry cycle
//   - ❌ NEVER reads localStorage directly (Zero-Trust compliance)

async function fetchTeethChart(caseId, includeWisdom = false) {
    const res = await api.get(`/org/case/${caseId}/teeth`, {
        params: { includeWisdom }
    });
    return res.data;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ToothChart({ caseId, className = '', compact = false }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [wisdom, setWisdom] = useState(false);
    const [showMeasurements, setShowMeasurements] = useState(true);

    const load = useCallback(async () => {
        if (!caseId) return;
        try {
            setLoading(true);
            setError(null);
            const result = await fetchTeethChart(caseId, wisdom);
            setData(result.data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [caseId, wisdom]);

    useEffect(() => { load(); }, [load]);

    // ── Loading skeleton ──────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className={`rounded-3xl border border-slate-100 bg-white p-6 ${className}`}>
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 animate-pulse" />
                    <div className="h-5 w-40 rounded-lg bg-slate-100 animate-pulse" />
                </div>
                <div className="space-y-4">
                    {[0, 1].map(i => (
                        <div key={i} className="h-24 rounded-2xl bg-slate-50 animate-pulse border border-slate-100" />
                    ))}
                </div>
            </div>
        );
    }

    // ── Error state ────────────────────────────────────────────────────────────
    if (error) {
        return (
            <div className={`rounded-3xl border border-red-100 bg-red-50 p-6 ${className}`}>
                <div className="flex items-center gap-3 text-red-700 mb-3">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-bold text-sm">Failed to load tooth chart</span>
                </div>
                <p className="text-xs text-red-500 mb-4">{error}</p>
                <button
                    onClick={load}
                    className="flex items-center gap-2 text-xs font-bold text-red-600 hover:text-red-800 transition-colors"
                >
                    <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
            </div>
        );
    }

    if (!data) return null;

    const { teeth = {}, summary = {}, measurements, analysed } = data;
    const m = measurements || {};

    // Determine which teeth to render (filter wisdom if not enabled)
    const WISDOM_SET = new Set(['18', '28', '38', '48']);
    const effectiveTeeth = wisdom
        ? teeth
        : Object.fromEntries(
            Object.entries(teeth).filter(([k]) => !WISDOM_SET.has(k))
        );

    const upperRight = wisdom ? UPPER_RIGHT : UPPER_RIGHT.filter(f => f !== 18);
    const upperLeft = wisdom ? UPPER_LEFT : UPPER_LEFT.filter(f => f !== 28);
    const lowerLeft = wisdom ? LOWER_LEFT : LOWER_LEFT.filter(f => f !== 38);
    const lowerRight = wisdom ? LOWER_RIGHT : LOWER_RIGHT.filter(f => f !== 48);

    return (
        <div className={`rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden ${className}`}>

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {/* Tooth icon SVG */}
                    <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center shadow-lg shadow-teal-100">
                        <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current">
                            <path d="M12 2C8.5 2 5 4.5 5 8c0 2 .5 3.5 1.5 5L9 21h1.5l1.5-6 1.5 6H15l2.5-8C18.5 11.5 19 10 19 8c0-3.5-3.5-6-7-6z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-base font-black text-slate-900">Tooth Chart</h3>
                        <p className="text-[11px] text-slate-400 font-medium">
                            FDI Two-Digit System
                            {!analysed && (
                                <span className="ml-2 text-amber-500 font-black">• Unanalysed</span>
                            )}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Wisdom toggle */}
                    <button
                        onClick={() => setWisdom(w => !w)}
                        className={`text-[10px] font-black px-3 py-1.5 rounded-lg border transition-all ${wisdom
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                            }`}
                    >
                        {wisdom ? '✓' : '+'} Wisdom
                    </button>

                    {/* Refresh */}
                    <button
                        onClick={load}
                        className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all"
                        title="Refresh"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* ── Summary Bar ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50/50">
                <div className="px-4 py-3 text-center">
                    <div className="text-xl font-black text-teal-600">{summary.total ?? '—'}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Present</div>
                </div>
                <div className="px-4 py-3 text-center">
                    <div className={`text-xl font-black ${summary.missing > 0 ? 'text-red-500' : 'text-slate-300'}`}>
                        {summary.missing ?? '—'}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Missing</div>
                </div>
                <div className="px-4 py-3 text-center">
                    <div className="text-xl font-black text-slate-400">
                        {analysed
                            ? `${summary.upper ?? 0}U/${summary.lower ?? 0}L`
                            : '—'
                        }
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Distribution</div>
                </div>
            </div>

            {/* ── Chart Area ───────────────────────────────────────────────── */}
            <div className="p-4 md:p-6 space-y-3 overflow-x-auto">

                {/* Upper arch */}
                <ArchRow
                    label="Maxillary (Upper)"
                    rightTeeth={upperRight}
                    leftTeeth={upperLeft}
                    teeth={effectiveTeeth}
                    flipped={false}
                    compact={compact}
                />

                {/* Occlusal indicator */}
                <div className="flex items-center gap-3 px-2">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest px-2">
                        ← Occlusal Plane →
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
                </div>

                {/* Lower arch (flipped — roots face up) */}
                <ArchRow
                    label="Mandibular (Lower)"
                    rightTeeth={lowerRight}
                    leftTeeth={lowerLeft}
                    teeth={effectiveTeeth}
                    flipped={true}
                    compact={compact}
                />
            </div>

            {/* ── Legend ───────────────────────────────────────────────────── */}
            <div className="px-6 pb-4 flex items-center gap-4 flex-wrap">
                {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
                    <div key={status} className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
                        <span className="text-[11px] font-bold text-slate-500">{cfg.text}</span>
                    </div>
                ))}
            </div>

            {/* ── Orthodontic Measurements ─────────────────────────────────── */}
            {measurements && !compact && (
                <div className="border-t border-slate-100">
                    <button
                        onClick={() => setShowMeasurements(s => !s)}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                        <span className="text-xs font-black text-slate-600 uppercase tracking-widest">
                            Orthodontic Measurements
                        </span>
                        {showMeasurements
                            ? <ChevronUp className="w-4 h-4 text-slate-400" />
                            : <ChevronDown className="w-4 h-4 text-slate-400" />
                        }
                    </button>

                    {showMeasurements && (
                        <div className="px-6 pb-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">

                            <MeasurementCard
                                label="Overjet"
                                value={m.overjet_mm}
                                unit="mm"
                                normal={{ min: 1, max: 4 }}
                                info="Normal overjet: 1–4 mm. Measures horizontal incisor relationship."
                            />

                            <MeasurementCard
                                label="Overbite"
                                value={m.overbite_mm}
                                unit="mm"
                                normal={{ min: 1, max: 4 }}
                                info="Normal overbite: 1–4 mm. Measures vertical incisor overlap."
                            />

                            <MeasurementCard
                                label="Curve of Spee"
                                value={m.curve_of_spee_mm}
                                unit="mm"
                                normal={{ min: 0, max: 3 }}
                                info="Depth of sagittal occlusal curve. >3 mm may indicate need for leveling."
                            />

                            <MeasurementCard
                                label="Arch Length"
                                value={m.arch_length_upper_mm}
                                unit="mm"
                                info="Maxillary arch length (anterior segment + inter-canine width)."
                            />

                            <MeasurementCard
                                label="Arch Length"
                                value={m.arch_length_lower_mm}
                                unit="mm"
                                info="Mandibular arch length (anterior segment + inter-canine width)."
                            />

                            <MeasurementCard
                                label="Bolton Overall"
                                value={m.bolton?.overall_ratio}
                                unit="%"
                                normal={{ min: 89.4, max: 93.2 }}
                                info="Bolton overall ratio (normal: 91.3 ± 1.91%). Compares total mesio-distal widths."
                            />

                            <MeasurementCard
                                label="Bolton Anterior"
                                value={m.bolton?.anterior_ratio}
                                unit="%"
                                normal={{ min: 75.5, max: 78.9 }}
                                info="Bolton anterior ratio (normal: 77.2 ± 1.65%). Compares anterior 6 teeth per arch."
                            />

                            {m.bolton?.overall_discrepancy_mm != null && (
                                <MeasurementCard
                                    label="Bolton Excess"
                                    value={m.bolton.overall_discrepancy_mm}
                                    unit="mm"
                                    info="Positive = mandibular excess; negative = maxillary excess."
                                />
                            )}

                        </div>
                    )}
                </div>
            )}

        </div>
    );
}
