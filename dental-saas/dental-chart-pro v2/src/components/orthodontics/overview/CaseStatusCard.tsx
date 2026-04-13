import React from 'react';
import { Activity, Plus, TrendingUp } from 'lucide-react';

interface CaseStatusCardProps {
  onOpenSnapshotEditor?: () => void;
}

const CaseStatusCard: React.FC<CaseStatusCardProps> = ({ onOpenSnapshotEditor }) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
            <Activity className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <h3 className="font-bold text-slate-800 text-sm">Orthodontic Case Status</h3>
        </div>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Started: Jan 15, 2023</span>
      </div>
      
      <div className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1 bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Upper Arch</span>
                <span className="text-[11px] font-bold text-slate-700">16×22 NiTi — Active</span>
              </div>
              <div className="flex-1 bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Lower Arch</span>
                <span className="text-[11px] font-bold text-slate-700">0.014 NiTi — Active</span>
              </div>
            </div>
            
            <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
              Main objective is deep bite correction and alignment of lower anteriors. Phase 2 progress is consistent with treatment plan.
            </p>
            
            <div className="flex gap-2.5">
              <button 
                onClick={onOpenSnapshotEditor}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-bold hover:bg-blue-700 transition-all shadow-sm"
              >
                <TrendingUp className="w-3 h-3" />
                Open Chart
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-bold hover:bg-slate-50 transition-all">
                <Plus className="w-3 h-3" />
                Add Appointment
              </button>
            </div>
          </div>
          
          <div className="bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden h-28">
            <div className="grid grid-cols-8 gap-0.5 mb-0.5">
              {[...Array(8)].map((_, i) => (
                <div key={`u-${i}`} className={`w-3 h-3 rounded-sm ${i > 3 && i < 7 ? 'bg-blue-500' : 'bg-blue-200'}`} />
              ))}
            </div>
            <div className="grid grid-cols-8 gap-0.5">
              {[...Array(8)].map((_, i) => (
                <div key={`l-${i}`} className={`w-3 h-3 rounded-sm ${i > 2 && i < 6 ? 'bg-blue-400' : 'bg-blue-100'}`} />
              ))}
            </div>
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-2">Anatomical Chart</span>
            
            <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-full -mr-8 -mt-8" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CaseStatusCard;
