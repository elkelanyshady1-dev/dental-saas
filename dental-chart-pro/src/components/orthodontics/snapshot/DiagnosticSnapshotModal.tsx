import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, FlaskConical, Camera, FileText, AlertTriangle,
  CheckCircle2, Lock, Upload, Trash2, Eye, Save,
  Stethoscope, ChevronDown, Loader2
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiagnosticData {
  malocclusionClass?: 'CLASS_I' | 'CLASS_II_DIV_1' | 'CLASS_II_DIV_2' | 'CLASS_III' | '';
  skeletalPattern?:  'Class I' | 'Class II' | 'Class III' | '';
  crowdingUpper?:    string;
  crowdingLower?:    string;
  overjet?:          string;
  overbite?:         string;
  chiefComplaint?:   string;
  [key: string]: string | undefined;
}

interface AttachmentItem {
  id:    string;
  name:  string;
  url:   string;
  type:  'photo' | 'xray' | 'document';
}

interface DiagnosticSnapshotModalProps {
  caseId:              string;
  isOpen:              boolean;
  onClose:             () => void;
  existingSnapshot?:   {
    snapshotId:    string;
    snapshotDate:  string;
    diagnosticData?: DiagnosticData;
    notes?:        { text?: string };
    attachments?:  AttachmentItem[];
    chartState?:   Record<string, unknown>;
    thumbnail?:    string | null;
  } | null;
  onSaveSuccess?: (snapshotId: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MALOCCLUSION_OPTIONS = [
  { value: '',              label: 'Select class...' },
  { value: 'CLASS_I',      label: 'Class I' },
  { value: 'CLASS_II_DIV_1', label: 'Class II Div. 1' },
  { value: 'CLASS_II_DIV_2', label: 'Class II Div. 2' },
  { value: 'CLASS_III',    label: 'Class III' },
] as const;

const SKELETAL_OPTIONS = [
  { value: '',         label: 'Select pattern...' },
  { value: 'Class I',  label: 'Class I' },
  { value: 'Class II', label: 'Class II' },
  { value: 'Class III', label: 'Class III' },
] as const;

function formatDate(iso?: string | Date | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

const FieldGroup: React.FC<{
  label: string;
  children: React.ReactNode;
  hint?: string;
}> = ({ label, children, hint }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
      {label}
      {hint && <span className="text-[9px] font-medium text-slate-300 normal-case tracking-normal">({hint})</span>}
    </label>
    {children}
  </div>
);

const SelectField: React.FC<{
  value:    string;
  onChange: (v: string) => void;
  options:  readonly { value: string; label: string }[];
  disabled?: boolean;
}> = ({ value, onChange, options, disabled }) => (
  <div className="relative">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-3 py-2 pr-8 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 disabled:bg-slate-50 disabled:text-slate-400 transition-all"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
    <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
  </div>
);

const NumberInput: React.FC<{
  value:    string;
  onChange: (v: string) => void;
  placeholder?: string;
  unit?:    string;
  disabled?: boolean;
}> = ({ value, onChange, placeholder, unit, disabled }) => (
  <div className="relative">
    <input
      type="number"
      step="0.1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? '0.0'}
      disabled={disabled}
      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 disabled:bg-slate-50 disabled:text-slate-400 transition-all"
    />
    {unit && (
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-medium pointer-events-none">
        {unit}
      </span>
    )}
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

const DiagnosticSnapshotModal: React.FC<DiagnosticSnapshotModalProps> = ({
  caseId,
  isOpen,
  onClose,
  existingSnapshot,
  onSaveSuccess,
}) => {
  const isViewMode = !!existingSnapshot;

  const [diagnosticData, setDiagnosticData] = useState<DiagnosticData>(
    existingSnapshot?.diagnosticData ?? {}
  );
  const [notes, setNotes]           = useState(existingSnapshot?.notes?.text ?? '');
  const [attachments, setAttachments] = useState<AttachmentItem[]>(
    existingSnapshot?.attachments ?? []
  );
  const [isSaving, setIsSaving]     = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [showLockInfo, setShowLockInfo] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const patchDiagnostic = (patch: Partial<DiagnosticData>) =>
    setDiagnosticData((prev) => ({ ...prev, ...patch }));

  const handleAttachFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []) as File[];
    const newItems: AttachmentItem[] = files.map((f: File) => ({
      id:   Math.random().toString(36).slice(2),
      name: f.name,
      url:  URL.createObjectURL(f),
      type: f.type.startsWith('image/') ? 'photo' : 'document',
    }));
    setAttachments((prev) => [...prev, ...newItems]);
    e.target.value = '';
  };

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      /**
       * In production, call:
       * POST /api/v1/clinical-snapshots
       * { caseId, type: "diagnostic", chartState: {}, diagnosticData, attachments, notes: { text: notes } }
       *
       * The backend will:
       *   1. Validate type === "diagnostic"
       *   2. Run singleton guard (DIAGNOSTIC_ALREADY_EXISTS 409 if exists)
       *   3. Create ClinicalSnapshot + set hasDiagnosticSnapshot = true (atomic)
       */

      // Simulate API latency
      await new Promise((r) => setTimeout(r, 1200));

      const mockSnapshotId = Math.random().toString(36).slice(2);
      setSaved(true);
      onSaveSuccess?.(mockSnapshotId);

      // Toast feedback (in production: use your toast library)
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
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
          className="w-full max-w-3xl max-h-[92vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-start justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                <FlaskConical className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  {isViewMode ? 'Diagnostic Baseline' : 'Start Diagnosis'}
                </h2>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  {isViewMode
                    ? `Recorded ${formatDate(existingSnapshot?.snapshotDate)} · Read-only`
                    : 'Creates a locked diagnostic baseline for this case'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Immutability info */}
              <button
                onClick={() => setShowLockInfo((v) => !v)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                title="About immutability"
              >
                <Lock className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Immutability info banner */}
          <AnimatePresence>
            {showLockInfo && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mx-6 mt-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl flex gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    <strong>One diagnostic record per case.</strong> After saving, this baseline is
                    locked and cannot be edited. It is not included in the treatment visit counter.
                    Treatment cannot begin until this record has been saved.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* ── Treatment Lock Warning ─────────────────────── */}
            {!isViewMode && (
              <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-3">
                <Stethoscope className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-700 leading-relaxed">
                  Complete and save this diagnostic record before beginning treatment visits.
                  The system enforces this as a clinical prerequisite.
                </p>
              </div>
            )}

            {/* ── Success State ──────────────────────────────── */}
            <AnimatePresence>
              {saved && (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center justify-center py-8 gap-3"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">Diagnostic baseline saved</p>
                  <p className="text-[11px] text-slate-400">Treatment visits are now unlocked for this case.</p>
                </motion.div>
              )}
            </AnimatePresence>

            {!saved && (
              <>
                {/* ── Clinical Measurements ─────────────────────── */}
                <section>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Stethoscope className="w-3.5 h-3.5" />
                    Clinical Assessment
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <FieldGroup label="Malocclusion Class">
                      <SelectField
                        value={diagnosticData.malocclusionClass ?? ''}
                        onChange={(v) => patchDiagnostic({ malocclusionClass: v as DiagnosticData['malocclusionClass'] })}
                        options={MALOCCLUSION_OPTIONS}
                        disabled={isViewMode}
                      />
                    </FieldGroup>

                    <FieldGroup label="Skeletal Pattern">
                      <SelectField
                        value={diagnosticData.skeletalPattern ?? ''}
                        onChange={(v) => patchDiagnostic({ skeletalPattern: v as DiagnosticData['skeletalPattern'] })}
                        options={SKELETAL_OPTIONS}
                        disabled={isViewMode}
                      />
                    </FieldGroup>

                    <FieldGroup label="Crowding — Upper" hint="mm">
                      <NumberInput
                        value={diagnosticData.crowdingUpper ?? ''}
                        onChange={(v) => patchDiagnostic({ crowdingUpper: v })}
                        unit="mm"
                        disabled={isViewMode}
                      />
                    </FieldGroup>

                    <FieldGroup label="Crowding — Lower" hint="mm">
                      <NumberInput
                        value={diagnosticData.crowdingLower ?? ''}
                        onChange={(v) => patchDiagnostic({ crowdingLower: v })}
                        unit="mm"
                        disabled={isViewMode}
                      />
                    </FieldGroup>

                    <FieldGroup label="Overjet" hint="mm">
                      <NumberInput
                        value={diagnosticData.overjet ?? ''}
                        onChange={(v) => patchDiagnostic({ overjet: v })}
                        unit="mm"
                        disabled={isViewMode}
                      />
                    </FieldGroup>

                    <FieldGroup label="Overbite" hint="mm">
                      <NumberInput
                        value={diagnosticData.overbite ?? ''}
                        onChange={(v) => patchDiagnostic({ overbite: v })}
                        unit="mm"
                        disabled={isViewMode}
                      />
                    </FieldGroup>
                  </div>
                </section>

                {/* ── Chief Complaint ───────────────────────────── */}
                <section>
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    Chief Complaint & Notes
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <FieldGroup label="Chief Complaint">
                      <textarea
                        value={diagnosticData.chiefComplaint ?? ''}
                        onChange={(e) => patchDiagnostic({ chiefComplaint: e.target.value })}
                        placeholder="Patient's main concern..."
                        rows={3}
                        disabled={isViewMode}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 disabled:bg-slate-50 disabled:text-slate-400 transition-all"
                      />
                    </FieldGroup>
                    <FieldGroup label="Clinical Notes">
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Examination findings, records review..."
                        rows={3}
                        disabled={isViewMode}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 disabled:bg-slate-50 disabled:text-slate-400 transition-all"
                      />
                    </FieldGroup>
                  </div>
                </section>

                {/* ── Photo Attachments ─────────────────────────── */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Camera className="w-3.5 h-3.5" />
                      Photos & X-Rays
                      {attachments.length > 0 && (
                        <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                          {attachments.length}
                        </span>
                      )}
                    </h3>
                    {!isViewMode && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-[10px] font-bold transition-colors border border-emerald-200"
                      >
                        <Upload className="w-3 h-3" />
                        Add Files
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    multiple
                    className="hidden"
                    onChange={handleAttachFile}
                  />
                  {attachments.length === 0 ? (
                    <div
                      className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-2 text-slate-300 ${
                        isViewMode ? '' : 'cursor-pointer hover:border-emerald-300 hover:text-emerald-400 transition-colors'
                      }`}
                      onClick={() => !isViewMode && fileInputRef.current?.click()}
                    >
                      <Camera className="w-8 h-8" />
                      <p className="text-xs font-medium">
                        {isViewMode ? 'No attachments on this record' : 'Click to add photos, X-rays, or documents'}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-3">
                      {attachments.map((att) => (
                        <div
                          key={att.id}
                          className="group relative aspect-square bg-slate-100 rounded-2xl overflow-hidden border border-slate-200"
                        >
                          {att.type === 'photo' ? (
                            <img
                              src={att.url}
                              alt={att.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2">
                              <FileText className="w-6 h-6 text-slate-400" />
                              <p className="text-[9px] text-slate-400 text-center line-clamp-2">{att.name}</p>
                            </div>
                          )}
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                            <button
                              onClick={() => window.open(att.url, '_blank')}
                              className="p-1.5 bg-white/90 rounded-lg text-slate-700 hover:text-blue-600"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {!isViewMode && (
                              <button
                                onClick={() => removeAttachment(att.id)}
                                className="p-1.5 bg-white/90 rounded-lg text-slate-700 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          {/* Name label */}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-1.5">
                            <p className="text-[8px] text-white font-medium truncate">{att.name}</p>
                          </div>
                        </div>
                      ))}
                      {/* Add more */}
                      {!isViewMode && (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="aspect-square border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-1 text-slate-300 hover:border-emerald-300 hover:text-emerald-400 transition-colors"
                        >
                          <Upload className="w-5 h-5" />
                          <span className="text-[9px] font-medium">Add</span>
                        </button>
                      )}
                    </div>
                  )}
                </section>

                {/* ── Error ─────────────────────────────────────── */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl"
                    >
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-red-700">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>

          {/* Footer */}
          {!saved && (
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between flex-shrink-0 bg-slate-50/50">
              <div className="flex items-center gap-2">
                {isViewMode && (
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                    <Lock className="w-3 h-3" />
                    Locked — immutable after save
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  {isViewMode ? 'Close' : 'Cancel'}
                </button>
                {!isViewMode && (
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    id="diagnostic-snapshot-save-btn"
                    className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 disabled:shadow-none"
                  >
                    {isSaving ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
                    ) : (
                      <><Save className="w-3.5 h-3.5" />Save Baseline</>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default DiagnosticSnapshotModal;
