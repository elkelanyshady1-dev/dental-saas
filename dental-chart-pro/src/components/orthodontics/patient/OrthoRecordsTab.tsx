import React, { useState } from 'react';
import {
  FlaskConical, Camera, FileImage, Lock, AlertTriangle,
  CheckCircle2, ChevronRight, Upload, FolderOpen,
  Stethoscope, XRay, Eye, Plus
} from 'lucide-react';
import DiagnosticSnapshotModal from '../snapshot/DiagnosticSnapshotModal';
import { Case } from '../../../types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrthoRecordsTabProps {
  caseData: Case & {
    hasDiagnosticSnapshot?: boolean;
  };
}

// ── Dummy attachment data ─────────────────────────────────────────────────────

const MOCK_RECORDS = [
  { id: 'r1', label: 'Panoramic X-Ray', date: '2024-01-15', type: 'xray',      icon: '🦷' },
  { id: 'r2', label: 'Cephalometric',   date: '2024-01-15', type: 'ceph',      icon: '📐' },
  { id: 'r3', label: 'Extraoral Front', date: '2024-01-15', type: 'photo',     icon: '📷' },
  { id: 'r4', label: 'Upper Occlusal',  date: '2024-01-15', type: 'photo',     icon: '📷' },
];

// ── Treatment Lock Banner ─────────────────────────────────────────────────────

const TreatmentLockBanner: React.FC<{
  onStartDiagnosis: () => void;
}> = ({ onStartDiagnosis }) => (
  <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4">
    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
      <Lock className="w-5 h-5 text-amber-600" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <h4 className="text-sm font-bold text-amber-800">Diagnosis Required Before Treatment</h4>
        <span className="px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full text-[10px] font-bold uppercase tracking-wider">
          Locked
        </span>
      </div>
      <p className="text-xs text-amber-700 mb-3 leading-relaxed">
        A diagnostic baseline must be recorded before treatment visits can begin.
        This captures the patient's pre-treatment clinical status and is immutable after saving.
      </p>
      <button
        onClick={onStartDiagnosis}
        id="start-diagnosis-btn"
        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20"
      >
        <FlaskConical className="w-3.5 h-3.5" />
        Start Diagnosis
        <ChevronRight className="w-3. h-3.5" />
      </button>
    </div>
  </div>
);

// ── Diagnosis Complete Banner ─────────────────────────────────────────────────

const DiagnosisCompleteBanner: React.FC<{
  onViewDiagnosis: () => void;
}> = ({ onViewDiagnosis }) => (
  <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-4">
    <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
    </div>
    <div className="flex-1">
      <h4 className="text-xs font-bold text-emerald-800 flex items-center gap-2">
        Diagnostic Baseline Recorded
        <span className="px-2 py-0.5 bg-emerald-200 text-emerald-800 rounded-full text-[9px] font-bold uppercase tracking-wider">
          Saved
        </span>
      </h4>
      <p className="text-[11px] text-emerald-600 mt-0.5">
        Treatment visits are unlocked. Baseline is locked and immutable.
      </p>
    </div>
    <button
      onClick={onViewDiagnosis}
      id="view-diagnosis-btn"
      className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-[10px] font-bold transition-colors flex-shrink-0"
    >
      <Eye className="w-3.5 h-3.5" />
      View Diagnosis
    </button>
  </div>
);

// ── Photo Record Card ─────────────────────────────────────────────────────────

const RecordCard: React.FC<{
  label:    string;
  date:     string;
  icon:     string;
  disabled: boolean;
}> = ({ label, date, icon, disabled }) => (
  <div
    className={`group bg-white border rounded-2xl overflow-hidden transition-all ${
      disabled
        ? 'border-slate-100 opacity-50'
        : 'border-slate-200 hover:border-blue-200 hover:shadow-md cursor-pointer'
    }`}
  >
    {/* Placeholder image */}
    <div className="h-24 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-3xl">
      {icon}
    </div>
    <div className="p-3">
      <p className="text-xs font-bold text-slate-700 truncate">{label}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{date}</p>
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

const OrthoRecordsTab: React.FC<OrthoRecordsTabProps> = ({ caseData }) => {
  const hasDiagnostic = caseData?.hasDiagnosticSnapshot ?? false;

  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);
  const [diagnosisComplete, setDiagnosisComplete] = useState(hasDiagnostic);

  const handleSaveSuccess = (_snapshotId: string) => {
    setDiagnosisComplete(true);
  };

  return (
    <div className="space-y-6">

      {/* ── Section: Diagnosis Status ──────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <FlaskConical className="w-3.5 h-3.5" />
            Diagnostic Status
          </h3>
        </div>

        {diagnosisComplete ? (
          <DiagnosisCompleteBanner onViewDiagnosis={() => setShowDiagnosticModal(true)} />
        ) : (
          <TreatmentLockBanner onStartDiagnosis={() => setShowDiagnosticModal(true)} />
        )}
      </section>

      {/* ── Section: Clinical Photos & Records ────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Camera className="w-3.5 h-3.5" />
            Clinical Records
          </h3>
          <button
            disabled={!diagnosisComplete}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-[10px] font-bold transition-colors"
          >
            <Upload className="w-3 h-3" />
            Upload Records
          </button>
        </div>

        {!diagnosisComplete ? (
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center gap-2 text-slate-300">
            <Lock className="w-8 h-8" />
            <p className="text-xs font-medium text-slate-400">
              Complete diagnosis first to upload clinical records
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {MOCK_RECORDS.map((r) => (
              <RecordCard
                key={r.id}
                label={r.label}
                date={r.date}
                icon={r.icon}
                disabled={false}
              />
            ))}
            {/* Add more */}
            <div className="h-full min-h-[120px] border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-1 text-slate-300 hover:border-blue-300 hover:text-blue-400 cursor-pointer transition-colors">
              <Plus className="w-6 h-6" />
              <span className="text-[10px] font-medium">Add Record</span>
            </div>
          </div>
        )}
      </section>

      {/* ── Section: Record Sets Info ──────────────────────── */}
      {diagnosisComplete && (
        <section className="space-y-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-2">
            <FolderOpen className="w-3.5 h-3.5" />
            Record Sets
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Pre-Treatment', count: 4, color: 'emerald',  done: true },
              { label: 'Mid-Treatment', count: 0, color: 'blue',     done: false },
              { label: 'Post-Treatment', count: 0, color: 'purple',  done: false },
            ].map((set) => (
              <div
                key={set.label}
                className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">{set.label}</span>
                  {set.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-slate-200" />
                  )}
                </div>
                <p className={`text-2xl font-black ${
                  set.count > 0 ? `text-${set.color}-600` : 'text-slate-200'
                }`}>
                  {set.count}
                  <span className="text-xs font-medium text-slate-400 ml-1">files</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Diagnostic Modal ───────────────────────────────── */}
      <DiagnosticSnapshotModal
        caseId={caseData.id}
        isOpen={showDiagnosticModal}
        onClose={() => setShowDiagnosticModal(false)}
        existingSnapshot={diagnosisComplete ? {
          snapshotId:    'mock-diagnostic-snapshot',
          snapshotDate:  new Date().toISOString(),
          diagnosticData: {},
          notes:         { text: '' },
          attachments:   [],
        } : null}
        onSaveSuccess={handleSaveSuccess}
      />
    </div>
  );
};

export default OrthoRecordsTab;
