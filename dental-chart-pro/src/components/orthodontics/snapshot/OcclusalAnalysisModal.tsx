/**
 * OcclusalAnalysisModal.tsx
 * Domain: clinical-snapshots / orthodontic-cases
 * Phase: 3.X — Analysis → Pretreatment Snapshot
 *
 * Occlusal / intraoral analysis form.
 * On save: creates/updates a pretreatment snapshot with Occlusal diagnosticData.
 * Pre-populates from the active pretreatment version.
 * ALWAYS creates a new version — never mutates existing snapshots.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Stethoscope, ChevronDown, Save, Loader2,
  CheckCircle2, AlertTriangle, Info, History,
  ScanLine,
} from 'lucide-react';
import {
  useLatestPretreatmentSnapshot,
  useSavePretreatmentSnapshot,
  OcclusalDiagnosticData,
} from '../../../hooks/useClinicalSnapshots';
import SnapEditorPanel, { SnapChartState } from './SnapEditorPanel';

// ── Types ──────────────────────────────────────────────────────────────────────

interface OcclusalAnalysisModalProps {
  caseId:       string;
  isOpen:       boolean;
  onClose:      () => void;
  /**
   * Initial chart state seed (e.g. from parent chart editor).
   * Optional — modal owns chart state via SnapEditorPanel.
   */
  chartState?:  Record<string, unknown>;
  onSaveSuccess?: (version: number) => void;
}

type ArchForm        = NonNullable<OcclusalDiagnosticData['archForm']>;
type GingivalHealth  = NonNullable<OcclusalDiagnosticData['gingivalHealth']>;
type MidlineDev      = NonNullable<NonNullable<OcclusalDiagnosticData['occlusion']>['midlineDeviation']>;
type Crossbite       = NonNullable<NonNullable<OcclusalDiagnosticData['occlusion']>['crossbite']>;
type MolarRelation   = NonNullable<NonNullable<OcclusalDiagnosticData['occlusion']>['molarRelation']>;

// ── Option sets ───────────────────────────────────────────────────────────────

const ARCH_OPTIONS: { value: ArchForm; label: string }[] = [
  { value: '',        label: 'Select...' },
  { value: 'ovoid',   label: 'Ovoid' },
  { value: 'tapered', label: 'Tapered' },
  { value: 'square',  label: 'Square' },
];

const GINGIVAL_OPTIONS: { value: GingivalHealth; label: string }[] = [
  { value: '',           label: 'Select...' },
  { value: 'healthy',    label: 'Healthy' },
  { value: 'inflamed',   label: 'Inflamed / Gingivitis' },
  { value: 'recession',  label: 'Recession' },
];

const MIDLINE_OPTIONS: { value: MidlineDev; label: string }[] = [
  { value: '',       label: 'Select...' },
  { value: 'none',   label: 'Coincident (no deviation)' },
  { value: 'upper',  label: 'Upper midline deviation' },
  { value: 'lower',  label: 'Lower midline deviation' },
  { value: 'both',   label: 'Both' },
];

const CROSSBITE_OPTIONS: { value: Crossbite; label: string }[] = [
  { value: '',           label: 'Select...' },
  { value: 'none',       label: 'None' },
  { value: 'anterior',   label: 'Anterior crossbite' },
  { value: 'posterior',  label: 'Posterior crossbite' },
];

const MOLAR_OPTIONS: { value: MolarRelation; label: string }[] = [
  { value: '',          label: 'Select...' },
  { value: 'class-i',   label: 'Class I' },
  { value: 'class-ii',  label: 'Class II' },
  { value: 'class-iii', label: 'Class III' },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

const FieldLabel: React.FC<{ label: string; hint?: string }> = ({ label, hint }) => (
  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
    {label}
    {hint && <span className="text-[9px] font-medium text-slate-300 normal-case tracking-normal">({hint})</span>}
  </label>
);

const SelectField: React.FC<{
  value:    string;
  onChange: (v: string) => void;
  options:  readonly { value: string; label: string }[];
}> = ({ value, onChange, options }) => (
  <div className="relative">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 pr-8 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
    <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
  </div>
);

const MeasurementInput: React.FC<{
  value:       string;
  onChange:    (v: string) => void;
  placeholder: string;
  unit:        string;
}> = ({ value, onChange, placeholder, unit }) => (
  <div className="relative">
    <input
      type="number"
      step="0.1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 pr-10 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
    />
    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-medium pointer-events-none">
      {unit}
    </span>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────

const OcclusalAnalysisModal: React.FC<OcclusalAnalysisModalProps> = ({
  caseId,
  isOpen,
  onClose,
  chartState,
  onSaveSuccess,
}) => {
  const {
    snapshot: existingSnapshot,
    isLoading: loadingSnapshot,
    hasSnapshot,
    refetch: refetchSnapshot,
  } = useLatestPretreatmentSnapshot(caseId);

  const {
    savePretreatmentSnapshotAsync,
    isSaving,
    isConflict,
    error: saveError,
    reset,
  } = useSavePretreatmentSnapshot();

  // ── Auto-refetch on open (FIX 8) ───────────────────────────────────────────
  useEffect(() => {
    if (isOpen) refetchSnapshot();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── SnapEditor state (Phase 3.X UI Refactor) ──────────────────────────────
  const [snapEditorOpen,      setSnapEditorOpen]      = useState(false);
  const [snapEditorMinimized, setSnapEditorMinimized] = useState(false);

  // localChartState is the SSOT for chart data in this modal.
  // SnapEditorPanel writes here; savePretreatmentSnapshotAsync reads here.
  const [localChartState, setLocalChartState] = useState<SnapChartState | null>(null);

  // Auto-open SnapEditor on first use (no existing pretreatment snapshot)
  useEffect(() => {
    if (isOpen && !hasSnapshot && !snapEditorOpen) {
      setSnapEditorOpen(true);
    }
  }, [isOpen, hasSnapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset SnapEditor state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSnapEditorOpen(false);
      setSnapEditorMinimized(false);
    }
  }, [isOpen]);

  // ── Local form state ────────────────────────────────────────────────────────
  const [archForm, setArchForm]               = useState<ArchForm>('');
  const [gingivalHealth, setGingivalHealth]   = useState<GingivalHealth>('');
  const [anteriorOverjet, setAnteriorOverjet] = useState('');
  const [anteriorOverbite, setAnteriorOverbite] = useState('');
  const [midlineDeviation, setMidlineDeviation] = useState<MidlineDev>('');
  const [crossbite, setCrossbite]             = useState<Crossbite>('');
  const [molarRelation, setMolarRelation]     = useState<MolarRelation>('');
  const [saved, setSaved]                     = useState(false);
  const [savedVersion, setSavedVersion]       = useState<number | null>(null);

  // ── Hydrate from existing active snapshot ──────────────────────────────────
  useEffect(() => {
    if (!existingSnapshot) return;
    const occ = existingSnapshot.diagnosticData?.modules?.occlusal;
    if (!occ) return;
    setArchForm(occ.archForm       ?? '');
    setGingivalHealth(occ.gingivalHealth ?? '');
    setAnteriorOverjet(occ.occlusion?.anteriorOverjet   ?? '');
    setAnteriorOverbite(occ.occlusion?.anteriorOverbite ?? '');
    setMidlineDeviation(occ.occlusion?.midlineDeviation ?? '');
    setCrossbite(occ.occlusion?.crossbite               ?? '');
    setMolarRelation(occ.occlusion?.molarRelation       ?? '');
  }, [existingSnapshot]);

  // ── Reset on close ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setSaved(false);
      setSavedVersion(null);
      reset();
    }
  }, [isOpen, reset]);

  // ── Validation ─────────────────────────────────────────────────────────────
  const hasAnyInput = !!(archForm || gingivalHealth || anteriorOverjet || anteriorOverbite || midlineDeviation || crossbite || molarRelation);
  // FIX 10: block while loading snapshot or in conflict state
  const canSave = hasAnyInput && !isSaving && !saved && !loadingSnapshot && !isConflict;

  // ── Save handler ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!canSave) return;

    const occlusalData: OcclusalDiagnosticData = {
      type:           'OCCLUSAL',
      archForm:       archForm       || undefined,
      gingivalHealth: gingivalHealth || undefined,
      occlusion: {
        anteriorOverjet:   anteriorOverjet  || undefined,
        anteriorOverbite:  anteriorOverbite || undefined,
        midlineDeviation:  midlineDeviation || undefined,
        crossbite:         crossbite        || undefined,
        molarRelation:     molarRelation    || undefined,
      },
    };

    // FIX 1/2: Pass ONLY the Occlusal module — useSavePretreatmentSnapshot
    // fetches the current server state and merges OPG automatically.
    // DO NOT read existingSnapshot.opg here — it may be stale.
    try {
      const result = await savePretreatmentSnapshotAsync({
        caseId,
        // FIX 4 (UI Refactor): use localChartState from SnapEditorPanel
        // Fall back to serialized form of existingSnapshot or empty object
        chartState: (localChartState ?? existingSnapshot?.chartState ?? {}) as Record<string, unknown>,
        diagnosticData: { occlusal: occlusalData },  // ← only our module
        expectedVersion: existingSnapshot ? existingSnapshot.version : null,
      });

      const newVersion = (result as unknown as Record<string, unknown>)?.version as number | undefined;
      setSavedVersion(newVersion ?? null);
      setSaved(true);
      onSaveSuccess?.(newVersion ?? 1);

      setTimeout(onClose, 1800);
    } catch {
      // isConflict / saveError drive UI — no additional handling here
    }
  };

  if (!isOpen) return null;

  const currentVersion = existingSnapshot?.version ?? 0;
  const nextVersion    = currentVersion + 1;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.97, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          className="w-full max-w-2xl max-h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-start justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                <Stethoscope className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-800">Occlusal Analysis</h2>
                  <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase tracking-widest">
                    Pretreatment Snapshot • V{nextVersion}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  {hasSnapshot
                    ? `Active baseline: V${currentVersion} · Saving creates V${nextVersion}`
                    : 'First pretreatment snapshot — creates V1'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* Loading skeleton */}
            {loadingSnapshot && (
              <div className="space-y-3 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-10 bg-slate-100 rounded-xl" />
                ))}
              </div>
            )}

            {/* Success state */}
            <AnimatePresence>
              {saved && (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center justify-center py-10 gap-3"
                >
                  <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-blue-500" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">
                    Pretreatment Snapshot V{savedVersion ?? nextVersion} saved
                  </p>
                  <p className="text-[11px] text-slate-400">Occlusal analysis persisted.</p>
                </motion.div>
              )}
            </AnimatePresence>

            {!saved && !loadingSnapshot && (
              <>
                {/* Existing version info */}
                {hasSnapshot && (
                  <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-2xl">
                    <History className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-blue-700 leading-relaxed">
                      <strong>Loaded from V{currentVersion}.</strong> Saving creates V{nextVersion} —
                      prior version preserved in history.
                    </p>
                  </div>
                )}

                {/* Arch & Gingival */}
                <section>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                    Arch Form & Soft Tissue
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <FieldLabel label="Arch Form" />
                      <SelectField
                        value={archForm}
                        onChange={(v) => setArchForm(v as ArchForm)}
                        options={ARCH_OPTIONS}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel label="Gingival Health" />
                      <SelectField
                        value={gingivalHealth}
                        onChange={(v) => setGingivalHealth(v as GingivalHealth)}
                        options={GINGIVAL_OPTIONS}
                      />
                    </div>
                  </div>
                </section>

                {/* Occlusal measurements */}
                <section>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                    Occlusal Measurements
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <FieldLabel label="Anterior Overjet" hint="mm" />
                      <MeasurementInput
                        value={anteriorOverjet}
                        onChange={setAnteriorOverjet}
                        placeholder="0.0"
                        unit="mm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel label="Anterior Overbite" hint="mm" />
                      <MeasurementInput
                        value={anteriorOverbite}
                        onChange={setAnteriorOverbite}
                        placeholder="0.0"
                        unit="mm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel label="Midline Deviation" />
                      <SelectField
                        value={midlineDeviation}
                        onChange={(v) => setMidlineDeviation(v as MidlineDev)}
                        options={MIDLINE_OPTIONS}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel label="Molar Relation" />
                      <SelectField
                        value={molarRelation}
                        onChange={(v) => setMolarRelation(v as MolarRelation)}
                        options={MOLAR_OPTIONS}
                      />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <FieldLabel label="Crossbite" />
                      <SelectField
                        value={crossbite}
                        onChange={(v) => setCrossbite(v as Crossbite)}
                        options={CROSSBITE_OPTIONS}
                      />
                    </div>
                  </div>
                </section>

                {/* ── Open Snap Editor button (Phase 3.X UI Refactor) ────────── */}
                <div className="mt-2">
                  <button
                    id="occlusal-open-snap-editor-btn"
                    onClick={() => {
                      setSnapEditorOpen(true);
                      setSnapEditorMinimized(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold hover:opacity-90 active:scale-95 transition-all shadow-md shadow-purple-900/20"
                  >
                    <span className="flex items-center gap-2">
                      <ScanLine className="w-3.5 h-3.5" />
                      Open Snap Editor
                    </span>
                    {localChartState && (
                      <span className="flex items-center gap-1 text-[9px] font-bold text-green-300">
                        <CheckCircle2 className="w-3 h-3" />
                        Chart Ready
                      </span>
                    )}
                  </button>
                </div>

                {/* Validation hint */}
                {!hasAnyInput && (
                  <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
                    <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-700">
                      Complete at least one field to enable saving.
                    </p>
                  </div>
                )}

                {/* FIX 3: Conflict banner */}
                <AnimatePresence>
                  {isConflict && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-start gap-3 px-4 py-3 bg-orange-50 border border-orange-300 rounded-2xl"
                    >
                      <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[11px] text-orange-700 font-semibold">
                          Snapshot updated by another session.
                        </p>
                        <p className="text-[10px] text-orange-600 mt-0.5">
                          Reload below to get the latest version, then re-enter your findings.
                        </p>
                      </div>
                      <button
                        onClick={() => { reset(); refetchSnapshot(); }}
                        className="flex-shrink-0 px-3 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg text-[10px] font-bold transition-colors"
                      >
                        Reload
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Error (non-conflict) */}
                <AnimatePresence>
                  {saveError && !isConflict && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl"
                    >
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-red-700">
                        {(saveError as Error).message}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>

          {/* Footer */}
          {!saved && (
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between flex-shrink-0 bg-slate-50/50">
              <p className="text-[10px] text-slate-400 font-medium">
                Saves as <strong className="text-blue-600">Pretreatment Snapshot V{nextVersion}</strong>
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!canSave}
                  id="occlusal-snapshot-save-btn"
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-600/20 disabled:shadow-none"
                >
                  {isSaving ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
                  ) : (
                    <><Save className="w-3.5 h-3.5" />Save as Pretreatment Snapshot</>
                  )}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>

    {/* ── SnapEditorPanel — sibling of backdrop, layered at z-[100+] */}

    <SnapEditorPanel
      isOpen={snapEditorOpen}
      isMinimized={snapEditorMinimized}
      onMinimize={() => setSnapEditorMinimized(true)}
      onRestore={() => setSnapEditorMinimized(false)}
      onClose={() => setSnapEditorOpen(false)}
      initialChartState={existingSnapshot?.chartState as Record<string, unknown> | undefined}
      onChange={(cs) => setLocalChartState(cs)}
    />
    </>
  );
};

export default OcclusalAnalysisModal;
