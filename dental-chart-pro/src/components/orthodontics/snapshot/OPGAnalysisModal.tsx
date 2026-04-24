/**
 * OPGAnalysisModal.tsx
 * Domain: clinical-snapshots / orthodontic-cases
 * Phase: 3.X — Analysis → Pretreatment Snapshot
 *
 * Radiographic (OPG) analysis form.
 * On save: creates/updates a pretreatment snapshot with OPG diagnosticData.
 * Loads the existing active pretreatment baseline from the snapshot system.
 * ALWAYS creates a new version — never mutates existing snapshots.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ScanLine, ChevronDown, Save, Loader2,
  CheckCircle2, AlertTriangle, Info, History,
} from 'lucide-react';
import {
  useLatestPretreatmentSnapshot,
  useSavePretreatmentSnapshot,
  OPGDiagnosticData,
  MergedDiagnosticData,
} from '../../../hooks/useClinicalSnapshots';
import SnapEditorPanel, { SnapChartState } from './SnapEditorPanel';

// ── Types ──────────────────────────────────────────────────────────────────────

interface OPGAnalysisModalProps {
  caseId:      string;
  isOpen:      boolean;
  onClose:     () => void;
  /**
   * Initial chart state seed (e.g. from parent chart editor).
   * Optional — modal owns chart state via SnapEditorPanel.
   */
  chartState?:  Record<string, unknown>;
  onSaveSuccess?: (version: number) => void;
}

type CondyleSymmetry    = "symmetric" | "asymmetric" | "";
type SinusStatus        = "clear" | "opacified" | "";
type BoneLevel          = "normal" | "reduced" | "severe-reduction" | "";
type RootMorphology     = "normal" | "dilacerated" | "short" | "";

// ── Option sets ───────────────────────────────────────────────────────────────

const CONDYLE_OPTIONS: { value: CondyleSymmetry; label: string }[] = [
  { value: '',            label: 'Select...' },
  { value: 'symmetric',   label: 'Symmetric' },
  { value: 'asymmetric',  label: 'Asymmetric' },
];

const SINUS_OPTIONS: { value: SinusStatus; label: string }[] = [
  { value: '',          label: 'Select...' },
  { value: 'clear',     label: 'Clear' },
  { value: 'opacified', label: 'Opacified / Obstructed' },
];

const BONE_OPTIONS: { value: BoneLevel; label: string }[] = [
  { value: '',                 label: 'Select...' },
  { value: 'normal',           label: 'Normal' },
  { value: 'reduced',          label: 'Reduced (mild–moderate)' },
  { value: 'severe-reduction', label: 'Severe reduction' },
];

const ROOT_OPTIONS: { value: RootMorphology; label: string }[] = [
  { value: '',             label: 'Select...' },
  { value: 'normal',       label: 'Normal' },
  { value: 'dilacerated',  label: 'Dilacerated' },
  { value: 'short',        label: 'Short roots' },
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
      className="w-full px-3 py-2 pr-8 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
    <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────

const OPGAnalysisModal: React.FC<OPGAnalysisModalProps> = ({
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
  const [localChartState, setLocalChartState]         = useState<SnapChartState | null>(null);

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

  const [condyleSymmetry, setCondyleSymmetry]   = useState<CondyleSymmetry>('');
  const [sinusStatus, setSinusStatus]           = useState<SinusStatus>('');
  const [boneLevel, setBoneLevel]               = useState<BoneLevel>('');
  const [rootMorphology, setRootMorphology]     = useState<RootMorphology>('');
  const [pathologies, setPathologies]           = useState('');
  const [notes, setNotes]                       = useState('');
  const [saved, setSaved]                       = useState(false);
  const [savedVersion, setSavedVersion]         = useState<number | null>(null);

  // ── Hydrate from existing active snapshot ──────────────────────────────────
  useEffect(() => {
    if (!existingSnapshot) return;
    const opg = existingSnapshot.diagnosticData?.modules?.opg;
    if (!opg) return;
    const f = opg.radiographicFindings ?? {};
    setCondyleSymmetry(f.condyleSymmetry   ?? '');
    setSinusStatus(f.sinusStatus           ?? '');
    setBoneLevel(f.boneLevel               ?? '');
    setRootMorphology(f.rootMorphology     ?? '');
    setPathologies(f.pathologies           ?? '');
    setNotes(opg.notes                     ?? '');
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
  const hasAnyInput = !!(condyleSymmetry || sinusStatus || boneLevel || rootMorphology || pathologies || notes);
  // FIX 10: also block while loading (snapshot fetch in progress) or in conflict state
  const canSave = hasAnyInput && !isSaving && !saved && !loadingSnapshot && !isConflict;

  // ── Save handler ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!canSave) return;

    const opgData: OPGDiagnosticData = {
      type: 'OPG',
      radiographicFindings: {
        condyleSymmetry:   condyleSymmetry   || undefined,
        sinusStatus:       sinusStatus       || undefined,
        boneLevel:         boneLevel         || undefined,
        rootMorphology:    rootMorphology    || undefined,
        pathologies:       pathologies       || undefined,
      },
      notes: notes || undefined,
    };

    // FIX 1/2: Pass ONLY the OPG module — useSavePretreatmentSnapshot fetches
    // the current server state and merges occlusal automatically.
    // DO NOT read existingSnapshot.occlusal here — it may be stale.
    try {
      const result = await savePretreatmentSnapshotAsync({
        caseId,
        // FIX 4 (UI Refactor): use localChartState from SnapEditorPanel
        chartState: (localChartState ?? existingSnapshot?.chartState ?? {}) as Record<string, unknown>,
        diagnosticData: { opg: opgData },   // ← only our module
        notes: { text: notes },
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
  const nextVersion = currentVersion + 1;

  return (
    <>
      <AnimatePresence>
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
              <div className="w-10 h-10 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center">
                <ScanLine className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-800">OPG Radiographic Analysis</h2>
                  {/* Version badge */}
                  <span className="text-[9px] font-bold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full uppercase tracking-widest">
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
                {[1, 2, 3].map((i) => (
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
                  <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-violet-500" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">
                    Pretreatment Snapshot V{savedVersion ?? nextVersion} saved
                  </p>
                  <p className="text-[11px] text-slate-400">OPG findings are now persisted.</p>
                </motion.div>
              )}
            </AnimatePresence>

            {!saved && !loadingSnapshot && (
              <>
                {/* Existing version info */}
                {hasSnapshot && (
                  <div className="flex items-start gap-2 px-4 py-3 bg-violet-50 border border-violet-200 rounded-2xl">
                    <History className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-violet-700 leading-relaxed">
                      <strong>Loaded from V{currentVersion}.</strong> Saving will create a new version V{nextVersion} —
                      the prior version is permanently preserved in history.
                    </p>
                  </div>
                )}

                {/* Condyle symmetry */}
                <section>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <ScanLine className="w-3.5 h-3.5" />
                    Radiographic Findings
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <FieldLabel label="Condyle Symmetry" />
                      <SelectField
                        value={condyleSymmetry}
                        onChange={(v) => setCondyleSymmetry(v as CondyleSymmetry)}
                        options={CONDYLE_OPTIONS}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <FieldLabel label="Sinus Status" />
                      <SelectField
                        value={sinusStatus}
                        onChange={(v) => setSinusStatus(v as SinusStatus)}
                        options={SINUS_OPTIONS}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <FieldLabel label="Bone Level" />
                      <SelectField
                        value={boneLevel}
                        onChange={(v) => setBoneLevel(v as BoneLevel)}
                        options={BONE_OPTIONS}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <FieldLabel label="Root Morphology" />
                      <SelectField
                        value={rootMorphology}
                        onChange={(v) => setRootMorphology(v as RootMorphology)}
                        options={ROOT_OPTIONS}
                      />
                    </div>
                  </div>
                </section>

                {/* Pathologies */}
                <section>
                  <div className="space-y-1.5">
                    <FieldLabel label="Pathologies / Other Findings" hint="optional" />
                    <textarea
                      value={pathologies}
                      onChange={(e) => setPathologies(e.target.value)}
                      placeholder="Cysts, root resorption, calcifications, impacted teeth, etc."
                      rows={3}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all"
                    />
                  </div>
                </section>

                {/* Notes */}
                <section>
                  <div className="space-y-1.5">
                    <FieldLabel label="Radiographic Notes" hint="optional" />
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Summary of OPG findings for this case..."
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all"
                    />
                  </div>
                </section>

                {/* ── Open Snap Editor button (Phase 3.X UI Refactor) ────────── */}
                <div className="mt-2">
                  <button
                    id="opg-open-snap-editor-btn"
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

                {/* FIX 3: Conflict banner — shows reload action, not generic error */}
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
                Saves as <strong className="text-violet-600">Pretreatment Snapshot V{nextVersion}</strong>
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
                  id="opg-snapshot-save-btn"
                  className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-violet-600/20 disabled:shadow-none"
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
      </AnimatePresence>

      {/* ── SnapEditorPanel — sibling of AnimatePresence, layered at z-[100+] */}
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

export default OPGAnalysisModal;
