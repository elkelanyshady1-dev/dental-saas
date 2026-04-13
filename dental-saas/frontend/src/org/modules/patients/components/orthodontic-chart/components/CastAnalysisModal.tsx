/**
 * CastAnalysisModal.tsx
 * ═══════════════════════════════════════════════════════════════════════
 * Full Cast Analysis module — fullscreen modal overlay
 *
 * Features:
 *   • Real-time engine (< 1ms, synchronous, no refresh)
 *   • Upper + Lower arch: Space Required (12 teeth) + 4 Available segments
 *   • Bolton TSD (anterior + total ratios)
 *   • Ashley Howe PM/TS Index (upper + lower)
 *   • Color-coded discrepancy feedback (green/amber/red)
 *   • Clinical insights auto-generated
 *   • Save → POST /api/v1/cast-analysis
 *   • Minimize/restore pill (same pattern as SnapshotEditor)
 *
 * Mounted from OrthodonticTab via "Cast Analysis" button.
 * ═══════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
    X, Minus, Save, RotateCcw,
    AlertTriangle, CheckCircle, Info, Lightbulb, Ruler, FlaskConical,
} from 'lucide-react';
import {
    runCastAnalysis,
    INITIAL_CAST_INPUT,
    CastInput,
    CastResult,
    Severity,
} from '../utils/castEngine';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CastAnalysisModalProps {
    patientId:        string;
    caseId?:          string;
    onClose:          () => void;
    /**
     * Pre-populate the form from a previously-saved record set.
     * Pass `recordSet.castAnalysis?.input` on mount.
     */
    initialInput?:    CastInput;
    /**
     * Called on every form change with the latest input.
     * Parent should route this into onUpdate → auto-save pipeline.
     */
    onChange?:        (input: CastInput, result: CastResult) => void;
    /**
     * Called when the user explicitly clicks "Save".
     * Receives the fully-computed result object.
     * Parent uses this to confirm/log the committed state.
     */
    onSaveComplete?:  (result: CastResult, input: CastInput) => void;
}

// ── Severity colour map ──────────────────────────────────────────────────────

const SEV_COLOR: Record<Severity, { text: string; bg: string; border: string; badge: string }> = {
    positive: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', badge: 'bg-emerald-500 text-white' },
    adequate: { text: 'text-emerald-300', bg: 'bg-emerald-500/5',  border: 'border-emerald-500/20', badge: 'bg-emerald-600 text-white' },
    mild:     { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   badge: 'bg-amber-500 text-white'   },
    moderate: { text: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30',  badge: 'bg-orange-500 text-white'  },
    severe:   { text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     badge: 'bg-red-500 text-white'     },
};

// ── Net display helper ───────────────────────────────────────────────────────

function NetDisplay({ net, severity }: { net: number; severity: Severity }) {
    const c = SEV_COLOR[severity];
    return (
        <span className={`text-lg font-black font-mono ${c.text}`}>
            {net >= 0 ? '+' : ''}{net.toFixed(1)}
        </span>
    );
}

// ── Number input cell ────────────────────────────────────────────────────────

function NumInput({
    value,
    onChange,
    label,
    accent = 'blue',
}: {
    value: number | string;
    onChange: (v: string) => void;
    label: string;
    accent?: 'blue' | 'purple';
}) {
    return (
        <div className="flex flex-col gap-1 items-center">
            <label className="text-[8px] font-bold text-white/30 uppercase tracking-widest">{label}</label>
            <input
                type="number"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                step="0.1"
                placeholder="—"
                className={`w-full bg-white/5 border border-white/10 rounded-lg text-center text-xs font-bold text-white py-2 focus:outline-none focus:border-${accent}-500/60 placeholder:text-white/10 transition-colors`}
            />
        </div>
    );
}

// ── Segment input ────────────────────────────────────────────────────────────

function SegmentInput({
    value,
    onChange,
    label,
}: {
    value: number | string;
    onChange: (v: string) => void;
    label: string;
}) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">{label}</span>
            <input
                type="number"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                step="0.1"
                placeholder="—"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-blue-500/60 placeholder:text-white/10 transition-colors"
            />
        </div>
    );
}

// ── Arch Panel ───────────────────────────────────────────────────────────────

const TOOTH_LABELS_LEFT  = ['6┘', '5┘', '4┘', '3┘', '2┘', '1┘'];
const TOOTH_LABELS_RIGHT = ['└1', '└2', '└3', '└4', '└5', '└6'];
const LOWER_LEFT         = ['6┐', '5┐', '4┐', '3┐', '2┐', '1┐'];
const LOWER_RIGHT        = ['┌1', '┌2', '┌3', '┌4', '┌5', '┌6'];

function ArchPanel({
    arch,
    which,
    result,
    onTeethChange,
    onSegmentChange,
}: {
    arch: CastInput['upper'];
    which: 'upper' | 'lower';
    result: CastResult['upper'] | null;
    onTeethChange: (side: 'right' | 'left', idx: number, val: string) => void;
    onSegmentChange: (side: 'right' | 'left', key: string, val: string) => void;
}) {
    const isUpper = which === 'upper';
    const leftLabels  = isUpper ? TOOTH_LABELS_LEFT  : LOWER_LEFT;
    const rightLabels = isUpper ? TOOTH_LABELS_RIGHT : LOWER_RIGHT;
    const accentClass = isUpper ? 'text-blue-400 border-blue-500/30 bg-blue-500/10'
                                : 'text-purple-400 border-purple-500/30 bg-purple-500/10';
    const accentFocus = isUpper ? 'blue' : 'purple';

    const severityColor = result ? SEV_COLOR[result.severity] : SEV_COLOR.adequate;

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isUpper ? 'bg-blue-500/20' : 'bg-purple-500/20'}`}>
                        <Ruler className={`w-3.5 h-3.5 ${isUpper ? 'text-blue-400' : 'text-purple-400'}`} />
                    </div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-widest">
                        {isUpper ? 'Upper Arch' : 'Lower Arch'}
                    </h3>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${accentClass}`}>
                        {isUpper ? 'Maxilla' : 'Mandible'}
                    </span>
                </div>

                {result && (
                    <div className={`px-3 py-1.5 rounded-xl border ${severityColor.bg} ${severityColor.border} flex items-center gap-2`}>
                        <NetDisplay net={result.total} severity={result.severity} />
                        <span className={`text-[8px] font-bold uppercase ${severityColor.badge} px-1.5 py-0.5 rounded`}>
                            {result.classification}
                        </span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                {/* Space Required */}
                <div className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-3">
                    <h4 className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
                        Space Required (mm)
                    </h4>
                    {/* Left side (teeth 6→1) */}
                    <div className="grid grid-cols-6 gap-1.5">
                        {leftLabels.map((label, i) => (
                            <NumInput
                                key={`left-${i}`}
                                label={label}
                                value={arch.required.left[i] ?? ''}
                                onChange={(v) => onTeethChange('left', i, v)}
                                accent={accentFocus}
                            />
                        ))}
                    </div>
                    <div className="h-px bg-white/5" />
                    {/* Right side (1→6) */}
                    <div className="grid grid-cols-6 gap-1.5">
                        {rightLabels.map((label, i) => (
                            <NumInput
                                key={`right-${i}`}
                                label={label}
                                value={arch.required.right[i] ?? ''}
                                onChange={(v) => onTeethChange('right', i, v)}
                                accent={accentFocus}
                            />
                        ))}
                    </div>

                    {/* Left / Right quick totals */}
                    {result && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                            <div className={`p-2 rounded-xl text-center ${SEV_COLOR[result.left.severity].bg} border ${SEV_COLOR[result.left.severity].border}`}>
                                <p className="text-[8px] text-white/40 font-bold uppercase">Left Net</p>
                                <NetDisplay net={result.left.net} severity={result.left.severity} />
                            </div>
                            <div className={`p-2 rounded-xl text-center ${SEV_COLOR[result.right.severity].bg} border ${SEV_COLOR[result.right.severity].border}`}>
                                <p className="text-[8px] text-white/40 font-bold uppercase">Right Net</p>
                                <NetDisplay net={result.right.net} severity={result.right.severity} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Space Available */}
                <div className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-3">
                    <h4 className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
                        Space Available (mm)
                    </h4>
                    <div className="space-y-2">
                        <SegmentInput
                            label="S1 Left Posterior"
                            value={arch.available.left.s1 ?? ''}
                            onChange={(v) => onSegmentChange('left', 's1', v)}
                        />
                        <SegmentInput
                            label="S2 Left Anterior"
                            value={arch.available.left.s2 ?? ''}
                            onChange={(v) => onSegmentChange('left', 's2', v)}
                        />
                        <div className="h-px bg-white/5" />
                        <SegmentInput
                            label="S3 Right Anterior"
                            value={arch.available.right.s3 ?? ''}
                            onChange={(v) => onSegmentChange('right', 's3', v)}
                        />
                        <SegmentInput
                            label="S4 Right Posterior"
                            value={arch.available.right.s4 ?? ''}
                            onChange={(v) => onSegmentChange('right', 's4', v)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Bolton Card ──────────────────────────────────────────────────────────────

function BoltonCard({ bolton }: { bolton: CastResult['bolton'] }) {
    return (
        <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/8 flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Bolton Analysis</h3>
                <span className="text-[9px] text-white/40 font-medium ml-auto">TSD</span>
            </div>
            <div className="p-5 space-y-5">
                {(['anterior', 'total'] as const).map((key) => {
                    const side = bolton[key];
                    const isNormal = side.status === 'normal';
                    const hasValue = side.value !== null;
                    return (
                        <div key={key} className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-0.5">
                                    {key === 'anterior' ? 'Anterior Ratio' : 'Total Ratio'}
                                </p>
                                <p className={`text-2xl font-black ${hasValue ? 'text-white' : 'text-white/20'}`}>
                                    {hasValue ? `${side.value}%` : '—'}
                                </p>
                            </div>
                            {hasValue && (
                                <div className={`flex flex-col items-end gap-1`}>
                                    <span className={`px-2 py-1 rounded-full text-[9px] font-bold uppercase ${
                                        isNormal ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                                    }`}>
                                        {isNormal ? `Normal (${side.norm}%)` : 'Discrepancy'}
                                    </span>
                                    {side.deviation !== null && (
                                        <span className="text-[9px] text-white/30">
                                            {side.deviation >= 0 ? '+' : ''}{side.deviation}% vs norm
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Ashley Howe Card ─────────────────────────────────────────────────────────

function AshleyCard({
    ashley,
    astInput,
    onAshleyChange,
}: {
    ashley:      CastResult['ashley'];
    astInput:    CastInput['ashley'];
    onAshleyChange: (key: keyof CastInput['ashley'], val: string) => void;
}) {
    const upper = ashley.upper;
    const lower = ashley.lower;

    const ashleyColor = (val: number | null) => {
        if (val === null) return 'text-white/20';
        if (val >= 45)   return 'text-emerald-400';
        if (val >= 37)   return 'text-amber-400';
        return 'text-red-400';
    };

    return (
        <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/8 flex items-center gap-2">
                <Info className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-bold text-white">Ashley Howe Analysis</h3>
            </div>
            <div className="p-5 space-y-4">
                {/* Inputs */}
                <div className="grid grid-cols-2 gap-3">
                    <SegmentInput label="Upper PM Width"    value={astInput.upperPM}    onChange={(v) => onAshleyChange('upperPM', v)} />
                    <SegmentInput label="Upper Basal Width" value={astInput.upperBasal} onChange={(v) => onAshleyChange('upperBasal', v)} />
                    <SegmentInput label="Lower PM Width"    value={astInput.lowerPM}    onChange={(v) => onAshleyChange('lowerPM', v)} />
                    <SegmentInput label="Lower Basal Width" value={astInput.lowerBasal} onChange={(v) => onAshleyChange('lowerBasal', v)} />
                </div>
                <div className="h-px bg-white/5" />
                {/* Results */}
                <div className="space-y-3">
                    {(['upper', 'lower'] as const).map((side) => {
                        const res = ashley[side];
                        return (
                            <div key={side} className="flex flex-col gap-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                                        {side === 'upper' ? 'Upper' : 'Lower'} PM/Basal
                                    </span>
                                    <span className={`text-lg font-black ${ashleyColor(res.value)}`}>
                                        {res.value !== null ? `${res.value}%` : '—'}
                                    </span>
                                </div>
                                {res.interpretation && (
                                    <p className="text-[10px] text-white/50 leading-snug">{res.interpretation}</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ── Tooth Size Card ──────────────────────────────────────────────────────────

function ToothSizeCard({
    toothSize,
    onToothSizeChange,
}: {
    toothSize: CastInput['toothSize'];
    onToothSizeChange: (key: keyof CastInput['toothSize'], val: string) => void;
}) {
    return (
        <div className="bg-white/3 border border-white/8 rounded-2xl p-5 space-y-4">
            <h4 className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Tooth Size (Bolton)</h4>
            <div className="grid grid-cols-2 gap-3">
                <SegmentInput label="Upper Anterior Sum" value={toothSize.upperAnterior} onChange={(v) => onToothSizeChange('upperAnterior', v)} />
                <SegmentInput label="Lower Anterior Sum" value={toothSize.lowerAnterior} onChange={(v) => onToothSizeChange('lowerAnterior', v)} />
                <SegmentInput label="Upper Total Sum"    value={toothSize.upperTotal}    onChange={(v) => onToothSizeChange('upperTotal', v)}    />
                <SegmentInput label="Lower Total Sum"    value={toothSize.lowerTotal}    onChange={(v) => onToothSizeChange('lowerTotal', v)}    />
            </div>
        </div>
    );
}

// ── Insights Card ────────────────────────────────────────────────────────────

function InsightsCard({ insights }: { insights: string[] }) {
    return (
        <div className="bg-indigo-950/80 border border-indigo-500/20 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-indigo-300" />
                <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">Clinical Insights</span>
            </div>
            <ul className="space-y-2">
                {insights.map((ins, i) => (
                    <li key={i} className="text-[11px] text-indigo-100/80 leading-relaxed flex gap-2">
                        <CheckCircle className="w-3 h-3 text-indigo-400 flex-shrink-0 mt-0.5" />
                        {ins}
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function CastAnalysisModal({
    patientId,
    caseId,
    onClose,
    initialInput,
    onChange,
    onSaveComplete,
}: CastAnalysisModalProps) {
    // api singleton kept for future use but save is now controlled
    const [form, setForm]           = useState<CastInput>(initialInput ?? INITIAL_CAST_INPUT);
    const [saving, setSaving]       = useState(false);
    const [saved, setSaved]         = useState(false);
    const [error, setError]         = useState<string | null>(null);
    const [minimized, setMinimized] = useState(false);

    // Hydrate from initialInput when prop changes (e.g. snapshot loaded late)
    useEffect(() => {
        if (initialInput) setForm(initialInput);
    }, [initialInput]);

    // ── Real-time computation (<1ms, synchronous) ────────────────────────────
    const result: CastResult = useMemo(() => runCastAnalysis(form), [form]);

    // Notify parent on every change (feeds auto-save pipeline)
    useEffect(() => {
        onChange?.(form, result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form]);

    // ── Setters ──────────────────────────────────────────────────────────────

    const setTeeth = useCallback(
        (arch: 'upper' | 'lower', side: 'right' | 'left', idx: number, val: string) => {
            setForm((prev) => {
                const arr = [...(prev[arch].required[side] as (number | string)[])];
                arr[idx]  = val;
                return {
                    ...prev,
                    [arch]: {
                        ...prev[arch],
                        required: { ...prev[arch].required, [side]: arr },
                    },
                };
            });
        },
        []
    );

    const setSegment = useCallback(
        (arch: 'upper' | 'lower', side: 'right' | 'left', key: string, val: string) => {
            setForm((prev) => ({
                ...prev,
                [arch]: {
                    ...prev[arch],
                    available: {
                        ...prev[arch].available,
                        [side]: { ...prev[arch].available[side], [key]: val },
                    },
                },
            }));
        },
        []
    );

    const setToothSize = useCallback(
        (key: keyof CastInput['toothSize'], val: string) => {
            setForm((prev) => ({ ...prev, toothSize: { ...prev.toothSize, [key]: val } }));
        },
        []
    );

    const setAshley = useCallback(
        (key: keyof CastInput['ashley'], val: string) => {
            setForm((prev) => ({ ...prev, ashley: { ...prev.ashley, [key]: val } }));
        },
        []
    );

    const handleReset = () => {
        setForm(INITIAL_CAST_INPUT);
        setSaved(false);
        setError(null);
    };

    // ── Save — commits to record set via parent callback ────────────────────
    // No standalone API POST. The result is passed up; parent routes it into
    // the existing auto-save pipeline (onUpdate → CaseWorkflowContainer diff).

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            onSaveComplete?.(result, form);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (e: any) {
            setError('Save failed — please try again');
        } finally {
            setSaving(false);
        }
    };

    // ── Minimized pill ───────────────────────────────────────────────────────

    if (minimized) {
        return (
            <button
                onClick={() => setMinimized(false)}
                className="fixed bottom-6 right-6 z-[600] flex items-center gap-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white pl-3 pr-5 py-3 rounded-2xl shadow-xl shadow-indigo-900/30 hover:shadow-indigo-900/50 hover:scale-105 active:scale-95 transition-all"
            >
                <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
                    <Ruler className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col items-start">
                    <span className="text-xs font-bold leading-none">Cast Analysis</span>
                    <span className="text-[9px] font-medium text-white/60 mt-0.5">Click to restore</span>
                </div>
            </button>
        );
    }

    // ── Full modal ───────────────────────────────────────────────────────────

    return (
        <div className="fixed inset-0 z-[500] bg-slate-950/95 backdrop-blur-sm flex flex-col overflow-hidden">

            {/* ── Top Bar ──────────────────────────────────────────────────── */}
            <div className="flex-none flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/60 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                        <Ruler className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-white">Cast Analysis</h2>
                        <p className="text-[10px] text-white/40 font-medium">Space · Bolton · Ashley Howe</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {error && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-xl">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-[10px] font-bold text-red-400">{error}</span>
                        </div>
                    )}
                    {saved && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-[10px] font-bold text-emerald-400">Saved!</span>
                        </div>
                    )}
                    <button
                        onClick={handleReset}
                        title="Reset all inputs"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-white/40 hover:text-white transition-colors text-[11px] font-bold"
                    >
                        <RotateCcw className="w-3.5 h-3.5" /> Reset
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-white text-[11px] font-bold transition-colors"
                    >
                        <Save className="w-3.5 h-3.5" />
                        {saving ? 'Saving…' : 'Save Analysis'}
                    </button>
                    <button
                        onClick={() => setMinimized(true)}
                        title="Minimize"
                        className="p-1.5 bg-white/5 border border-white/10 rounded-xl text-white/40 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                    >
                        <Minus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onClose}
                        title="Close"
                        className="p-1.5 bg-white/5 border border-white/10 rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* ── Body ─────────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-[1400px] mx-auto px-6 py-8">
                    <div className="grid grid-cols-12 gap-8 items-start">

                        {/* LEFT: Upper + Lower Arch (8 cols) */}
                        <div className="col-span-12 lg:col-span-8 space-y-10">

                            {/* Upper Arch */}
                            <ArchPanel
                                arch={form.upper}
                                which="upper"
                                result={result.upper}
                                onTeethChange={(side, idx, val) => setTeeth('upper', side, idx, val)}
                                onSegmentChange={(side, key, val) => setSegment('upper', side, key, val)}
                            />

                            <div className="h-px bg-white/6" />

                            {/* Lower Arch */}
                            <ArchPanel
                                arch={form.lower}
                                which="lower"
                                result={result.lower}
                                onTeethChange={(side, idx, val) => setTeeth('lower', side, idx, val)}
                                onSegmentChange={(side, key, val) => setSegment('lower', side, key, val)}
                            />

                            {/* Tooth size (Bolton input section) */}
                            <div className="h-px bg-white/6" />
                            <ToothSizeCard
                                toothSize={form.toothSize}
                                onToothSizeChange={setToothSize}
                            />
                        </div>

                        {/* RIGHT: Analysis Cards (4 cols, sticky) */}
                        <aside className="col-span-12 lg:col-span-4 lg:sticky lg:top-4 space-y-5">
                            <BoltonCard bolton={result.bolton} />
                            <AshleyCard
                                ashley={result.ashley}
                                astInput={form.ashley}
                                onAshleyChange={setAshley}
                            />
                            <InsightsCard insights={result.insights} />
                        </aside>
                    </div>
                </div>
            </div>
        </div>
    );
}
