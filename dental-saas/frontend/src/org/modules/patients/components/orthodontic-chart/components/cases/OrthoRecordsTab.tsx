import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { 
  Camera, 
  FlipHorizontal, 
  FlipVertical, 
  Crop, 
  Trash2, 
  Plus, 
  Maximize2, 
  X, 
  Save, 
  Activity,
  Image as ImageIcon,
  Upload,
  User,
  Calendar,
  FileText,
  ChevronRight,
  ChevronLeft,
  Mic,
  Square,
  Play,
  Pause,
  Volume2,
  Box,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  AlertCircle,
  Target,
  ArrowLeft,
  Eye,
  EyeOff,
  Tag,
  Printer,
  Download,
  Link2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';



import { PhotoRecord, RecordSet } from '../../types';
import { DentalNotationChart } from './DentalNotationChart';
import { ProblemListTab } from './ProblemListTab';
import { TreatmentPlanTab } from './TreatmentPlanTab';
import PhotoBox from './PhotoBox';
import ExtraoralUploadModal from './ExtraoralUploadModal';
import IntraoralUploadModal from './IntraoralUploadModal';
import PhotoViewerModal from './PhotoViewerModal';
import ClinicalRecordsPanel from './ClinicalRecordsPanel';
import QuickActionsPanel from './QuickActionsPanel';
import GridFullscreenModal from './GridFullscreenModal';
import ImageEditorModal from './ImageEditorModal';
import RecordsPhotoGrid from './RecordsPhotoGrid';
import RecordsToolbar from './RecordsToolbar';
import AnalysisSidebar from './AnalysisSidebar';
import ShareCaseModal from './ShareCaseModal';
import PrintRecordsView from './PrintRecordsView';
import PrintLayoutCanvas from './PrintLayoutCanvas';
import OrthoPrintCanvas from './OrthoPrintCanvas';
import { createShareLink } from '../../api/sharedCase.api';
import { useAuth } from '@/context/AuthContext';
import { caseApi as orthodonticsApi } from '../../api/case.api';
import { resolveFileUrl } from '@/utils/resolveFileUrl';
import CompressionPreviewModal from './CompressionPreviewModal';
import { PrintLayout, PrintLayoutImageItem } from '../../types';
const STLViewerModal = React.lazy(() => import('./STLViewerModal'));
const LazyCastAnalysisModal = React.lazy(() => import('../CastAnalysisModal'));



const CEPH_MEASUREMENTS = [
  { id: 'sna', label: 'SNA', norm: 83, sd: 3, unit: '°' },
  { id: 'snb', label: 'SNB', norm: 80, sd: 3, unit: '°' },
  { id: 'anb', label: 'ANB', norm: 2, sd: 2, unit: '°' },
  { id: 'wits', label: 'Wits appraisal', norm: 0.3, sd: 2.6, unit: ' mm' },
  { id: 'mmp', label: 'MMP', norm: 25, sd: 3, unit: '°' },
  { id: 'maxsn', label: 'Max/SN', norm: 9.8, sd: 3, unit: '°' },
  { id: 'mandbsn', label: 'Mandb/SN', norm: 32, sd: 5, unit: '°' },
  { id: 'u1pp', label: 'U1/PP', norm: 112, sd: 5, unit: '°' },
  { id: 'l1mandb', label: 'L1/Mandb', norm: 98, sd: 6, unit: '°' },
  { id: 'u1l1', label: 'U1/L1', norm: 128, sd: 5, unit: '°' },
  { id: 'yaxis', label: 'Y axis angle', norm: 59, sd: 2, unit: '°' },
  { id: 'lfhtfh', label: 'LFH/TFH', norm: 55, sd: 2, unit: '%' },
  { id: 'nasolabial', label: 'Nasolabial angle', norm: 102, sd: 8, unit: '°' },
];

// ─── CVM V2 — imports (engine + icons) ──────────────────────────────────────
// (Imported inline to avoid circular deps with the engine file)
import {
  determineCVMStage,
  BORDER_OPTIONS,
  SHAPE_OPTIONS,
  CVMInput,
  CVMResult,
  BorderStatus,
  VertebralShape,
} from './CVMAnalysisEngine';

/** Color palette for stage badge + recommendations */
const BADGE = {
  blue:   { bg: 'bg-blue-500/20',   border: 'border-blue-500/40',   text: 'text-blue-400'   },
  green:  { bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', text: 'text-emerald-400' },
  orange: { bg: 'bg-orange-500/20',  border: 'border-orange-500/40',  text: 'text-orange-400'  },
  gray:   { bg: 'bg-white/10',       border: 'border-white/20',       text: 'text-white/50'    },
};

/** Confidence → width % for the thin progress bar */
const confWidth = (c: number) => `${Math.round(c * 100)}%`;

// ── CV2 border shape SVG paths ───────────────────────────────────────────────
const CV2_BORDER_OPTIONS: { id: BorderStatus; label: string; path: string }[] = [
  { id: 'flat',    label: 'Flat',    path: 'M 5 12 L 25 12 L 25 24 L 5 24 Z' },
  { id: 'concave', label: 'Concave', path: 'M 5 8 Q 15 16 25 8 L 25 24 L 5 24 Z' },
];

const CVMShapeSelector = ({
  data,
  onChange,
}: {
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) => {
  // ── Read current values from persisted analysis object ──────────────
  const C2b  = (data.C2_lower_border || '') as BorderStatus;
  const C3b  = (data.C3_lower_border || '') as BorderStatus;
  const C4b  = (data.C4_lower_border || '') as BorderStatus;
  const C3s  = (data.C3_shape        || '') as VertebralShape;
  const C4s  = (data.C4_shape        || '') as VertebralShape;
  const manualOverride = (data.cvmManualOverride || '') as any;

  // ── Real-time deterministic computation (< 1ms, synchronous) ────────
  const input: CVMInput = {
    C2_lower_border:       C2b,
    C3_lower_border:       C3b,
    C4_lower_border:       C4b,
    C3_shape:              C3s,
    C4_shape:              C4s,
    manual_override_stage: manualOverride || null,
  };
  const result: CVMResult = determineCVMStage(input);
  const badge = BADGE[result.badge_color];

  // Persist computed stage to analysis data whenever it changes
  useEffect(() => {
    const newStage = result.stage || '';
    if (newStage !== (data.cvmStage || '')) {
      onChange('cvmStage', newStage);
    }
  }, [result.stage]);

  const handleReset = () => {
    ['C2_lower_border','C3_lower_border','C4_lower_border',
     'C3_shape','C4_shape','cvmStage','cvmManualOverride'].forEach(k => onChange(k, ''));
  };

  const borderBtn = (
    selected: BorderStatus,
    key: 'C2_lower_border' | 'C3_lower_border' | 'C4_lower_border',
  ) => (
    <div className="grid grid-cols-2 gap-2">
      {CV2_BORDER_OPTIONS.map(opt => (
        <button
          key={opt.id}
          onClick={() => onChange(key, opt.id)}
          title={opt.label}
          className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
            selected === opt.id
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
          }`}
        >
          <svg width="28" height="20" viewBox="0 0 30 28" className="fill-current">
            <path d={opt.path} />
          </svg>
          <span className="text-[8px] font-bold uppercase tracking-wider">{opt.label}</span>
        </button>
      ))}
    </div>
  );

  const shapeGrid = (
    selected: VertebralShape,
    key: 'C3_shape' | 'C4_shape',
  ) => (
    <div className="grid grid-cols-4 gap-1.5">
      {SHAPE_OPTIONS.map(opt => (
        <button
          key={opt.id}
          onClick={() => onChange(key, opt.id)}
          title={opt.label}
          className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
            selected === opt.id
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 30 30" className="fill-current">
            <path d={opt.path} />
          </svg>
          <span className="text-[7px] font-bold uppercase text-center leading-tight">{opt.abbr}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="p-4 space-y-5 bg-black/40 border-t border-white/10">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">
            CVM Morphological Analysis
          </span>
          <button
            onClick={handleReset}
            className="p-1 hover:bg-white/10 rounded-md text-white/20 hover:text-white transition-colors"
            title="Reset all CVM inputs"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>

        {/* Stage badge */}
        <div className={`px-3 py-1 rounded-lg border ${badge.bg} ${badge.border}`}>
          <span className={`text-[10px] font-bold uppercase tracking-widest ${badge.text}`}>
            {result.stage || 'CVMS ?'}
          </span>
        </div>
      </div>

      {/* ── Real-time result card ───────────────────────────────────── */}
      {result.stage && result.source !== 'incomplete' && (
        <div className={`rounded-2xl border p-3 space-y-2 ${badge.bg} ${badge.border}`}>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${badge.text}`}>
              {result.stage}
              {result.source === 'manual_override' && (
                <span className="ml-2 text-white/40 normal-case">· Manual</span>
              )}
            </span>
            {/* Confidence bar */}
            {result.confidence > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-16 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      result.badge_color === 'green' ? 'bg-emerald-400' :
                      result.badge_color === 'blue'  ? 'bg-blue-400'    :
                                                       'bg-orange-400'
                    }`}
                    style={{ width: confWidth(result.confidence) }}
                  />
                </div>
                <span className="text-[8px] text-white/40 font-medium">
                  {Math.round(result.confidence * 100)}%
                </span>
              </div>
            )}
          </div>

          <p className="text-[10px] font-semibold text-white/80 leading-tight">
            {result.growth_status}
          </p>
          {result.growth_timing && (
            <p className="text-[9px] text-white/40 italic">{result.growth_timing}</p>
          )}

          {/* Clinical recs */}
          {result.clinical_recommendations.length > 0 && (
            <ul className="space-y-1 mt-1">
              {result.clinical_recommendations.map((rec, i) => (
                <li key={i} className="text-[9px] text-white/60 flex items-start gap-1.5">
                  <span className={`mt-0.5 w-1 h-1 rounded-full flex-shrink-0 ${
                    result.badge_color === 'green' ? 'bg-emerald-400' :
                    result.badge_color === 'blue'  ? 'bg-blue-400'    :
                                                     'bg-orange-400'
                  }`} />
                  {rec}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Conflict warnings ────────────────────────────────────────── */}
      {result.warnings.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 space-y-1">
          {result.warnings.map((w, i) => (
            <p key={i} className="text-[9px] text-red-400 font-medium flex items-start gap-1.5">
              <span className="mt-0.5 flex-shrink-0">⚠</span>
              {w.message}
            </p>
          ))}
        </div>
      )}

      {/* ── Input Grid ──────────────────────────────────────────────── */}
      <div className="space-y-4">

        {/* C2 Lower Border */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
              C2 Lower Border
            </span>
            <span className={`text-[9px] font-bold uppercase ${C2b ? 'text-blue-400' : 'text-white/20'}`}>
              {C2b || 'Not Selected'}
            </span>
          </div>
          {borderBtn(C2b, 'C2_lower_border')}
        </div>

        {/* C3 Lower Border */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
              C3 Lower Border
            </span>
            <span className={`text-[9px] font-bold uppercase ${C3b ? 'text-blue-400' : 'text-white/20'}`}>
              {C3b || 'Not Selected'}
            </span>
          </div>
          {borderBtn(C3b, 'C3_lower_border')}
        </div>

        {/* C4 Lower Border */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
              C4 Lower Border
            </span>
            <span className={`text-[9px] font-bold uppercase ${C4b ? 'text-blue-400' : 'text-white/20'}`}>
              {C4b || 'Not Selected'}
            </span>
          </div>
          {borderBtn(C4b, 'C4_lower_border')}
        </div>

        <div className="border-t border-white/10" />

        {/* C3 Shape */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
              C3 Shape
            </span>
            <span className={`text-[9px] font-bold uppercase ${C3s ? 'text-blue-400' : 'text-white/20'}`}>
              {C3s ? SHAPE_OPTIONS.find(s => s.id === C3s)?.abbr : 'Not Selected'}
            </span>
          </div>
          {shapeGrid(C3s, 'C3_shape')}
        </div>

        {/* C4 Shape */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
              C4 Shape
            </span>
            <span className={`text-[9px] font-bold uppercase ${C4s ? 'text-blue-400' : 'text-white/20'}`}>
              {C4s ? SHAPE_OPTIONS.find(s => s.id === C4s)?.abbr : 'Not Selected'}
            </span>
          </div>
          {shapeGrid(C4s, 'C4_shape')}
        </div>
      </div>
    </div>
  );
};

const CephAnalysisTable = ({ 
  data, 
  onChange 
}: { 
  data: Record<string, string>, 
  onChange: (key: string, value: string) => void 
}) => {
  const isOutsideNorm = (val: string, norm: number, sd: number) => {
    const num = parseFloat(val);
    if (isNaN(num)) return false;
    return num < (norm - sd) || num > (norm + sd);
  };

  return (
    <div className="bg-slate-900 rounded-2xl border border-white/10 overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-black">
            <th className="px-4 py-3 text-[10px] font-bold text-white uppercase tracking-widest border-b border-white/10">Measurements</th>
            <th className="px-4 py-3 text-[10px] font-bold text-white uppercase tracking-widest border-b border-white/10 text-center">Value</th>
            <th className="px-4 py-3 text-[10px] font-bold text-white uppercase tracking-widest border-b border-white/10 text-center">Normal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {CEPH_MEASUREMENTS.map((m, idx) => {
            const val = data[m.id] || '';
            const outside = isOutsideNorm(val, m.norm, m.sd);
            
            return (
              <tr key={m.id} className={idx % 2 === 0 ? 'bg-white/5' : 'bg-transparent'}>
                <td className="px-4 py-2.5 text-xs font-bold text-white/80">{m.label}</td>
                <td className="px-4 py-2.5 text-center">
                  <input 
                    type="text"
                    placeholder="--"
                    value={val}
                    onChange={(e) => onChange(m.id, e.target.value)}
                    className={`w-16 bg-transparent border-b border-white/10 text-center text-xs font-bold focus:border-blue-500 outline-none transition-colors placeholder:text-white/10 ${outside ? 'text-red-500' : 'text-white'}`}
                  />
                </td>
                <td className="px-4 py-2.5 text-center text-[10px] font-medium text-white/40">
                  {m.norm}{m.unit} ± {m.sd}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <CVMShapeSelector data={data} onChange={onChange} />
      <div className="p-4 bg-black/60 border-t border-white/10 flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Manual Override:</span>
        <select
          value={data.cvmManualOverride || ''}
          onChange={(e) => {
            onChange('cvmManualOverride', e.target.value);
          }}
          className="bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold text-white outline-none focus:border-purple-500 transition-colors"
        >
          <option value="">Auto (from inputs)</option>
          <option value="CVMS1">CVMS 1 — Pre-Peak (~2 yrs)</option>
          <option value="CVMS2">CVMS 2 — Pre-Peak (~1 yr)</option>
          <option value="CVMS3">CVMS 3 — Peak (active)</option>
          <option value="CVMS4">CVMS 4 — Post-Peak (1–2 yrs)</option>
          <option value="CVMS5">CVMS 5 — Post-Peak (&gt;1 yr)</option>
          <option value="CVMS6">CVMS 6 — Mature</option>
        </select>
      </div>
    </div>
  );
};


interface OrthoRecordsTabProps {
  patientId: string;
  patientName?: string;
  caseId?: string;
  initialData?: RecordSet;
  onUpdate?: (data: Partial<RecordSet>) => void;
  registerActions?: (actions: { print: () => void; exportPdf: () => void; share: () => void }) => void;
}

const DEFAULT_RECORDS: PhotoRecord[] = [
  // Extraoral (7:5 Portrait)
  { id: 'profile-rest', type: 'extraoral', label: 'Profile rest', url: null, aspectRatio: '7:5', orientation: 'portrait', flipH: false, flipV: false, crop: null, analysis: {} },
  { id: 'front-rest', type: 'extraoral', label: 'Front rest', url: null, aspectRatio: '7:5', orientation: 'portrait', flipH: false, flipV: false, crop: null, analysis: {} },
  { id: 'front-smile', type: 'extraoral', label: 'Front smile', url: null, aspectRatio: '7:5', orientation: 'portrait', flipH: false, flipV: false, crop: null, analysis: {} },
  { id: 'oblique', type: 'extraoral', label: 'Oblique', url: null, aspectRatio: '7:5', orientation: 'portrait', flipH: false, flipV: false, crop: null, analysis: {} },
  
  // X-rays (Right side)
  { id: 'ceph', type: 'xray', label: 'Lateral Ceph', url: null, aspectRatio: '4:5', orientation: 'portrait', flipH: false, flipV: false, crop: null, analysis: {} },
  { id: 'opg', type: 'xray', label: 'OPG', url: null, aspectRatio: '16:9', orientation: 'landscape', flipH: false, flipV: false, crop: null, analysis: {} },
  
  // Occlusal (4:3 Landscape)
  { id: 'occlusal-upper', type: 'occlusal', label: 'Occlusal upper', url: null, aspectRatio: '4:3', orientation: 'landscape', flipH: false, flipV: false, crop: null, analysis: { archForm: 'Ovoid', gingivalHealth: 'Healthy', presentTeeth: 'All present', dentalCondition: 'Good', toothPosition: 'Normal', dentalChart: '{}' } },
  { id: 'occlusal-lower', type: 'occlusal', label: 'Occlusal lower', url: null, aspectRatio: '4:3', orientation: 'landscape', flipH: false, flipV: false, crop: null, analysis: { archForm: 'Ovoid', gingivalHealth: 'Healthy', presentTeeth: 'All present', dentalCondition: 'Good', toothPosition: 'Normal', dentalChart: '{}' } },
  
  // Intraoral (16:9 Widescreen)
  { id: 'lateral-right', type: 'intraoral', label: 'Lateral right', url: null, aspectRatio: '16:9', orientation: 'landscape', flipH: false, flipV: false, crop: null, analysis: { canineClass: 'I', molarClass: 'I', canineUnit: 'Full', molarUnit: 'Full' } },
  { id: 'frontal-retracted', type: 'intraoral', label: 'Frontal retracted', url: null, aspectRatio: '16:9', orientation: 'landscape', flipH: false, flipV: false, crop: null, analysis: { plaqueCaries: 'Good', gingivalHealth: 'Healthy', overbite: '2', upperMidlineShift: '0', lowerMidlineShift: '0' } },
  { id: 'lateral-left', type: 'intraoral', label: 'Lateral left', url: null, aspectRatio: '16:9', orientation: 'landscape', flipH: false, flipV: false, crop: null, analysis: { canineClass: 'I', molarClass: 'I', canineUnit: 'Full', molarUnit: 'Full' } },
];

const OrthoRecordsTab: React.FC<OrthoRecordsTabProps> = ({ patientId, patientName, caseId, initialData, onUpdate, registerActions }) => {
  const { token } = useAuth();
  // Safe fallback for initialData to prevent undefined access in child components
  const safeInitialData: RecordSet = initialData || {
    id: '',
    name: '',
    date: new Date().toISOString().split('T')[0],
    records: [],
    chiefComplaint: '',
    audioUrl: null,
    stlFiles: [],
  };
  // ── Step 6: Lazy initialization — start empty, let useEffect populate ──────
  // This eliminates the root cause: DEFAULT_RECORDS (url:null) can never
  // accidentally be sent to the backend before real data arrives.
  const [records, setRecords] = useState<PhotoRecord[]>([]);
  const recordsInitializedRef = useRef(false);

  useEffect(() => {
    if (recordsInitializedRef.current) return; // already initialized

    // Build the initial records from initialData or defaults
    const sourceRecords = initialData?.records || [];
    const hasServerUrls = sourceRecords.some(r => r.url);

    if (sourceRecords.length === 0 && !initialData) {
      // No data at all yet — wait for it
      return;
    }

    const merged = DEFAULT_RECORDS.map(def => {
      const found = sourceRecords.find(r => r.id === def.id);
      return found || def;
    });

    setRecords(merged);

    // Only mark as initialized if we got actual server data (with URLs)
    // OR if there's no caseId (brand new case, no backend data expected)
    if (hasServerUrls || !initialData?.records?.length) {
      recordsInitializedRef.current = true;
    }

    console.log('[OrthoRecordsTab] Records initialized:', {
      source: hasServerUrls ? 'server' : 'defaults',
      withUrls: merged.filter(r => r.url).length,
      total: merged.length,
    });
  }, [initialData]);

  // ── Step 1: Hydration sync — catch late-arriving restored data ──────────────
  // If CaseWorkflowContainer's loadWorkflow() resolves AFTER first render,
  // merge restored records (with URLs) into state without overwriting uploads.
  const hasHydratedRecords = useRef(false);
  useEffect(() => {
    if (!initialData?.records?.length) return;
    const hasServerUrls = initialData.records.some(r => r.url);
    if (!hasServerUrls) return;
    if (hasHydratedRecords.current) return;
    hasHydratedRecords.current = true;

    // Also mark records as initialized — we got real data
    recordsInitializedRef.current = true;

    setRecords(prev => {
      if (prev.length === 0) {
        // Not initialized yet — just use server data directly
        return DEFAULT_RECORDS.map(def => {
          const server = initialData.records!.find(r => r.id === def.id);
          return server || def;
        });
      }
      // Already have state — merge carefully
      return DEFAULT_RECORDS.map(def => {
        const fromServer = initialData.records!.find(r => r.id === def.id);
        const fromState  = prev.find(r => r.id === def.id);
        // Priority: local URL (user just uploaded) > server URL > state > default
        if (fromState?.url) return fromState;
        if (fromServer?.url) return fromServer;
        return fromState || fromServer || def;
      });
    });
    console.log('[OrthoRecordsTab] Hydrated records from server:',
      initialData.records.filter(r => r.url).length, 'photos');
  }, [initialData?.records]);

  const [activeSubTab, setActiveSubTab] = useState<'records' | 'problem-list' | 'treatment-plan'>('records');
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const [problemList, setProblemList] = useState(initialData?.problemList || null);
  const [treatmentPlan, setTreatmentPlan] = useState(initialData?.treatmentPlan || null);
  const [chiefComplaint, setChiefComplaint] = useState(initialData?.chiefComplaint ?? 'Sk.cl.I, Canine and molar Cl. I. Periodontically compromised L1.');
  const [stlFiles, setStlFiles] = useState<{ id: string, name: string, url: string }[]>(initialData?.stlFiles || []);
  const [audioUrl, setAudioUrl] = useState<string | null>(initialData?.audioUrl || null);

  const [selectedPhoto, setSelectedPhoto] = useState<PhotoRecord | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isExtraoralModalOpen, setIsExtraoralModalOpen] = useState(false);
  const [isIntraoralModalOpen, setIsIntraoralModalOpen] = useState(false);
  const [isGridFullscreenOpen, setIsGridFullscreenOpen] = useState(false);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [occlusalViewMode, setOcclusalViewMode] = useState<'upper' | 'lower' | 'both'>('both');
  // Overlay state — consolidated
  const [overlayState, setOverlayState] = useState({
    midline: { visible: false, x: 50, y: 40 },
    profileLine: { visible: false, x: 50, rotation: 0 },
    dentalMidlines: { visible: false, facial: 50, upper: 50, lower: 50 },
    lateralLines: {
      visible: false,
      right: { canineUpper: 60, canineLower: 60, molarUpper: 40, molarLower: 40 },
      left: { canineUpper: 40, canineLower: 40, molarUpper: 60, molarLower: 60 },
    },
  });

  const updateOverlay = useCallback((path: string[], value: any) => {
    setOverlayState(prev => {
      const newState = structuredClone(prev);
      let ref: any = newState;
      for (let i = 0; i < path.length - 1; i++) {
        ref = ref[path[i]];
      }
      ref[path[path.length - 1]] = value;
      return newState;
    });
  }, []);
  const [showLabels, setShowLabels] = useState(true);
  const [blurPatientName, setBlurPatientName] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stlInputRef = useRef<HTMLInputElement>(null);

  // ── Compression Preview State ────────────────────────────────────────────────
  const [isCompressionModalOpen, setIsCompressionModalOpen] = useState(false);
  const [compressionPendingFile, setCompressionPendingFile] = useState<File | null>(null);

  // STL State
  const [isStlViewerOpen, setIsStlViewerOpen] = useState(false);
  const [selectedStl, setSelectedStl] = useState<{ id: string, name: string, url: string } | null>(null);

  // Print / PDF / Share state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
  const [isPrintCanvasOpen, setIsPrintCanvasOpen] = useState(false);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [printLayout, setPrintLayout] = useState<PrintLayout | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  // Cast Analysis modal state
  const [showCastAnalysis, setShowCastAnalysis] = useState(false);
  // Hidden off-screen canvas ref for PDF capture
  const pdfCaptureRef = useRef<HTMLDivElement>(null);

  // ── SINGLE CENTRALIZED SAVE EFFECT ──────────────────────────────────────────
  // This is the ONLY place onUpdate is ever called.
  // No onUpdate inside setState, handlers, or render — React-safe.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string | null>(null);

  // Hydration guard — block saves for 600ms after mount
  const isHydratedRef = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { isHydratedRef.current = true; }, 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Guard: not hydrated yet
    if (!isHydratedRef.current) return;
    // Guard: records not initialized from server/defaults
    if (!recordsInitializedRef.current) return;
    // Guard: empty records (should never save)
    if (records.length === 0) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const payload = {
        records,
        chiefComplaint,
        problemList,
        treatmentPlan,
        stlFiles,
        audioUrl
      };

      // Dirty check — skip if nothing changed since last save
      const serialized = JSON.stringify(payload);
      if (serialized === lastSavedRef.current) {
        return;
      }
      lastSavedRef.current = serialized;

      console.log('[OrthoRecordsTab] SAVE:', {
        photosWithUrl: payload.records.filter(r => r.url).length,
        total: payload.records.length,
      });

      // Microtask ensures we never update parent mid-render
      Promise.resolve().then(() => {
        onUpdate?.(payload);
      });
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [records, chiefComplaint, problemList, treatmentPlan, stlFiles, audioUrl, onUpdate]);

  const handleStlUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        // Upload to server — get persistent URL
        const response = await orthodonticsApi.uploadStl(file);
        const serverUrl = response.data?.data?.url || response.data?.url;

        if (!serverUrl) {
          // Upload succeeded but API returned no URL — reject (do NOT store blob)
          console.error('[OrthoRecordsTab] STL upload returned no URL. Refusing to store blob URL.', response.data);
          return;
        }

        const newStl = {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          url: serverUrl, // ✅ PERSISTENT URL ONLY
        };
        setStlFiles(prev => [...prev, newStl]);
        setSelectedStl(newStl);
        setIsStlViewerOpen(true);
      } catch (err) {
        // ❌ DO NOT store blob URL on failure — it would contaminate the DB
        // Log the error and leave the slot empty. User can retry.
        console.error('[OrthoRecordsTab] STL upload failed. Blob URL NOT stored (reload-unsafe).', err);
        // Optionally show a user-facing error toast here
      }
    }
  }, []);




  // ── File Input Handler → Opens Compression Preview ──────────────────────────
  // Instead of uploading directly, intercept the file and show compression modal.
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedPhoto) {
      setCompressionPendingFile(file);
      setIsCompressionModalOpen(true);
    }
    // Reset file input so the same file can be re-selected
    if (e.target) e.target.value = '';
  }, [selectedPhoto]);

  // ── Compression Confirm → Proceed with Upload ───────────────────────────────
  const handleCompressionConfirm = useCallback(async (file: File) => {
    setIsCompressionModalOpen(false);
    setCompressionPendingFile(null);

    if (!selectedPhoto) return;

    // ─ STEP 1: Immediate blob preview (UI-only, NEVER saved to DB) ────────────
    // Show the user their photo instantly while the upload is in-flight.
    // previewUrl is set; record.url stays null → save guard will skip it.
    // PhotoBox renders previewUrl when url is null (shows spinner badge).
    const previewUrl = URL.createObjectURL(file);
    setRecords(prev => prev.map(r =>
      r.id === selectedPhoto.id ? { ...r, previewUrl, url: r.url ?? null } : r
    ));

    try {
      // ─ STEP 2: Upload to server ────────────────────────────────────────────
      const response = await orthodonticsApi.uploadPhoto(file);
      console.log('[OrthoRecordsTab] UPLOAD RESPONSE:', response.data);

      const serverUrl = response.data?.data?.url || response.data?.url;
      console.log('[OrthoRecordsTab] Resolved URL:', serverUrl, 'for photo:', selectedPhoto.id);

      if (serverUrl) {
        // ─ STEP 3: Commit REAL server URL, clear blob preview ─────────────────
        // record.url is now set → this is what gets saved to the DB.
        // previewUrl is cleared so the uploading badge disappears.
        const updatedRecords = records.map(r =>
          r.id === selectedPhoto.id
            ? { ...r, url: serverUrl, previewUrl: null } // ✅ persistent URL
            : r
        );

        setRecords(updatedRecords);
        setSelectedPhoto(prev => prev ? { ...prev, url: serverUrl, previewUrl: null } : null);

        // IMMEDIATE SAVE — bypass 300ms debounce.
        // Strip previewUrl before saving (Container also does this as a safety net).
        const immediatePayload = {
          records: updatedRecords,
          chiefComplaint,
          problemList,
          treatmentPlan,
          stlFiles,
          audioUrl
        };
        lastSavedRef.current = JSON.stringify(immediatePayload);
        onUpdate?.(immediatePayload);
        console.log('[OrthoRecordsTab] IMMEDIATE SAVE after upload:', {
          photosWithUrl: updatedRecords.filter(r => r.url).length,
        });
      } else {
        // Upload succeeded but no URL returned — keep blob preview, don't save
        console.error('[OrthoRecordsTab] Upload response missing URL. Blob preview kept, NOT saved.', response.data);
      }
    } catch (err) {
      // ─ STEP 3b: Upload failed ─────────────────────────────────────────────
      // ❌ DO NOT: setRecords(r => ({ ...r, url: blobUrl })) — would contaminate DB
      // ✅ DO:     leave previewUrl set (user sees photo), url stays null (not saved)
      console.error('[OrthoRecordsTab] Photo upload failed. Blob preview kept for UX, NOT saved to DB.', err);
      // previewUrl is already set from STEP 1 — user can see the photo.
      // On next autosave, the record is skipped because url is null (save guard in Container).
    }
  }, [selectedPhoto, records, chiefComplaint, problemList, treatmentPlan, stlFiles, audioUrl, onUpdate]);


  // ── Compression Cancel ──────────────────────────────────────────────────────
  const handleCompressionCancel = useCallback(() => {
    setIsCompressionModalOpen(false);
    setCompressionPendingFile(null);
  }, []);

  // Helper: determine which photos should be affected by flip operations
  const getRelatedPhotos = (id: string): PhotoRecord[] => {
    const photo = records.find(r => r.id === id);
    if (!photo) return [];

    // Occlusal BOTH mode: flip both occlusal photos together
    if (photo.id.includes('occlusal') && occlusalViewMode === 'both') {
      return records.filter(r => r.id === 'occlusal-upper' || r.id === 'occlusal-lower');
    }

    // Lateral photos: flip both lateral photos together
    if (photo.id === 'lateral-right' || photo.id === 'lateral-left') {
      return records.filter(r => r.id === 'lateral-right' || r.id === 'lateral-left');
    }

    // Default: single photo
    return [photo];
  };

  const toggleFlipH = useCallback((id: string) => {
    const photos = getRelatedPhotos(id);
    setRecords(prev => prev.map(r => {
      if (photos.some(p => p.id === r.id)) {
        return { ...r, flipH: !r.flipH };
      }
      return r;
    }));
    if (selectedPhoto && photos.some(p => p.id === selectedPhoto.id)) {
      setSelectedPhoto(prev => prev ? { ...prev, flipH: !prev.flipH } : null);
    }
  }, [selectedPhoto, records, occlusalViewMode]);

  const toggleFlipV = useCallback((id: string) => {
    const photos = getRelatedPhotos(id);
    setRecords(prev => prev.map(r => {
      if (photos.some(p => p.id === r.id)) {
        return { ...r, flipV: !r.flipV };
      }
      return r;
    }));
    if (selectedPhoto && photos.some(p => p.id === selectedPhoto.id)) {
      setSelectedPhoto(prev => prev ? { ...prev, flipV: !prev.flipV } : null);
    }
  }, [selectedPhoto, records, occlusalViewMode]);

  const removePhoto = (id: string) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, url: null, flipH: false, flipV: false, rotation: 0, crop: null, analysis: {} } : r));
    if (selectedPhoto?.id === id) setSelectedPhoto(null);
  };

  const updateRotation = useCallback((id: string, rotation: number) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, rotation } : r));
    if (selectedPhoto?.id === id) {
      setSelectedPhoto(prev => prev ? { ...prev, rotation } : null);
    }
  }, [selectedPhoto]);

  const updateAnalysis = useCallback((id: string, key: string, value: string) => {
    const isOcclusal = id === 'occlusal-upper' || id === 'occlusal-lower';
    
    setRecords(prev => prev.map(r => {
      if (r.id === id || (isOcclusal && key === 'dentalChart' && (r.id === 'occlusal-upper' || r.id === 'occlusal-lower'))) {
        const newAnalysis = { ...(r.analysis || {}), [key]: value };
        return { ...r, analysis: newAnalysis };
      }
      return r;
    }));
    
    setSelectedPhoto(prev => {
      if (!prev) return null;
      if (prev.id === id || (isOcclusal && key === 'dentalChart' && (prev.id === 'occlusal-upper' || prev.id === 'occlusal-lower'))) {
        const newAnalysis = { ...(prev.analysis || {}), [key]: value };
        return { ...prev, analysis: newAnalysis };
      }
      return prev;
    });
  }, []);




  const getAspectRatioClass = (ratio: string) => {
    if (!ratio) return 'aspect-square';
    switch (ratio) {
      case '7:5': return 'aspect-[5/7]'; // Portrait
      case '4:5': return 'aspect-[4/5]'; // X-ray Portrait
      case '4:3': return 'aspect-[4/3]'; // Landscape
      case '16:9': return 'aspect-[16/9]'; // Widescreen
      default: return 'aspect-square';
    }
  };

  // ── Print / Export PDF / Share handlers ───────────────────────────────────

  // Open the print layout canvas
  const handlePrint = useCallback(() => {
    setIsPrintCanvasOpen(true);
  }, []);

  // Direct print (called from within the Print Layout Canvas toolbar)
  // Captures the already-mounted off-screen OrthoPrintCanvas (scale=1) and
  // injects its exact HTML into a new window for browser printing.
  const handleDirectPrint = useCallback(() => {
    const target = pdfCaptureRef.current;
    if (!target) return;

    const canvasHtml = target.outerHTML;
    const canvasW = target.offsetWidth;
    const canvasH = target.offsetHeight;

    const win = window.open('', '', `width=${canvasW},height=${canvasH}`);
    if (!win) return;

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${patientName || 'Orthodontic Records'}</title>
          <style>
            /* Reset */
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

            body {
              margin: 0;
              padding: 0;
              background: #fff;
              font-family: Georgia, serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            /* Canvas wrapper — scale to fit page width on print */
            #print-area {
              width: ${canvasW}px;
              height: ${canvasH}px;
              position: relative;
              overflow: hidden;
            }

            /* All absolutely-positioned children must keep their positions */
            #print-area * {
              box-sizing: border-box;
            }

            @media print {
              @page {
                size: ${canvasW}px ${canvasH}px;
                margin: 0;
              }
              body {
                width: ${canvasW}px;
                height: ${canvasH}px;
              }
              #print-area {
                width: ${canvasW}px;
                height: ${canvasH}px;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div id="print-area">${canvasHtml}</div>
        </body>
      </html>
    `);

    win.document.close();

    // Wait for images to load before printing
    const imgs = win.document.querySelectorAll('img');
    const totalImgs = imgs.length;

    if (totalImgs === 0) {
      setTimeout(() => { win.focus(); win.print(); }, 300);
      return;
    }

    let loaded = 0;
    const tryPrint = () => {
      loaded += 1;
      if (loaded >= totalImgs) {
        setTimeout(() => { win.focus(); win.print(); }, 200);
      }
    };

    imgs.forEach(img => {
      if (img.complete) {
        tryPrint();
      } else {
        img.addEventListener('load', tryPrint);
        img.addEventListener('error', tryPrint); // still print even if one fails
      }
    });
  }, [patientName]);

  // Persist printLayout to workflowData
  const handleSaveLayout = useCallback(async (layout: PrintLayout) => {
    if (!caseId) return;
    setPrintLayout(layout);
    await orthodonticsApi.saveWorkflow(caseId, { printLayout: layout });
  }, [caseId]);

  const handleExportPdf = useCallback(async () => {
    if (isPdfExporting) return; // prevent double-click
    setIsPdfExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      // Target: the hidden off-screen OrthoPrintCanvas (always mounted, scale=1)
      const target = pdfCaptureRef.current;
      if (!target) throw new Error('PDF capture target not mounted');

      const canvas = await html2canvas(target, {
        scale: 2,              // 2x for crisp output
        useCORS: true,         // load cross-origin images
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
      });

      // A4 landscape: 297mm × 210mm
      const pdf = new jsPDF('l', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');
      const pdfW = pdf.internal.pageSize.getWidth();   // 297
      const pdfH = pdf.internal.pageSize.getHeight();  // 210

      // Scale image to fit page exactly (preserve aspect ratio)
      const imgAspect = canvas.width / canvas.height;
      const pageAspect = pdfW / pdfH;
      let drawW = pdfW;
      let drawH = pdfH;
      if (imgAspect > pageAspect) {
        drawH = pdfW / imgAspect;
      } else {
        drawW = pdfH * imgAspect;
      }
      // Centre on page
      const offsetX = (pdfW - drawW) / 2;
      const offsetY = (pdfH - drawH) / 2;

      pdf.addImage(imgData, 'PNG', offsetX, offsetY, drawW, drawH);
      pdf.save(`${patientName || 'records'}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsPdfExporting(false);
    }
  }, [isPdfExporting, patientName]);

  const handleShare = useCallback(() => {
    setIsShareModalOpen(true);
  }, []);

  // ── Register actions for parent header buttons ─────────────────────────────
  useEffect(() => {
    registerActions?.({
      print: handlePrint,
      exportPdf: handleExportPdf,
      share: handleShare,
    });
  }, [registerActions, handlePrint, handleExportPdf, handleShare]);

  return (
    <div className="space-y-8 pb-12 w-full max-w-7xl mx-auto px-4">

      {/* PDF Export Loading Overlay */}
      {isPdfExporting && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 px-10 py-8 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl">
            <div className="w-10 h-10 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-sm font-bold text-white">Generating PDF…</p>
              <p className="text-[11px] text-slate-400 mt-1">Capturing canvas layout at 2× resolution</p>
            </div>
          </div>
        </div>
      )}
      {activeSubTab === 'records' ? (
        <>
          <RecordsPhotoGrid
            records={records}
            patientName={patientName || 'Patient Records'}
            chiefComplaint={chiefComplaint}
            date={initialData?.date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            showLabels={showLabels}
            blurPatientName={blurPatientName}
            getAspectRatioClass={getAspectRatioClass}
            onToggleLabels={() => setShowLabels(prev => !prev)}
            onToggleBlurName={() => setBlurPatientName(prev => !prev)}
            onOpenFullscreen={() => setIsGridFullscreenOpen(true)}
            onSelectPhoto={setSelectedPhoto}
            onTriggerUpload={() => fileInputRef.current?.click()}
            onFullscreen={(r) => { setSelectedPhoto(r); setIsFullscreenOpen(true); }}
            onEdit={(r) => { setSelectedPhoto(r); setIsEditModalOpen(true); }}
            onPrint={handlePrint}
            onExportPdf={handleExportPdf}
            onShare={handleShare}
          />

          {/* Cast Analysis status card */}
          {(() => {
            const ca = (initialData as any)?.castAnalysis;
            const status = !ca?.savedAt ? 'none' : 'done';
            return (
              <button
                onClick={() => setShowCastAnalysis(true)}
                className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border transition-all group ${
                  status === 'done'
                    ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-slate-50 border-slate-200 hover:bg-rose-50 hover:border-rose-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    status === 'done' ? 'bg-emerald-100' : 'bg-slate-100 group-hover:bg-rose-100'
                  }`}>
                    <svg className={`w-5 h-5 ${status === 'done' ? 'text-emerald-600' : 'text-slate-400 group-hover:text-rose-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
                  </div>
                  <div className="text-left">
                    <p className={`text-sm font-bold ${status === 'done' ? 'text-emerald-700' : 'text-slate-600'}`}>
                      Cast Analysis
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {status === 'done'
                        ? `Completed · ${new Date(ca.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                        : 'Space analysis · Bolton TSD · Ashley Howe'}
                    </p>
                  </div>
                </div>
                <div className={`text-[10px] font-bold px-3 py-1.5 rounded-xl border ${
                  status === 'done'
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200 group-hover:bg-rose-100 group-hover:text-rose-600 group-hover:border-rose-200'
                }`}>
                  {status === 'done' ? '✓ Completed' : '+ Add Analysis'}
                </div>
              </button>
            );
          })()}
        </>
      ) : activeSubTab === 'problem-list' ? (
        <ProblemListTab 
          data={{ ...safeInitialData, records, problemList: problemList || undefined, treatmentPlan: treatmentPlan || undefined }} 
          onUpdate={(newData) => {
            if (newData.problemList) setProblemList(newData.problemList);
          }}
          onOpenPhotoViewer={() => setIsPhotoViewerOpen(true)}
        />
      ) : (
        <TreatmentPlanTab 
          data={{ ...safeInitialData, records, problemList: problemList || undefined, treatmentPlan: treatmentPlan || undefined }}
          onUpdate={(newData) => {
            if (newData.treatmentPlan) setTreatmentPlan(newData.treatmentPlan);
          }}
          onOpenPhotoViewer={() => setIsPhotoViewerOpen(true)}
        />
      )}



    {/* Clinical Records + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {activeSubTab === 'records' ? (
          <ClinicalRecordsPanel
            patientId={patientId}
            chiefComplaint={chiefComplaint}
            onChiefComplaintChange={setChiefComplaint}
            audioUrl={audioUrl}
            onAudioChange={setAudioUrl}
          />
        ) : (
          <div className="lg:col-span-2" />
        )}

        <QuickActionsPanel
          activeSubTab={activeSubTab}
          onTabChange={setActiveSubTab}
          stlFiles={stlFiles}
          onStlUpload={() => stlInputRef.current?.click()}
          onOpenStl={(file) => { setSelectedStl(file); setIsStlViewerOpen(true); }}
          onOpenExtraoral={() => setIsExtraoralModalOpen(true)}
          onOpenIntraoral={() => setIsIntraoralModalOpen(true)}
          onOpenCastAnalysis={() => setShowCastAnalysis(true)}
        />
      </div>

      {/* Hidden File Inputs */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileInputChange} 
        accept="image/*" 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={stlInputRef} 
        onChange={handleStlUpload} 
        accept=".stl" 
        className="hidden" 
      />


      {/* Compression Preview Modal */}
      <CompressionPreviewModal
        isOpen={isCompressionModalOpen}
        originalFile={compressionPendingFile}
        onConfirm={handleCompressionConfirm}
        onCancel={handleCompressionCancel}
      />

      {/* STL Viewer Modal (Lazy Loaded) */}
      <React.Suspense fallback={null}>
        <STLViewerModal
          isOpen={isStlViewerOpen}
          selectedStl={selectedStl}
          onClose={() => setIsStlViewerOpen(false)}
        />
      </React.Suspense>



      {/* Grid Fullscreen Modal (Extracted) */}
      <GridFullscreenModal
        isOpen={isGridFullscreenOpen}
        records={records}
        patientName={patientName || 'Patient Records'}
        chiefComplaint={chiefComplaint}
        date={initialData?.date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        showLabels={showLabels}
        blurPatientName={blurPatientName}
        getAspectRatioClass={getAspectRatioClass}
        onClose={() => setIsGridFullscreenOpen(false)}
        onSelectPhoto={setSelectedPhoto}
        onTriggerUpload={() => fileInputRef.current?.click()}
        onFullscreen={(r) => { setSelectedPhoto(r); setIsFullscreenOpen(true); }}
        onEdit={(r) => { setSelectedPhoto(r); setIsEditModalOpen(true); }}
      />


      {/* Fullscreen Modal */}
      <AnimatePresence>
        {isFullscreenOpen && selectedPhoto && selectedPhoto.url && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950 overflow-y-auto scroll-smooth">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              onClick={() => setIsFullscreenOpen(false)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full h-full flex flex-col lg:flex-row items-stretch overflow-hidden"
            >
              {/* Main Image Area */}
              <div className="flex-1 flex flex-col relative min-h-0 bg-slate-950">
                <div className="absolute top-6 left-6 flex items-center gap-4 z-20">
                  <div className="px-4 py-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/10">
                    <span className="text-sm font-bold text-white uppercase tracking-widest">{selectedPhoto.label}</span>
                  </div>
                </div>

                {/* Top-Right Action Buttons */}
                <div className="absolute top-6 right-6 flex items-center gap-2 z-20">
                  <button
                    onClick={handlePrint}
                    className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/10 text-white hover:bg-white/20 transition-all"
                    title="Print Records"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleExportPdf}
                    className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/10 text-white hover:bg-white/20 transition-all"
                    title="Export PDF"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleShare}
                    className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/10 text-white hover:bg-white/20 transition-all"
                    title="Share Records"
                  >
                    <Link2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center p-8 md:p-16 pb-32 min-h-0 relative">
                  <div className="relative w-full h-full flex items-center justify-center">
                    {(selectedPhoto.id === 'occlusal-upper' || selectedPhoto.id === 'occlusal-lower') ? (
                      <div className="w-full h-full flex flex-col md:flex-row gap-8 items-center justify-center">
                        {/* Occlusal Upper */}
                        {(occlusalViewMode === 'upper' || occlusalViewMode === 'both') && (
                          <div className="flex-1 h-full flex flex-col items-center justify-center relative group">
                            <div className="absolute top-0 left-0 px-3 py-1 bg-purple-500/20 backdrop-blur-md rounded-lg border border-purple-500/30 z-10">
                              <span className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">Upper Occlusal</span>
                            </div>
                            {records.find(r => r.id === 'occlusal-upper')?.url ? (
                              <div className="relative flex items-center justify-center">
                                <img 
                                  src={resolveFileUrl(records.find(r => r.id === 'occlusal-upper')?.url)} 
                                  alt="Upper Occlusal"
                                  className="max-w-full max-h-full w-auto h-auto shadow-2xl block object-contain rounded-2xl border border-white/5"
                                  style={{ 
                                    transform: `rotate(${records.find(r => r.id === 'occlusal-upper')?.rotation || 0}deg) scaleX(${records.find(r => r.id === 'occlusal-upper')?.flipH ? -1 : 1}) scaleY(${records.find(r => r.id === 'occlusal-upper')?.flipV ? -1 : 1})`,
                                    referrerPolicy: 'no-referrer'
                                  } as any}
                                />
                              </div>
                            ) : (
                              <div className="w-full h-full border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 bg-white/5">
                                <Camera className="w-12 h-12 text-white/20" />
                                <span className="text-xs font-bold text-white/20 uppercase tracking-widest">No Upper Photo</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Occlusal Lower */}
                        {(occlusalViewMode === 'lower' || occlusalViewMode === 'both') && (
                          <div className="flex-1 h-full flex flex-col items-center justify-center relative group">
                            <div className="absolute top-0 left-0 px-3 py-1 bg-purple-500/20 backdrop-blur-md rounded-lg border border-purple-500/30 z-10">
                              <span className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">Lower Occlusal</span>
                            </div>
                            {records.find(r => r.id === 'occlusal-lower')?.url ? (
                              <div className="relative flex items-center justify-center">
                                <img 
                                  src={resolveFileUrl(records.find(r => r.id === 'occlusal-lower')?.url)} 
                                  alt="Lower Occlusal"
                                  className="max-w-full max-h-full w-auto h-auto shadow-2xl block object-contain rounded-2xl border border-white/5"
                                  style={{ 
                                    transform: `rotate(${records.find(r => r.id === 'occlusal-lower')?.rotation || 0}deg) scaleX(${records.find(r => r.id === 'occlusal-lower')?.flipH ? -1 : 1}) scaleY(${records.find(r => r.id === 'occlusal-lower')?.flipV ? -1 : 1})`,
                                    referrerPolicy: 'no-referrer'
                                  } as any}
                                />
                              </div>
                            ) : (
                              <div className="w-full h-full border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 bg-white/5">
                                <Camera className="w-12 h-12 text-white/20" />
                                <span className="text-xs font-bold text-white/20 uppercase tracking-widest">No Lower Photo</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (selectedPhoto.id === 'lateral-right' || selectedPhoto.id === 'lateral-left') ? (
                      <div className="w-full h-full flex flex-col md:flex-row gap-8 items-center justify-center">
                        {/* Lateral Right */}
                        <div className="flex-1 h-full flex flex-col items-center justify-center relative group">
                          <div className="absolute top-0 left-0 px-3 py-1 bg-blue-500/20 backdrop-blur-md rounded-lg border border-blue-500/30 z-10">
                            <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">Right Lateral</span>
                          </div>
                          {records.find(r => r.id === 'lateral-right')?.url ? (
                            <div className="relative flex items-center justify-center">
                              <img 
                                src={resolveFileUrl(records.find(r => r.id === 'lateral-right')?.url)} 
                                alt="Right Lateral"
                                className="max-w-full max-h-full w-auto h-auto shadow-2xl block object-contain rounded-2xl border border-white/5"
                                style={{ 
                                  transform: `rotate(${records.find(r => r.id === 'lateral-right')?.rotation || 0}deg) scaleX(${records.find(r => r.id === 'lateral-right')?.flipH ? -1 : 1}) scaleY(${records.find(r => r.id === 'lateral-right')?.flipV ? -1 : 1})`,
                                  referrerPolicy: 'no-referrer'
                                } as any}
                              />
                              
                              {overlayState.lateralLines.visible && (
                                <>
                                  {/* Right Canine Lines */}
                                  <div 
                                    className="absolute top-0 h-[85%] w-0.5 z-20 pointer-events-none bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                                    style={{ left: `${overlayState.lateralLines.right.canineUpper}%` }}
                                  >
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-rose-400 uppercase tracking-tighter whitespace-nowrap">Canine U</div>
                                  </div>
                                  <div 
                                    className="absolute bottom-0 h-1/2 w-0.5 z-20 pointer-events-none bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                    style={{ left: `${overlayState.lateralLines.right.canineLower}%` }}
                                  >
                                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-blue-400 uppercase tracking-tighter whitespace-nowrap">Canine L</div>
                                  </div>
                                  
                                  {/* Right Molar Lines */}
                                  <div 
                                    className="absolute top-0 h-[85%] w-0.5 z-20 pointer-events-none bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                                    style={{ left: `${overlayState.lateralLines.right.molarUpper}%` }}
                                  >
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-rose-400 uppercase tracking-tighter whitespace-nowrap">Molar U</div>
                                  </div>
                                  <div 
                                    className="absolute bottom-0 h-1/2 w-0.5 z-20 pointer-events-none bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                    style={{ left: `${overlayState.lateralLines.right.molarLower}%` }}
                                  >
                                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-blue-400 uppercase tracking-tighter whitespace-nowrap">Molar L</div>
                                  </div>
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="w-full h-full border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 bg-white/5">
                              <Camera className="w-12 h-12 text-white/20" />
                              <span className="text-xs font-bold text-white/20 uppercase tracking-widest">No Right Photo</span>
                            </div>
                          )}
                        </div>

                        {/* Lateral Left */}
                        <div className="flex-1 h-full flex flex-col items-center justify-center relative group">
                          <div className="absolute top-0 left-0 px-3 py-1 bg-rose-500/20 backdrop-blur-md rounded-lg border border-rose-500/30 z-10">
                            <span className="text-[10px] font-bold text-rose-300 uppercase tracking-widest">Left Lateral</span>
                          </div>
                          {records.find(r => r.id === 'lateral-left')?.url ? (
                            <div className="relative flex items-center justify-center">
                              <img 
                                src={resolveFileUrl(records.find(r => r.id === 'lateral-left')?.url)} 
                                alt="Left Lateral"
                                className="max-w-full max-h-full w-auto h-auto shadow-2xl block object-contain rounded-2xl border border-white/5"
                                style={{ 
                                  transform: `rotate(${records.find(r => r.id === 'lateral-left')?.rotation || 0}deg) scaleX(${records.find(r => r.id === 'lateral-left')?.flipH ? -1 : 1}) scaleY(${records.find(r => r.id === 'lateral-left')?.flipV ? -1 : 1})`,
                                  referrerPolicy: 'no-referrer'
                                } as any}
                              />

                              {overlayState.lateralLines.visible && (
                                <>
                                  {/* Left Canine Lines */}
                                  <div 
                                    className="absolute top-0 h-[85%] w-0.5 z-20 pointer-events-none bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                                    style={{ left: `${overlayState.lateralLines.left.canineUpper}%` }}
                                  >
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-rose-400 uppercase tracking-tighter whitespace-nowrap">Canine U</div>
                                  </div>
                                  <div 
                                    className="absolute bottom-0 h-1/2 w-0.5 z-20 pointer-events-none bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                    style={{ left: `${overlayState.lateralLines.left.canineLower}%` }}
                                  >
                                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-blue-400 uppercase tracking-tighter whitespace-nowrap">Canine L</div>
                                  </div>
                                  
                                  {/* Left Molar Lines */}
                                  <div 
                                    className="absolute top-0 h-[85%] w-0.5 z-20 pointer-events-none bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                                    style={{ left: `${overlayState.lateralLines.left.molarUpper}%` }}
                                  >
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-rose-400 uppercase tracking-tighter whitespace-nowrap">Molar U</div>
                                  </div>
                                  <div 
                                    className="absolute bottom-0 h-1/2 w-0.5 z-20 pointer-events-none bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                                    style={{ left: `${overlayState.lateralLines.left.molarLower}%` }}
                                  >
                                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-blue-400 uppercase tracking-tighter whitespace-nowrap">Molar L</div>
                                  </div>
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="w-full h-full border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 bg-white/5">
                              <Camera className="w-12 h-12 text-white/20" />
                              <span className="text-xs font-bold text-white/20 uppercase tracking-widest">No Left Photo</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <img 
                          src={resolveFileUrl(selectedPhoto.url)} 
                          alt={selectedPhoto.label}
                          className="max-w-full max-h-full w-auto h-auto shadow-2xl block object-contain"
                          style={{ 
                            transform: `rotate(${selectedPhoto.rotation || 0}deg) scaleX(${selectedPhoto.flipH ? -1 : 1}) scaleY(${selectedPhoto.flipV ? -1 : 1})`,
                            referrerPolicy: 'no-referrer'
                          } as any}
                        />
                        
                        {/* Midline Overlay */}
                        {overlayState.midline.visible && (
                          <div className="absolute inset-0 pointer-events-none">
                            {/* Vertical Midline */}
                            <div 
                              className="absolute top-0 bottom-0 w-px bg-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.5)] z-20"
                              style={{ left: `${overlayState.midline.x}%` }}
                            />
                            {/* Inter-pupillary Line (Horizontal) */}
                            <div 
                              className="absolute left-0 right-0 h-px bg-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.5)] z-20"
                              style={{ top: `${overlayState.midline.y}%` }}
                            />
                            {/* Center Point */}
                            <div 
                              className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)] z-30"
                              style={{ left: `${overlayState.midline.x}%`, top: `${overlayState.midline.y}%` }}
                            />
                          </div>
                        )}

                        {/* Profile Reference Line Overlay */}
                        {overlayState.profileLine.visible && selectedPhoto.id === 'profile-rest' && (
                          <div className="absolute inset-0 pointer-events-none overflow-hidden">
                            <div 
                              className="absolute top-[-50%] bottom-[-50%] w-px bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)] z-20"
                              style={{ 
                                left: `${overlayState.profileLine.x}%`,
                                transform: `rotate(${overlayState.profileLine.rotation}deg)`
                              }}
                            />
                            <div className="absolute top-6 right-6 px-3 py-1 bg-indigo-500/20 backdrop-blur-md rounded-lg border border-indigo-500/30">
                              <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">E-Line Reference</span>
                            </div>
                          </div>
                        )}

                        {/* Dental Midlines Overlay */}
                        {overlayState.dentalMidlines.visible && selectedPhoto.id === 'frontal-retracted' && (
                          <div className="absolute inset-0 pointer-events-none">
                            {/* Facial Midline (Reference) */}
                            <div 
                              className="absolute top-0 bottom-0 w-px bg-white/60 shadow-[0_0_8px_rgba(255,255,255,0.4)] z-20"
                              style={{ left: `${overlayState.dentalMidlines.facial}%` }}
                            >
                              <div className="absolute top-4 left-2 px-2 py-0.5 bg-white/20 backdrop-blur-md rounded text-[8px] font-bold text-white uppercase">Facial</div>
                            </div>
                            
                            {/* Upper Dental Midline */}
                            <div 
                              className="absolute top-0 bottom-0 w-px bg-blue-400/80 shadow-[0_0_8px_rgba(96,165,250,0.5)] z-20"
                              style={{ left: `${overlayState.dentalMidlines.upper}%` }}
                            >
                              <div className="absolute top-12 left-2 px-2 py-0.5 bg-blue-500/20 backdrop-blur-md rounded text-[8px] font-bold text-blue-300 uppercase">Upper</div>
                            </div>

                            {/* Lower Dental Midline */}
                            <div 
                              className="absolute top-0 bottom-0 w-px bg-rose-400/80 shadow-[0_0_8px_rgba(251,113,133,0.5)] z-20"
                              style={{ left: `${overlayState.dentalMidlines.lower}%` }}
                            >
                              <div className="absolute bottom-12 left-2 px-2 py-0.5 bg-rose-500/20 backdrop-blur-md rounded text-[8px] font-bold text-rose-300 uppercase">Lower</div>
                            </div>

                            {/* Shift Indicators */}
                            {Math.abs(overlayState.dentalMidlines.upper - overlayState.dentalMidlines.facial) > 0.1 && (
                              <div 
                                className="absolute top-20 h-0.5 bg-blue-400/40 z-10 flex items-center justify-center"
                                style={{ 
                                  left: `${Math.min(overlayState.dentalMidlines.facial, overlayState.dentalMidlines.upper)}%`,
                                  width: `${Math.abs(overlayState.dentalMidlines.upper - overlayState.dentalMidlines.facial)}%`
                                }}
                              >
                                <div className="absolute -top-4 text-[8px] font-bold text-blue-300 whitespace-nowrap">
                                  Upper Shift: {((overlayState.dentalMidlines.upper - overlayState.dentalMidlines.facial) * 0.5).toFixed(1)}mm
                                </div>
                              </div>
                            )}

                            {Math.abs(overlayState.dentalMidlines.lower - overlayState.dentalMidlines.facial) > 0.1 && (
                              <div 
                                className="absolute bottom-20 h-0.5 bg-rose-400/40 z-10 flex items-center justify-center"
                                style={{ 
                                  left: `${Math.min(overlayState.dentalMidlines.facial, overlayState.dentalMidlines.lower)}%`,
                                  width: `${Math.abs(overlayState.dentalMidlines.lower - overlayState.dentalMidlines.facial)}%`
                                }}
                              >
                                <div className="absolute -bottom-4 text-[8px] font-bold text-rose-300 whitespace-nowrap">
                                  Lower Shift: {((overlayState.dentalMidlines.lower - overlayState.dentalMidlines.facial) * 0.5).toFixed(1)}mm
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Records Toolbar (Extracted) */}
                <RecordsToolbar
                  selectedPhoto={selectedPhoto}
                  overlayState={overlayState}
                  updateOverlay={updateOverlay}
                  onFlipH={() => toggleFlipH(selectedPhoto.id)}
                  onFlipV={() => toggleFlipV(selectedPhoto.id)}
                  onUpdateAnalysis={updateAnalysis}
                />
              </div>

              {/* Analysis Sidebar (Dispatched) */}
              <AnalysisSidebar
                selectedPhoto={selectedPhoto}
                records={records}
                onUpdateAnalysis={updateAnalysis}
                onClose={() => setIsFullscreenOpen(false)}
                occlusalViewMode={occlusalViewMode}
                setOcclusalViewMode={setOcclusalViewMode}
                onSelectPhoto={setSelectedPhoto}
                renderCephTable={(data, onChange) => (
                  <CephAnalysisTable data={data} onChange={onChange} />
                )}
                caseId={caseId}
                patientId={patientId}
                patientName={patientName}
              />


              {/* Close button for non-analysis photos */}
              {selectedPhoto.id !== 'front-rest' && 
               selectedPhoto.id !== 'front-smile' && 
               selectedPhoto.id !== 'profile-rest' && 
               selectedPhoto.id !== 'oblique' && 
               selectedPhoto.id !== 'lateral-right' && 
               selectedPhoto.id !== 'lateral-left' && 
               selectedPhoto.id !== 'frontal-retracted' && 
               selectedPhoto.id !== 'occlusal-upper' && 
               selectedPhoto.id !== 'occlusal-lower' && 
               selectedPhoto.id !== 'ceph' && (
                <div className="absolute top-6 right-6 z-10">
                  <button 
                    onClick={() => setIsFullscreenOpen(false)}
                    className="p-3 bg-white/10 backdrop-blur-md rounded-xl text-white hover:bg-white/20 transition-all border border-white/10"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Image Editor Modal (Extracted) */}
      <ImageEditorModal
        isOpen={isEditModalOpen}
        selectedPhoto={selectedPhoto}
        getAspectRatioClass={getAspectRatioClass}
        onClose={() => setIsEditModalOpen(false)}
        onFlipH={(id) => toggleFlipH(id)}
        onFlipV={(id) => toggleFlipV(id)}
        onRemove={removePhoto}
        onUpload={() => fileInputRef.current?.click()}
        onSaveCrop={(photoId, croppedUrl) => {
          setRecords(prev => prev.map(r => r.id === photoId ? { ...r, url: croppedUrl } : r));
          setSelectedPhoto(prev => prev ? { ...prev, url: croppedUrl } : null);
        }}
        onRotationChange={updateRotation}
        onUpdateAnalysis={updateAnalysis}
        cephMeasurements={CEPH_MEASUREMENTS}
      />



      {/* Extraoral Upload Modal */}
      <ExtraoralUploadModal
        isOpen={isExtraoralModalOpen}
        onClose={() => setIsExtraoralModalOpen(false)}
        records={records}
        getAspectRatioClass={getAspectRatioClass}
        onSelectPhoto={setSelectedPhoto}
        onTriggerUpload={() => fileInputRef.current?.click()}
      />

      {/* Intraoral Upload Modal */}
      <IntraoralUploadModal
        isOpen={isIntraoralModalOpen}
        onClose={() => setIsIntraoralModalOpen(false)}
        records={records}
        getAspectRatioClass={getAspectRatioClass}
        onSelectPhoto={setSelectedPhoto}
        onTriggerUpload={() => fileInputRef.current?.click()}
      />

      {/* Photo Viewer Modal */}
      <PhotoViewerModal
        isOpen={isPhotoViewerOpen}
        onClose={() => setIsPhotoViewerOpen(false)}
        records={records}
        patientName={patientName}
        onSelectPhoto={setSelectedPhoto}
        onFullscreen={() => setIsFullscreenOpen(true)}
        blurPatientName={blurPatientName}
      />

      {/* Share Case Modal — passes empty recordSets: modal always fetches fresh from backend on open */}
      <ShareCaseModal
        isOpen={isShareModalOpen}
        caseId={caseId || ''}
        recordSets={[]}
        token={token || ''}
        onClose={() => setIsShareModalOpen(false)}
      />


      {/* Print Layout Canvas — full-screen drag-and-drop layout editor */}
      <PrintLayoutCanvas
        isOpen={isPrintCanvasOpen}
        photos={records.filter(r => !!r.url)}
        initialLayout={printLayout}
        patientName={patientName}
        onSave={handleSaveLayout}
        onPrint={handleDirectPrint}
        onExportPdf={handleExportPdf}
        onClose={() => setIsPrintCanvasOpen(false)}
      />

      {/* Hidden off-screen OrthoPrintCanvas — captured by html2canvas for PDF export.
          Always mounted so pdfCaptureRef is always available.
          Uses saved layout if set; otherwise auto-grid of uploaded photos. */}
      {(() => {
        const uploadedPhotos = records.filter(r => !!r.url);
        const cols = Math.ceil(Math.sqrt(uploadedPhotos.length || 1));
        const rows = Math.ceil((uploadedPhotos.length || 1) / cols);
        const itemW = Math.floor((1122 - (cols + 1) * 10) / cols);
        const itemH = Math.floor((794  - (rows + 1) * 10) / rows);
        const autoItems: PrintLayoutImageItem[] = uploadedPhotos.map((photo, idx) => ({
          id: `auto-${photo.id}`,
          type: 'image' as const,
          recordId: photo.id,
          x:  10 + (idx % cols) * (itemW + 10),
          y:  10 + Math.floor(idx / cols) * (itemH + 10),
          width: itemW,
          height: itemH,
          objectFit: 'contain' as const,
          showLabel: true,
        }));
        const captureLayout: PrintLayout = printLayout ?? {
          canvasWidth: 1122,
          canvasHeight: 794,
          items: autoItems,
        };
        return (
          <OrthoPrintCanvas
            ref={pdfCaptureRef}
            layout={captureLayout}
            photos={uploadedPhotos}
            scale={1}
            editing={false}
            style={{
              position: 'fixed',
              top: -9999,
              left: -9999,
              zIndex: -1,
              pointerEvents: 'none',
            }}
          />
        );
      })()}

      {/* ── Cast Analysis Modal ──────────────────────────────────────── */}
      {showCastAnalysis && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center">
            <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium text-slate-600">Loading Cast Analysis...</span>
            </div>
          </div>
        }>
          <LazyCastAnalysisModal
            patientId={patientId}
            caseId={caseId}
            onClose={() => setShowCastAnalysis(false)}
            initialInput={
              // Hydrate from existing record set castAnalysis.input if available
              (initialData as any)?.castAnalysis?.input ?? undefined
            }
            onChange={(input, result) => {
              // Live change — update record set in auto-save pipeline
              onUpdate?.({
                castAnalysis: {
                  input,
                  result,
                  savedAt: (initialData as any)?.castAnalysis?.savedAt ?? '',
                },
              } as any);
            }}
            onSaveComplete={(result, input) => {
              // User explicitly clicked Save — commit with timestamp
              const savedAt = new Date().toISOString();
              onUpdate?.({
                castAnalysis: { input, result, savedAt },
              } as any);
              console.log('[OrthoRecordsTab] Cast Analysis committed to record set:', savedAt);
            }}
          />
        </Suspense>
      )}

    </div>
  );
};

export default OrthoRecordsTab;
