/**
 * TreatmentPlanViewer.tsx — Read-only presentation of a TreatmentPlanVersion.
 *
 * No inputs, no onUpdate. Used for MID / POST phases and for the post-approval
 * PRE view. Accepts either a pre-fetched version object or a versionId to
 * resolve via React Query.
 */

import React from 'react';
import { Lock, Camera, FileText, Box, Activity, CheckCircle2, AlertTriangle, Target, Settings, Layers } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { usePlanVersion } from '../../../hooks/useTreatmentPlanVersions';
import type { TreatmentPlanVersion } from '../../../api/treatmentPlanVersion.api';

interface TreatmentPlanViewerProps {
  caseId: string;
  versionId?: string;
  version?: TreatmentPlanVersion | null;
}

const STAGE_CHIP: Record<string, string> = {
  DRAFT:    'bg-amber-100 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  REVISION: 'bg-blue-100 text-blue-700 border-blue-200',
};

const TreatmentPlanViewer: React.FC<TreatmentPlanViewerProps> = ({ caseId, versionId, version: passed }) => {
  const { data: fetched, isLoading } = usePlanVersion(caseId, passed ? undefined : versionId);
  const version = passed ?? fetched ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        <span className="ml-3 text-sm text-slate-500">Loading plan…</span>
      </div>
    );
  }

  if (!version) {
    return (
      <div className="bg-white rounded-[32px] border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
          <Target className="w-8 h-8" />
        </div>
        <h4 className="text-lg font-bold text-slate-800 mb-2">No Treatment Plan</h4>
        <p className="text-sm text-slate-500">No plan version is available for this record set yet.</p>
      </div>
    );
  }

  const payload = (version.payload ?? {}) as Record<string, any>;
  const stageClass = STAGE_CHIP[version.stage ?? ''] ?? 'bg-slate-100 text-slate-700 border-slate-200';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600">
            <Target className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-800">Treatment Plan — v{version.version}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${stageClass}`}>
                {version.stage}
              </span>
              {version.isActive && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-indigo-50 text-indigo-700 border-indigo-200">
                  ACTIVE
                </span>
              )}
              {version.isApproved && (
                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" /> APPROVED
                </span>
              )}
              <span className="flex items-center gap-1 text-[10px] font-medium text-slate-500">
                <Lock className="w-3 h-3" /> Read-only
              </span>
            </div>
          </div>
        </div>

        {version.changeSummary && (
          <div className="flex-1 min-w-[240px] max-w-lg bg-blue-50 border border-blue-100 rounded-xl p-3">
            <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">Change Summary</div>
            <div className="text-xs text-slate-700">{version.changeSummary}</div>
          </div>
        )}
      </div>

      {/* Payload display */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card icon={<Settings className="w-5 h-5 text-blue-500" />} title="Treatment Strategy">
            <Row label="Types of treatment" value={_joinBools(payload.typeOfTreatment)} />
            <Row label="Appliance — maxilla" value={payload?.typeOfAppliance?.maxilla} />
            <Row label="Appliance — mandible" value={payload?.typeOfAppliance?.mandible} />
            <Row label="Bracket system" value={payload.bracketSystem} />
            <Row label="Ligation" value={payload.ligationSystem} />
            <Row label="Slot size" value={payload.slotSize} />
            <Row label="Prescription" value={payload.prescription} />
          </Card>

          <Card icon={<Layers className="w-5 h-5 text-purple-500" />} title="Space & Anchorage">
            <Row label="Space requirement" value={_joinBools(payload.spaceRequirement)} />
            <Row label="Anchorage — maxilla" value={payload?.anchorageRequirements?.maxilla} />
            <Row label="Anchorage — mandible" value={payload?.anchorageRequirements?.mandible} />
            <Row label="Disarticulation" value={payload.disarticulation} />
          </Card>

          <Card icon={<Activity className="w-5 h-5 text-emerald-500" />} title="Retention Strategy">
            <Row label="Maxilla" value={payload?.retention?.maxilla} />
            <Row label="Mandible" value={payload?.retention?.mandible} />
          </Card>

          {payload.specialConsideration && (
            <Card icon={<AlertTriangle className="w-5 h-5 text-amber-500" />} title="Special Considerations">
              <p className="text-xs text-slate-600 whitespace-pre-wrap">{payload.specialConsideration}</p>
            </Card>
          )}
        </div>

        {/* Asset sidebar */}
        <div className="space-y-4">
          <AssetBlock
            icon={<Camera className="w-4 h-4" />}
            label="Photos"
            ids={version.assets.photos}
          />
          <AssetBlock
            icon={<Box className="w-4 h-4" />}
            label="STL Files"
            ids={version.assets.stlFiles}
          />
          <AssetBlock
            icon={<Activity className="w-4 h-4" />}
            label="DICOM"
            ids={version.assets.dicomFiles}
          />
          <AssetBlock
            icon={<FileText className="w-4 h-4" />}
            label="Documents"
            ids={version.assets.documents}
          />
        </div>
      </div>
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _joinBools(obj: unknown): string {
  if (!obj || typeof obj !== 'object') return '—';
  const keys = Object.entries(obj as Record<string, unknown>)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  return keys.length ? keys.join(', ') : '—';
}

const Card: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm">
    <div className="flex items-center gap-2 mb-4">
      {icon}
      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">{title}</h4>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-6">{children}</div>
  </div>
);

const Row: React.FC<{ label: string; value: unknown }> = ({ label, value }) => (
  <div>
    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</div>
    <div className="text-xs font-semibold text-slate-700">{value ?? '—'}</div>
  </div>
);

const AssetBlock: React.FC<{ icon: React.ReactNode; label: string; ids: string[] }> = ({ icon, label, ids }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-4">
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2 text-slate-600">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-[10px] font-bold text-slate-400">{ids.length}</span>
    </div>
    {ids.length === 0 ? (
      <p className="text-[11px] text-slate-400">None linked</p>
    ) : (
      <div className="flex flex-wrap gap-1">
        {ids.slice(0, 6).map((id) => (
          <span key={id} className="text-[10px] font-mono bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">
            {id.slice(-6)}
          </span>
        ))}
        {ids.length > 6 && <span className="text-[10px] text-slate-500">+{ids.length - 6}</span>}
      </div>
    )}
  </div>
);

export default TreatmentPlanViewer;
