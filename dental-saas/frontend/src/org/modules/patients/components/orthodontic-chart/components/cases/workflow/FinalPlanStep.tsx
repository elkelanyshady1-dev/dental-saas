import React from 'react';
import { 
  CheckCircle2, Camera, BarChart3, AlertCircle, 
  Target, GitBranch, FileText, Calendar, Clock,
  User, Printer, Download, Shield, Flag,
  ArrowRight, Check, X
} from 'lucide-react';
import { motion } from 'motion/react';
import { RecordSet } from '../../../types';
import { TreatmentGoal } from './GoalsStep';
import { TreatmentOption } from './TreatmentOptionsStep';

interface FinalPlanStepProps {
  data: RecordSet;
  goals: TreatmentGoal[];
  selectedOption: TreatmentOption | null;
  onApprove: () => void;
}

const Section: React.FC<{ 
  title: string; 
  icon: React.ReactNode; 
  completed: boolean;
  children: React.ReactNode;
}> = ({ title, icon, completed, children }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
          {icon}
        </div>
        <h4 className="text-sm font-bold text-slate-800">{title}</h4>
      </div>
      {completed ? (
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100">
          <Check className="w-3 h-3" />
          Complete
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-lg border border-amber-100">
          <X className="w-3 h-3" />
          Incomplete
        </span>
      )}
    </div>
    <div className="p-5">
      {children}
    </div>
  </div>
);

const FinalPlanStep: React.FC<FinalPlanStepProps> = ({ 
  data, 
  goals, 
  selectedOption,
  onApprove 
}) => {
  const records = data.records || [];
  const uploadedPhotos = records.filter(r => r.url);
  const cephRecord = records.find(r => r.id === 'ceph');
  const hasCephAnalysis = cephRecord?.analysis && Object.keys(cephRecord.analysis).length > 0;
  const problemList = data.problemList;
  const treatmentPlan = data.treatmentPlan;

  const completionItems = [
    { label: 'Clinical Photos', done: uploadedPhotos.length >= 3 },
    { label: 'Cephalometric Analysis', done: !!hasCephAnalysis },
    { label: 'Problem List', done: !!problemList },
    { label: 'Treatment Goals', done: goals.length > 0 },
    { label: 'Treatment Option Selected', done: !!selectedOption },
    { label: 'Treatment Plan', done: !!treatmentPlan },
  ];

  const completedCount = completionItems.filter(i => i.done).length;
  const completionPercent = Math.round((completedCount / completionItems.length) * 100);
  const isReady = completionPercent >= 80; // Allow approval at 80%+

  return (
    <div className="space-y-6">
      {/* Approval Header */}
      <div className={`rounded-2xl p-6 shadow-xl ${
        isReady 
          ? 'bg-gradient-to-br from-emerald-600 to-emerald-700' 
          : 'bg-gradient-to-br from-slate-700 to-slate-800'
      } text-white`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Final Treatment Plan</h3>
              <p className="text-white/60 text-xs">Review and approve the complete treatment plan</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-all border border-white/10">
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-all border border-white/10">
              <Download className="w-4 h-4" />
              Export PDF
            </button>
          </div>
        </div>

        {/* Completion Progress */}
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-white/80">Completion Progress</span>
            <span className="text-lg font-bold">{completionPercent}%</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2 mb-4">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${completionPercent}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className={`h-full rounded-full ${isReady ? 'bg-white' : 'bg-amber-400'}`}
            />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {completionItems.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-xs">
                {item.done ? (
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                ) : (
                  <X className="w-3.5 h-3.5 text-white/30" />
                )}
                <span className={item.done ? 'text-white/90' : 'text-white/40'}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Records Summary */}
      <Section 
        title="Clinical Records" 
        icon={<Camera className="w-4 h-4" />}
        completed={uploadedPhotos.length >= 3}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-50 rounded-xl p-4 text-center border border-slate-100">
            <span className="text-2xl font-bold text-slate-800">{uploadedPhotos.length}</span>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Photos</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 text-center border border-slate-100">
            <span className="text-2xl font-bold text-slate-800">{(data.stlFiles || []).length}</span>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">STL Files</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 text-center border border-slate-100">
            <span className="text-2xl font-bold text-slate-800">{hasCephAnalysis ? '✓' : '—'}</span>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Ceph Analysis</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 text-center border border-slate-100">
            <span className="text-2xl font-bold text-slate-800">{data.chiefComplaint ? '✓' : '—'}</span>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Chief Complaint</p>
          </div>
        </div>
        {data.chiefComplaint && (
          <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Chief Complaint</span>
            <p className="text-sm text-slate-700 mt-1 font-medium">{data.chiefComplaint}</p>
          </div>
        )}
      </Section>

      {/* Goals Summary */}
      <Section 
        title="Treatment Goals" 
        icon={<Target className="w-4 h-4" />}
        completed={goals.length > 0}
      >
        {goals.length > 0 ? (
          <div className="space-y-2">
            {goals.map((goal, index) => (
              <div key={goal.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold">
                  {index + 1}
                </span>
                <span className="flex-1 text-sm text-slate-700 font-medium">{goal.description}</span>
                <span className={`px-2 py-0.5 rounded-md text-[8px] font-bold uppercase ${
                  goal.priority === 'high' ? 'bg-red-50 text-red-600 border border-red-100' :
                  goal.priority === 'medium' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                  'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                  {goal.priority}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center py-4">No treatment goals defined</p>
        )}
      </Section>

      {/* Selected Option Summary */}
      <Section 
        title="Selected Treatment Option" 
        icon={<GitBranch className="w-4 h-4" />}
        completed={!!selectedOption}
      >
        {selectedOption ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="text-sm font-bold text-slate-800">{selectedOption.title}</h5>
                <p className="text-xs text-slate-500 capitalize">{selectedOption.approach} approach</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Clock className="w-3.5 h-3.5" />
                <span className="font-bold">{selectedOption.estimatedDuration}</span>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{selectedOption.description}</p>
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center py-4">No treatment option selected</p>
        )}
      </Section>

      {/* Treatment Plan Summary */}
      <Section 
        title="Treatment Plan Details" 
        icon={<FileText className="w-4 h-4" />}
        completed={!!treatmentPlan}
      >
        {treatmentPlan ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Appliance (Maxilla)</span>
              <p className="text-sm font-bold text-slate-700 mt-1 capitalize">{treatmentPlan.typeOfAppliance?.maxilla || '—'}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Appliance (Mandible)</span>
              <p className="text-sm font-bold text-slate-700 mt-1 capitalize">{treatmentPlan.typeOfAppliance?.mandible || '—'}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Bracket System</span>
              <p className="text-sm font-bold text-slate-700 mt-1 capitalize">{treatmentPlan.bracketSystem || '—'}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Slot Size</span>
              <p className="text-sm font-bold text-slate-700 mt-1">{treatmentPlan.slotSize || '—'}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Prescription</span>
              <p className="text-sm font-bold text-slate-700 mt-1">{treatmentPlan.prescription || '—'}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Retention (Max)</span>
              <p className="text-sm font-bold text-slate-700 mt-1 capitalize">{treatmentPlan.retention?.maxilla || '—'}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center py-4">No treatment plan configured yet</p>
        )}
      </Section>

      {/* Approve Button */}
      <div className="flex items-center justify-center py-4">
        <button
          onClick={onApprove}
          disabled={!isReady}
          className={`
            flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-sm transition-all shadow-lg
            ${isReady 
              ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/30 hover:shadow-emerald-600/40' 
              : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }
          `}
        >
          <Shield className="w-5 h-5" />
          {isReady ? 'Approve & Finalize Treatment Plan' : `Complete at least 80% to approve (${completionPercent}%)`}
        </button>
      </div>
    </div>
  );
};

export default FinalPlanStep;
