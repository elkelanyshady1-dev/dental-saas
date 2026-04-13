/**
 * OrthoPage.tsx
 * Patient Portal — Enhanced Orthodontics with visual stepper, pain level, photo upload UX
 */

import React, { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Smile,
  Camera,
  CheckCircle2,
  Clock,
  Play,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Activity,
  X,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import { monitoringApi } from '@/api/monitoring.api';
import { OrthoSkeleton } from '@/components/skeletons/Skeleton';
import EmptyState from '@/components/EmptyState';
import type { AlignerProgress } from '@/types/portal.types';

/* ─── Confirmation Modal ──────────────────────────────────────────── */
const ConfirmModal: React.FC<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  children?: React.ReactNode;
}> = ({ open, title, description, confirmLabel, onConfirm, onCancel, loading, children }) => (
  <AnimatePresence>
    {open && (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm"
          onClick={onCancel}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{title}</h3>
              <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs font-medium text-slate-500 mb-5">{description}</p>
            {children}
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 border-2 border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : confirmLabel}
              </button>
            </div>
          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

/* ─── Pain Level Slider ───────────────────────────────────────────── */
const PainSlider: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => {
  const painLabels = ['None', '', 'Mild', '', '', 'Moderate', '', '', 'Severe', '', 'Extreme'];
  const painColor =
    value <= 2 ? 'text-emerald-600' : value <= 5 ? 'text-amber-600' : value <= 8 ? 'text-orange-600' : 'text-rose-600';
  const trackColor =
    value <= 2 ? 'accent-emerald-600' : value <= 5 ? 'accent-amber-600' : value <= 8 ? 'accent-orange-600' : 'accent-rose-600';

  return (
    <div>
      <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest block mb-2">
        Pain Level: <span className={painColor}>{value}/10</span>
        {painLabels[value] && <span className="text-slate-400 ml-1">({painLabels[value]})</span>}
      </label>
      <input
        type="range"
        min={0}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full h-2 rounded-full appearance-none bg-slate-200 ${trackColor} cursor-pointer`}
      />
      <div className="flex justify-between mt-1">
        <span className="text-[8px] font-bold text-slate-400">0</span>
        <span className="text-[8px] font-bold text-slate-400">10</span>
      </div>
    </div>
  );
};

/* ─── Stage Card Component ────────────────────────────────────────── */
const StageCard: React.FC<{
  stage: AlignerProgress;
  onActivate: (id: string) => void;
  onRequestComplete: (stage: AlignerProgress) => void;
  isActivating: boolean;
}> = ({ stage, onActivate, onRequestComplete, isActivating }) => {
  const statusStyles: Record<string, { border: string; text: string; icon: React.ReactNode }> = {
    pending: { border: 'border-slate-200 bg-white', text: 'text-slate-500', icon: <Clock className="w-4 h-4" /> },
    active: { border: 'border-blue-200 bg-blue-50/30', text: 'text-blue-600', icon: <Play className="w-4 h-4" /> },
    completed: { border: 'border-emerald-200 bg-emerald-50/30', text: 'text-emerald-600', icon: <CheckCircle2 className="w-4 h-4" /> },
    skipped: { border: 'border-slate-200 bg-slate-50', text: 'text-slate-400', icon: <Clock className="w-4 h-4" /> },
  };

  const style = statusStyles[stage.status] || statusStyles.pending;

  return (
    <div className={`p-4 md:p-5 rounded-2xl border transition-all ${style.border}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${style.text} ${
            stage.status === 'active' ? 'bg-blue-100' : stage.status === 'completed' ? 'bg-emerald-100' : 'bg-slate-100'
          }`}>
            {style.icon}
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Stage {stage.stageNumber}</h4>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              {stage.wearDurationDays} days · {stage.status}
            </p>
          </div>
        </div>
        <span className={`text-[8px] font-black px-2 py-1 rounded-full border uppercase tracking-wider ${style.text} ${style.border}`}>
          {stage.status}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-3">
        {stage.status === 'pending' && (
          <button
            onClick={() => onActivate(stage._id)}
            disabled={isActivating}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-blue-700 transition-all shadow-md shadow-blue-100 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isActivating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Start Stage
          </button>
        )}
        {stage.status === 'active' && (
          <button
            onClick={() => onRequestComplete(stage)}
            className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100 flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-3 h-3" />
            Complete Stage
          </button>
        )}
        {stage.monitoringSubmitted && (
          <span className="text-[8px] font-black text-violet-600 bg-violet-50 px-2 py-1 rounded-full border border-violet-100 uppercase tracking-wider">
            📸 Submitted
          </span>
        )}
      </div>

      {stage.status === 'completed' && (stage.patientPainLevel != null || stage.patientWearHours != null) && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-4 flex-wrap">
          {stage.patientPainLevel != null && (
            <span className="text-[9px] font-bold text-slate-500">😣 Pain: {stage.patientPainLevel}/10</span>
          )}
          {stage.patientWearHours != null && (
            <span className="text-[9px] font-bold text-slate-500">⏱ Wear: {stage.patientWearHours}h/day</span>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── Photo Upload Grid ───────────────────────────────────────────── */
const PHOTO_TYPES = ['front', 'left', 'right', 'bite', 'upper', 'lower'] as const;

const PhotoUploadGrid: React.FC = () => {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleFileSelect = useCallback((type: string, file: File) => {
    const url = URL.createObjectURL(file);
    setPreviews((prev) => ({ ...prev, [type]: url }));
    // TODO: Upload via monitoringApi.uploadPhoto when caseId is available
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center text-violet-600">
          <Camera className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Upload Progress Photos</h3>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
            Tap to take or select photos of your aligner fit
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {PHOTO_TYPES.map((type) => (
          <div key={type} className="relative">
            <input
              ref={(el) => { fileRefs.current[type] = el; }}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(type, file);
              }}
            />
            <button
              onClick={() => fileRefs.current[type]?.click()}
              className={`aspect-square w-full border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-1 transition-all group overflow-hidden ${
                previews[type]
                  ? 'border-violet-400 bg-violet-50/30'
                  : 'border-slate-200 hover:border-violet-400 hover:bg-violet-50/30'
              }`}
            >
              {previews[type] ? (
                <img src={previews[type]} alt={type} loading="lazy" className="w-full h-full object-cover rounded-lg" />
              ) : (
                <>
                  <Camera className="w-4 h-4 text-slate-400 group-hover:text-violet-600 transition-colors" />
                  <span className="text-[7px] font-black text-slate-400 group-hover:text-violet-600 uppercase tracking-widest transition-colors">
                    {type}
                  </span>
                </>
              )}
            </button>
            {previews[type] && (
              <button
                onClick={() => setPreviews((prev) => { const n = { ...prev }; delete n[type]; return n; })}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-md"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
      {Object.keys(previews).length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
          <button className="w-full py-3 bg-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg shadow-violet-100 hover:bg-violet-700 transition-all flex items-center justify-center gap-2">
            <Upload className="w-4 h-4" />
            Upload {Object.keys(previews).length} Photo{Object.keys(previews).length > 1 ? 's' : ''}
          </button>
        </motion.div>
      )}
    </div>
  );
};

/* ─── Main Page ───────────────────────────────────────────────────── */
const OrthoPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [showAllStages, setShowAllStages] = useState(false);
  const [completeModal, setCompleteModal] = useState<AlignerProgress | null>(null);
  const [painLevel, setPainLevel] = useState(0);
  const [wearHours, setWearHours] = useState(22);

  const { data, isLoading, error } = useQuery({
    queryKey: ['portal', 'progress'],
    queryFn: () => monitoringApi.getProgress(),
    staleTime: 30_000,
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => monitoringApi.activateStage(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['portal', 'progress'] });
      const previous = queryClient.getQueryData(['portal', 'progress']);
      queryClient.setQueryData(['portal', 'progress'], (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.map((s: AlignerProgress) => s._id === id ? { ...s, status: 'active' as const } : s) };
      });
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(['portal', 'progress'], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['portal', 'progress'] }),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { patientPainLevel?: number; patientWearHours?: number } }) =>
      monitoringApi.completeStage(id, data),
    onMutate: async ({ id, data: mutData }) => {
      await queryClient.cancelQueries({ queryKey: ['portal', 'progress'] });
      const previous = queryClient.getQueryData(['portal', 'progress']);
      queryClient.setQueryData(['portal', 'progress'], (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.map((s: AlignerProgress) => s._id === id ? { ...s, status: 'completed' as const, patientPainLevel: mutData.patientPainLevel, patientWearHours: mutData.patientWearHours } : s) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['portal', 'progress'], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'progress'] });
      setCompleteModal(null);
      setPainLevel(0);
      setWearHours(22);
    },
  });

  if (isLoading) return <OrthoSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 mb-5">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2">Failed to Load</h3>
        <p className="text-xs font-medium text-slate-500">Could not fetch aligner progress.</p>
      </div>
    );
  }

  const stages = (data?.data || []) as AlignerProgress[];
  const activeStage = stages.find((s) => s.status === 'active');
  const completedCount = stages.filter((s) => s.status === 'completed').length;
  const totalStages = stages.length;
  const progressPct = totalStages > 0 ? Math.round((completedCount / totalStages) * 100) : 0;
  const displayStages = showAllStages ? stages : stages.slice(0, 6);

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-tight mb-1">Orthodontics</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
          Aligner progress and monitoring
        </p>
      </motion.div>

      {/* Progress Banner */}
      {totalStages > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 md:p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5" />
                <h3 className="text-xs font-black uppercase tracking-widest">Treatment Progress</h3>
              </div>
              <span className="text-2xl font-black">{progressPct}%</span>
            </div>
            <div className="w-full h-2.5 bg-white/20 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full bg-white rounded-full"
              />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider mt-3 text-white/70">
              {completedCount} of {totalStages} stages completed
              {activeStage && ` · Stage ${activeStage.stageNumber} active`}
            </p>

            {/* Visual Step Indicator */}
            <div className="flex items-center gap-1 mt-4 overflow-x-auto pb-1">
              {stages.slice(0, Math.min(stages.length, 20)).map((s, i) => (
                <div
                  key={s._id}
                  className={`shrink-0 w-6 h-1.5 rounded-full transition-all ${
                    s.status === 'completed' ? 'bg-white' :
                    s.status === 'active' ? 'bg-white/80 animate-pulse' :
                    'bg-white/20'
                  }`}
                  title={`Stage ${s.stageNumber}: ${s.status}`}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Stages Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <Smile className="w-4 h-4 text-blue-600" />
            Aligner Stages
          </h3>
          {totalStages > 6 && (
            <button
              onClick={() => setShowAllStages(!showAllStages)}
              className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-700 transition-colors"
            >
              {showAllStages ? 'Show Less' : `Show All (${totalStages})`}
              {showAllStages ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>

        {stages.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <EmptyState
              icon={Smile}
              title="No Aligner Stages Yet"
              description="Your orthodontic treatment stages will appear here once your doctor assigns them."
              iconColor="text-amber-400"
              iconBg="bg-amber-50"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AnimatePresence>
              {displayStages.map((stage, i) => (
                <motion.div
                  key={stage._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <StageCard
                    stage={stage}
                    onActivate={(id) => activateMutation.mutate(id)}
                    onRequestComplete={(s) => setCompleteModal(s)}
                    isActivating={activateMutation.isPending}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Photo Upload */}
      <PhotoUploadGrid />

      {/* Complete Stage Modal */}
      <ConfirmModal
        open={!!completeModal}
        title={`Complete Stage ${completeModal?.stageNumber || ''}`}
        description="Please provide feedback about this stage before completing it."
        confirmLabel="Complete"
        onConfirm={() => {
          if (completeModal) {
            completeMutation.mutate({
              id: completeModal._id,
              data: { patientPainLevel: painLevel, patientWearHours: wearHours },
            });
          }
        }}
        onCancel={() => setCompleteModal(null)}
        loading={completeMutation.isPending}
      >
        <div className="space-y-5">
          <PainSlider value={painLevel} onChange={setPainLevel} />
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest block mb-2">
              Daily Wear Hours: <span className="text-blue-600">{wearHours}h</span>
            </label>
            <input
              type="range"
              min={0}
              max={24}
              value={wearHours}
              onChange={(e) => setWearHours(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none bg-slate-200 accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[8px] font-bold text-slate-400">0h</span>
              <span className="text-[8px] font-bold text-slate-400">24h</span>
            </div>
          </div>
        </div>
      </ConfirmModal>
    </div>
  );
};

export default OrthoPage;
