/**
 * AnalysisStep.tsx
 * ═══════════════════════════════════════════════════════════════════════
 * Unified Diagnostic Pipeline — READ-ONLY interpretation layer.
 *
 * DATA KEY FIX (Root cause of empty ceph section):
 *   OrthoRecordsTab stores ceph data as LOWERCASE IDs on PhotoRecord.analysis:
 *   { sna: '90', snb: '78', anb: '6', mmp: '29', u1pp: '120', ... }
 *   Previous mapper looked for `a.SNA` (uppercase) — always undefined.
 *   Fixed to read `a['sna']`, `a['anb']`, etc. directly.
 *
 * ARCHITECTURE:
 *   Records step = INPUT   → PhotoRecord.analysis (flat lowercase keys)
 *   Analysis step = OUTPUT → read + classify + diagnose (never recalculate)
 *
 * SECTIONS:
 *   1. Overview stats + module presence indicators
 *   2. Cephalometric Measurements table (all 13 measurements)
 *   3. Clinical Diagnosis card (sagittal / vertical / dental)
 *   4. CVM Stage
 *   5. OPG / Radiographic Findings
 *   6. Photo Analysis
 *   7. Cast Analysis
 * ═══════════════════════════════════════════════════════════════════════
 */

import React, { useMemo } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle2, Info, ArrowRight,
  Ruler, Smile, Eye, Activity, Layers, Scan,
  Brain, ChevronRight,
} from 'lucide-react';
import { motion } from 'motion/react';
import { RecordSet, PhotoRecord } from '../../../types';
import {
  CEPH_NORMS_ENGINE,
  getMeasurementStatus,
  generateCephInterpretation,
  CephInterpretation,
  MeasurementStatus,
} from './cephInterpretation.engine';
import {
  classifyMalocclusion,
  getMalocclusionBadgeCfg,
  MalocclusionClass,
} from './malocclusion.engine';

// ── Props ──────────────────────────────────────────────────────────────────────

interface AnalysisStepProps {
  data: RecordSet;
  onComplete: () => void;
}

// ── Shared item type ───────────────────────────────────────────────────────────

type Severity = 'normal' | 'mild' | 'moderate' | 'severe' | 'info' | 'absent';

interface DiagnosticItem {
  label:   string;
  value:   string;
  normal?: string;
  status:  Severity;
  note?:   string;
}

// ══════════════ MAPPERS ═══════════════════════════════════════════════════════

/**
 * mapCeph — reads ALL 13 ceph measurements from PhotoRecord.analysis.
 * Data is stored with LOWERCASE keys (sna, snb, anb, wits, mmp, ...)
 * matching CEPH_MEASUREMENTS[n].id from OrthoRecordsTab.
 */
function mapCeph(cephRecord: PhotoRecord | undefined): DiagnosticItem[] {
  if (!cephRecord?.analysis) return [];
  const a = cephRecord.analysis;

  return Object.entries(CEPH_NORMS_ENGINE)
    .map(([key, norm]) => {
      const raw = a[key];   // lowercase key lookup — the ACTUAL storage format
      if (raw === undefined || raw === null || raw === '') return null;
      const v = parseFloat(String(raw));
      if (isNaN(v)) return null;

      const s = getMeasurementStatus(v, norm);

      const statusMap: Record<MeasurementStatus, Severity> = {
        increased: s.severity,
        decreased: s.severity,
        normal:    'normal',
      };
      // Resolve which direction label to show
      const dirLabel =
        s.status === 'increased' ? `↑ Above norm by ${s.deviation.toFixed(1)}${norm.unit}` :
        s.status === 'decreased' ? `↓ Below norm by ${Math.abs(s.deviation).toFixed(1)}${norm.unit}` :
        'Within normal limits';

      return {
        label:  norm.label,
        value:  `${v}${norm.unit}`,
        normal: `${norm.mean}${norm.unit} ± ${norm.tol}`,
        status: s.status === 'normal' ? 'normal' : s.severity,
        note:   dirLabel,
      } as DiagnosticItem;
    })
    .filter((m): m is DiagnosticItem => m !== null);
}

function mapCVM(cephRecord: PhotoRecord | undefined): DiagnosticItem[] {
  if (!cephRecord?.analysis) return [];
  const a = cephRecord.analysis;
  const stage = a.cvmStage || a.CVM;
  if (!stage) return [];

  const growthMap: Record<string, { severity: Severity; note: string }> = {
    CVMS1: { severity: 'normal', note: 'Pre-peak · Growth spurt ~2 years away' },
    CVMS2: { severity: 'normal', note: 'Pre-peak · Growth spurt ~1 year away' },
    CVMS3: { severity: 'info',   note: '🎯 Peak growth — ideal orthopaedic intervention window' },
    CVMS4: { severity: 'mild',   note: 'Post-peak · 1–2 years post-peak · some modification possible' },
    CVMS5: { severity: 'mild',   note: 'Post-peak · Growth mostly complete' },
    CVMS6: { severity: 'moderate', note: 'Mature skeleton · orthopaedic modification very limited' },
  };

  const g = growthMap[stage] ?? { severity: 'info' as Severity, note: '' };
  // Only show the CVM Stage row — C2/C3/C4 inputs are used by engine, not displayed
  return [
    { label: 'CVM Stage', value: stage, status: g.severity, note: g.note },
  ];
}

function mapOPG(opgRecord: PhotoRecord | undefined): DiagnosticItem[] {
  if (!opgRecord?.analysis) return [];
  const a = opgRecord.analysis;
  const items: DiagnosticItem[] = [];
  if (a.additionalFindings?.trim()) {
    items.push({ label: 'Radiographic Findings', value: a.additionalFindings.trim(), status: 'info' });
  }
  if (a.boneLevel)  items.push({ label: 'Bone Level',  value: a.boneLevel,  status: 'info' });
  if (a.tmj)        items.push({ label: 'TMJ',          value: a.tmj,        status: 'info' });
  return items;
}

interface PhotoSection { title: string; label: string; items: DiagnosticItem[] }

const ABNORMAL_VALUES: Record<string, string[]> = {
  canineClass:    ['II', 'III'],
  molarClass:     ['II', 'III'],
  plaqueCaries:   ['Fair', 'Poor'],
  gingivalHealth: ['Mild gingivitis', 'Moderate gingivitis', 'Severe gingivitis', 'Periodontitis'],
  profile:        ['Convex', 'Concave'],
};

function mapPhotoAnalysis(records: PhotoRecord[]): PhotoSection[] {
  const CEPH_INTERNAL_KEYS = new Set([
    'sna','snb','anb','wits','mmp','maxsn','mandbsn','u1pp','l1mandb','u1l1',
    'yaxis','lfhtfh','nasolabial','cvmStage','cvmManualOverride',
    'C2_lower_border','C3_lower_border','C4_lower_border','C3_shape','C4_shape',
    'dentalChart',
  ]);
  return records
    .filter(r => !['xray'].includes(r.type))
    .map(r => {
      if (!r.analysis || Object.keys(r.analysis).length === 0) return null;
      const items: DiagnosticItem[] = Object.entries(r.analysis)
        .filter(([k]) => !CEPH_INTERNAL_KEYS.has(k))
        .map(([k, v]): DiagnosticItem | null => {
          if (!v || String(v).trim() === '') return null;
          const ab = ABNORMAL_VALUES[k];
          const isAbnormal = ab ? ab.some(x => String(v).includes(x)) : false;
          return {
            label:  k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim(),
            value:  String(v),
            status: isAbnormal ? 'mild' : 'normal',
          };
        })
        .filter((i): i is DiagnosticItem => i !== null);
      if (items.length === 0) return null;
      return { title: r.label, label: r.type, items };
    })
    .filter((s): s is PhotoSection => s !== null);
}

function mapCast(castAnalysis: any): DiagnosticItem[] {
  if (!castAnalysis?.result) return [];
  const r = castAnalysis.result;
  const items: DiagnosticItem[] = [];
  const dSev = (sev: string): Severity =>
    sev === 'positive' || sev === 'adequate' ? 'normal' : sev === 'mild' ? 'mild' : sev === 'moderate' ? 'moderate' : 'severe';
  if (r.upper?.total != null) {
    items.push({ label: 'Upper Arch Total', value: `${r.upper.total > 0 ? '+' : ''}${Number(r.upper.total).toFixed(1)} mm`, status: dSev(r.upper.severity), note: r.upper.classification });
  }
  if (r.lower?.total != null) {
    items.push({ label: 'Lower Arch Total', value: `${r.lower.total > 0 ? '+' : ''}${Number(r.lower.total).toFixed(1)} mm`, status: dSev(r.lower.severity), note: r.lower.classification });
  }
  if (r.bolton?.anterior?.value != null) {
    items.push({ label: 'Bolton Anterior', value: `${Number(r.bolton.anterior.value).toFixed(2)}%`, normal: '77.2% (±1.5)', status: r.bolton.anterior.status === 'normal' ? 'normal' : 'mild' });
  }
  if (r.bolton?.total?.value != null) {
    items.push({ label: 'Bolton Total',    value: `${Number(r.bolton.total.value).toFixed(2)}%`,    normal: '91.3% (±1.5)', status: r.bolton.total.status === 'normal' ? 'normal' : 'mild' });
  }
  if (r.ashley?.upper?.interpretation) {
    const s: Severity = r.ashley.upper.interpretation.includes('Unfavourable') ? 'moderate'
      : r.ashley.upper.interpretation.includes('Borderline') ? 'mild' : 'normal';
    items.push({ label: 'Ashley Howe (Upper)', value: `${Number(r.ashley.upper.value ?? 0).toFixed(1)}%`, status: s, note: r.ashley.upper.interpretation });
  }
  return items;
}

// ══════════════ UI PRIMITIVES ═════════════════════════════════════════════════

const STATUS_CFG: Record<Severity, { rowBg: string; badgeBg: string; badgeText: string; icon: React.ReactNode }> = {
  normal:   { rowBg: 'bg-white',         badgeBg: 'bg-emerald-50 border-emerald-100', badgeText: 'text-emerald-600', icon: <CheckCircle2 className="w-3 h-3" /> },
  mild:     { rowBg: 'bg-amber-50/40',   badgeBg: 'bg-amber-50 border-amber-100',    badgeText: 'text-amber-600',   icon: <Info className="w-3 h-3" /> },
  moderate: { rowBg: 'bg-orange-50/40',  badgeBg: 'bg-orange-50 border-orange-100',  badgeText: 'text-orange-600',  icon: <AlertTriangle className="w-3 h-3" /> },
  severe:   { rowBg: 'bg-red-50/40',     badgeBg: 'bg-red-50 border-red-100',        badgeText: 'text-red-600',     icon: <AlertTriangle className="w-3 h-3" /> },
  info:     { rowBg: 'bg-blue-50/20',    badgeBg: 'bg-blue-50 border-blue-100',      badgeText: 'text-blue-600',    icon: <Info className="w-3 h-3" /> },
  absent:   { rowBg: 'bg-slate-50',      badgeBg: 'bg-slate-50 border-slate-100',    badgeText: 'text-slate-400',   icon: <Minus className="w-3 h-3" /> },
};

// Color for the value cell based on measurement status (increased/decreased)
const VALUE_COLOR: Record<string, string> = {
  increased: 'text-red-600 font-black',
  decreased: 'text-orange-500 font-black',
  normal:    'text-slate-700 font-bold',
};

function StatusBadge({ status }: { status: Severity }) {
  const c = STATUS_CFG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold border uppercase tracking-wider ${c.badgeBg} ${c.badgeText}`}>
      {c.icon}
      {status === 'info' ? 'info' : status}
    </span>
  );
}

function MeasurementRow({ item, delay, measurementStatus }: { item: DiagnosticItem; delay: number; measurementStatus?: MeasurementStatus }) {
  const cfg = STATUS_CFG[item.status];
  const valueColor = measurementStatus ? VALUE_COLOR[measurementStatus] : VALUE_COLOR['normal'];
  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className={`border-b border-slate-50 ${cfg.rowBg} transition-colors group`}
    >
      <td className="px-5 py-3.5 text-sm font-bold text-slate-700">{item.label}</td>
      <td className="px-5 py-3.5 text-center">
        <span className={`text-sm ${valueColor}`}>{item.value}</span>
      </td>
      <td className="px-5 py-3.5 text-center text-xs text-slate-400 font-medium">{item.normal ?? '—'}</td>
      <td className="px-5 py-3.5 text-center">
        {item.status === 'normal'
          ? <Minus className="w-4 h-4 text-slate-200 mx-auto" />
          : item.status === 'info'
            ? <Info className="w-4 h-4 text-blue-300 mx-auto" />
            : measurementStatus === 'increased'
              ? <TrendingUp className="w-4 h-4 text-amber-500 mx-auto" />
              : <TrendingDown className="w-4 h-4 text-blue-500 mx-auto" />
        }
      </td>
      <td className="px-5 py-3.5 text-xs font-medium text-slate-500 max-w-[200px] leading-snug">{item.note ?? '—'}</td>
      <td className="px-5 py-3.5 text-center"><StatusBadge status={item.status} /></td>
    </motion.tr>
  );
}

function SectionHeader({ title, subtitle, icon, iconBg }: { title: string; subtitle: string; icon: React.ReactNode; iconBg: string }) {
  return (
    <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>{icon}</div>
      <div>
        <h4 className="text-sm font-bold text-slate-800">{title}</h4>
        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">{subtitle}</p>
      </div>
    </div>
  );
}

const TABLE_HEAD = ['Measurement', 'Value', 'Normal', 'Trend', 'Interpretation', 'Status'];

function MeasurementTable({ items, measurementStatuses }: { items: DiagnosticItem[]; measurementStatuses?: Record<string, MeasurementStatus> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50/50 border-b border-slate-100">
            {TABLE_HEAD.map(h => (
              <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {items.map((item, i) => (
            <MeasurementRow
              key={`${item.label}-${i}`}
              item={item}
              delay={i * 0.035}
              measurementStatus={measurementStatuses?.[item.label]}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptySection({ text }: { text: string }) {
  return (
    <div className="p-10 text-center">
      <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-200">
        <BarChart3 className="w-7 h-7" />
      </div>
      <p className="text-xs text-slate-400 font-medium">{text}</p>
    </div>
  );
}

// ── Clinical Diagnosis Card ────────────────────────────────────────────────────

const CLASS_COLORS: Record<string, { border: string; bg: string; badge: string; badgeText: string }> = {
  I:   { border: 'border-emerald-200', bg: 'bg-emerald-50',  badge: 'bg-emerald-100 text-emerald-700', badgeText: 'text-emerald-700' },
  II:  { border: 'border-amber-200',   bg: 'bg-amber-50',    badge: 'bg-amber-100 text-amber-700',     badgeText: 'text-amber-700' },
  III: { border: 'border-red-200',     bg: 'bg-red-50',      badge: 'bg-red-100 text-red-700',         badgeText: 'text-red-700' },
};

const VERT_COLORS: Record<string, string> = {
  high:   'text-amber-600',
  normal: 'text-emerald-600',
  low:    'text-blue-600',
};

const CVM_BADGE_COLOR: Record<string, string> = {
  CVMS1: 'bg-blue-100 text-blue-700',
  CVMS2: 'bg-blue-100 text-blue-700',
  CVMS3: 'bg-emerald-100 text-emerald-700',
  CVMS4: 'bg-amber-100 text-amber-700',
  CVMS5: 'bg-red-100 text-red-700',
  CVMS6: 'bg-red-100 text-red-700',
};

// ── Malocclusion Badge ─────────────────────────────────────────────────────────
function MalocclusionBadge({ cls }: { cls: MalocclusionClass }) {
  const cfg = getMalocclusionBadgeCfg(cls);
  if (!cfg) return null;
  return (
    <span className={`px-3 py-1 rounded-xl text-xs font-black ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

function DiagnosisCard({ interp, cvmStage, malocclusion }: {
  interp: CephInterpretation;
  cvmStage?: string;
  malocclusion?: MalocclusionClass;
}) {
  const cls = CLASS_COLORS[interp.sagittal.skeletalClass];
  const cvmBadge = cvmStage ? (CVM_BADGE_COLOR[cvmStage] ?? 'bg-slate-100 text-slate-700') : null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border-2 ${cls.border} ${cls.bg} overflow-hidden shadow-sm`}
    >
      <div className="px-5 py-4 border-b border-current/10 flex items-center gap-3" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
        <div className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center">
          <Brain className="w-4.5 h-4.5 text-slate-700" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-black text-slate-800">Clinical Diagnosis</h4>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Rule-based interpretation engine</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {malocclusion && <MalocclusionBadge cls={malocclusion} />}
          {cvmBadge && (
            <span className={`px-3 py-1 rounded-xl text-xs font-black ${cvmBadge}`}>
              {cvmStage}
            </span>
          )}
          <span className={`px-3 py-1 rounded-xl text-xs font-black ${cls.badge}`}>
            Skeletal Class {interp.sagittal.skeletalClass}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Sagittal */}
        <div className="flex gap-3">
          <div className="w-6 h-6 rounded-lg bg-white/80 flex items-center justify-center flex-shrink-0 mt-0.5">
            <ChevronRight className="w-3 h-3 text-slate-500" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Sagittal</p>
            <p className="text-sm font-bold text-slate-800">{interp.sagittal.summary}</p>
          </div>
        </div>

        {/* Vertical */}
        <div className="flex gap-3">
          <div className="w-6 h-6 rounded-lg bg-white/80 flex items-center justify-center flex-shrink-0 mt-0.5">
            <ChevronRight className="w-3 h-3 text-slate-500" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Vertical</p>
            <p className={`text-sm font-bold ${VERT_COLORS[interp.vertical.pattern]}`}>{interp.vertical.summary}</p>
          </div>
        </div>

        {/* Dental */}
        <div className="flex gap-3">
          <div className="w-6 h-6 rounded-lg bg-white/80 flex items-center justify-center flex-shrink-0 mt-0.5">
            <ChevronRight className="w-3 h-3 text-slate-500" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Dental</p>
            <p className="text-sm font-bold text-slate-800">{interp.dental.summary}</p>
            {interp.dental.interIncisal && (
              <p className="text-xs text-slate-500 mt-0.5">{interp.dental.interIncisal}</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ══════════════ MAIN COMPONENT ════════════════════════════════════════════════

const AnalysisStep: React.FC<AnalysisStepProps> = ({ data, onComplete }) => {
  const records      = data.records || [];
  const castAnalysis = (data as any).castAnalysis;

  const cephRecord = records.find(r => r.id === 'ceph');
  const opgRecord  = records.find(r => r.id === 'opg');
  const photoRecords = records; // All records pass through mapPhotoAnalysis (xrays filtered internally)

  // ── Ceph measurements (fixed: reads lowercase keys) ─────────────────────────
  const cephItems  = useMemo(() => mapCeph(cephRecord),  [cephRecord]);
  const cvmItems   = useMemo(() => mapCVM(cephRecord),   [cephRecord]);
  const opgItems   = useMemo(() => mapOPG(opgRecord),    [opgRecord]);
  const photoSecs  = useMemo(() => mapPhotoAnalysis(photoRecords), [records]);
  const castItems  = useMemo(() => mapCast(castAnalysis), [castAnalysis]);

  // ── Malocclusion classification (from lateral intraoral records) ─────────────
  const malocclusion = useMemo((): MalocclusionClass => {
    const right = records.find(r => r.id === 'lateral-right')?.analysis;
    const left  = records.find(r => r.id === 'lateral-left')?.analysis;
    const frontal = records.find(r => r.id === 'frontal-retracted')?.analysis;
    if (!right && !left) return null;
    return classifyMalocclusion({
      right: {
        molarClass:   right?.molarClass,
        canineClass:  right?.canineClass,
        incisorClass: frontal?.incisorClass || right?.incisorClass,
      },
      left: {
        molarClass:   left?.molarClass,
        canineClass:  left?.canineClass,
        incisorClass: frontal?.incisorClass || left?.incisorClass,
      },
    });
  }, [records]);

  // ── Clinical diagnosis interpretation ──────────────────────────────────────
  const interpretation = useMemo((): CephInterpretation | null => {
    if (!cephRecord?.analysis) return null;
    const a = cephRecord.analysis;
    const hasCeph = ['sna','snb','anb','mmp','u1pp','l1mandb'].some(
      k => a[k] !== undefined && a[k] !== ''
    );
    if (!hasCeph) return null;
    return generateCephInterpretation(a);
  }, [cephRecord]);

  // ── Measurement status map for color coding value cells ─────────────────────
  const measurementStatuses = useMemo(() => {
    const map: Record<string, MeasurementStatus> = {};
    if (!cephRecord?.analysis) return map;
    const a = cephRecord.analysis;
    Object.entries(CEPH_NORMS_ENGINE).forEach(([key, norm]) => {
      const raw = a[key];
      if (raw === undefined || raw === '') return;
      const v = parseFloat(String(raw));
      if (!isNaN(v)) {
        map[norm.label] = getMeasurementStatus(v, norm).status;
      }
    });
    return map;
  }, [cephRecord]);

  // ── Overview counts ─────────────────────────────────────────────────────────
  const allItems = useMemo(() => [
    ...cephItems,
    ...cvmItems.filter(i => i.label === 'CVM Stage'),
    ...castItems,
    ...photoSecs.flatMap(s => s.items),
  ], [cephItems, cvmItems, castItems, photoSecs]);

  const totalCount    = allItems.length;
  const abnormalCount = allItems.filter(i => ['mild','moderate','severe'].includes(i.status)).length;
  const normalCount   = allItems.filter(i => i.status === 'normal').length;

  const castSavedAt = (castAnalysis as any)?.savedAt
    ? new Date((castAnalysis as any).savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="space-y-6">

      {/* ── Overview Summary Card ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-xl border border-white/5"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Diagnostic Overview</h3>
              <p className="text-slate-400 text-xs mt-0.5">
                {data.name} · {data.date}
                {castSavedAt && <span className="ml-2 text-emerald-400">· Cast {castSavedAt}</span>}
              </p>
            </div>
          </div>
          <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
            Read Only
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <span className="text-3xl font-black">{totalCount}</span>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1.5">Total Findings</p>
          </div>
          <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/20">
            <span className="text-3xl font-black text-amber-400">{abnormalCount}</span>
            <p className="text-[10px] text-amber-300/60 uppercase tracking-wider mt-1.5">Abnormal</p>
          </div>
          <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20">
            <span className="text-3xl font-black text-emerald-400">{normalCount}</span>
            <p className="text-[10px] text-emerald-300/60 uppercase tracking-wider mt-1.5">Normal</p>
          </div>
        </div>

        {/* Module presence indicators + malocclusion badge */}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          {[
            { label: 'Ceph',   done: cephItems.length > 0  },
            { label: 'CVM',    done: cvmItems.length > 0   },
            { label: 'OPG',    done: opgItems.length > 0   },
            { label: 'Photos', done: photoSecs.length > 0  },
            { label: 'Cast',   done: castItems.length > 0  },
          ].map(m => (
            <span key={m.label} className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${m.done ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-white/25'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${m.done ? 'bg-emerald-400' : 'bg-white/20'}`} />
              {m.label}
            </span>
          ))}
          {malocclusion && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-lg border bg-purple-500/20 border-purple-400/40 text-purple-300">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              {malocclusion}
            </span>
          )}
        </div>
      </motion.div>

      {/* ── Cephalometric Measurements ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <SectionHeader
          title="Cephalometric Analysis"
          subtitle="Lateral Cephalogram Measurements"
          icon={<Ruler className="w-4 h-4" />}
          iconBg="bg-blue-50 text-blue-600"
        />
        {cephItems.length > 0
          ? <MeasurementTable items={cephItems} measurementStatuses={measurementStatuses} />
          : <EmptySection text="Upload a lateral cephalogram in the Records step and enter measurements to see ceph analysis here." />
        }
      </div>

      {/* ── Clinical Diagnosis ─────────────────────────────────────────────── */}
      {interpretation && (
        <div className="space-y-3">
          <DiagnosisCard
            interp={interpretation}
            cvmStage={cephRecord?.analysis?.cvmStage || cephRecord?.analysis?.CVM}
            malocclusion={malocclusion}
          />
        </div>
      )}

      {!interpretation && cephItems.length === 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-500 flex-shrink-0">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-blue-800">Clinical Diagnosis — Pending</p>
            <p className="text-xs text-blue-400 mt-0.5">
              Enter SNA, SNB, ANB and MMP in the Records step to generate the automated orthodontic diagnosis.
            </p>
          </div>
        </div>
      )}

      {/* ── CVM Section ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <SectionHeader
          title="Cervical Vertebral Maturation"
          subtitle="Skeletal Growth Analysis"
          icon={<Layers className="w-4 h-4" />}
          iconBg="bg-violet-50 text-violet-600"
        />
        {cvmItems.length > 0
          ? <MeasurementTable items={cvmItems} />
          : <EmptySection text="CVM stage not recorded — set borders and shape inputs in the Ceph Analysis panel." />
        }
      </div>

      {/* ── OPG / Radiographic Findings ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <SectionHeader
          title="Radiographic Findings (OPG)"
          subtitle="Panoramic Radiograph"
          icon={<Scan className="w-4 h-4" />}
          iconBg="bg-indigo-50 text-indigo-600"
        />
        {opgItems.length > 0
          ? <MeasurementTable items={opgItems} />
          : <EmptySection text="OPG findings not recorded. Add findings in the OPG Analysis panel in Records." />
        }
      </div>

      {/* ── Photo Analysis ──────────────────────────────────────────────────── */}
      {photoSecs.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <SectionHeader
            title="Photo Analysis"
            subtitle="Extraoral · Intraoral · Occlusal"
            icon={<Smile className="w-4 h-4" />}
            iconBg="bg-violet-50 text-violet-600"
          />
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {photoSecs.map(sec => (
              <motion.div
                key={sec.title}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-slate-50 rounded-xl p-4 border border-slate-100"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-slate-700">{sec.title}</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase bg-white px-2 py-0.5 rounded-md border border-slate-200">{sec.label}</span>
                </div>
                <div className="space-y-1.5">
                  {sec.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">{item.label}</span>
                      <span className={`font-bold ${['mild','moderate','severe'].includes(item.status) ? 'text-red-600' : 'text-slate-700'}`}>
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ── Cast Analysis ───────────────────────────────────────────────────── */}
      {castAnalysis ? (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <SectionHeader
              title="Cast Analysis"
              subtitle="Space · Bolton TSD · Ashley Howe"
              icon={<Ruler className="w-4 h-4" />}
              iconBg="bg-rose-50 text-rose-600"
            />
            {castItems.length > 0
              ? <MeasurementTable items={castItems} />
              : <EmptySection text="Cast analysis data not available." />
            }
          </div>
          {castAnalysis?.result?.insights?.length > 0 && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-indigo-500" />
                <span className="text-xs font-bold text-indigo-700 uppercase tracking-widest">Clinical Insights</span>
              </div>
              <ul className="space-y-2">
                {castAnalysis.result.insights.map((ins: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-indigo-700 leading-snug">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />
                    {ins}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-400 flex-shrink-0">
            <Ruler className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-rose-700">Cast Analysis not completed</p>
            <p className="text-xs text-rose-400 mt-0.5">
              Use the Cast Analysis button in the Records step sidebar to add space analysis, Bolton ratios, and Ashley Howe index.
            </p>
          </div>
        </div>
      )}

      {/* ── Proceed hint ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-400 py-2">
        <Info className="w-3.5 h-3.5" />
        <span>Review all findings above, then proceed to the Problem List</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </div>
    </div>
  );
};

export default AnalysisStep;
