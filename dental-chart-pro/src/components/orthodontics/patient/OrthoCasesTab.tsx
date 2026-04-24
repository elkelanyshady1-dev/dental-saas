import React from 'react';
import { LayoutGrid, Plus, Smile, Calendar, Activity, ChevronRight, Eye, Edit3, XCircle } from 'lucide-react';
import { Case } from '../../../types';

interface OrthoCasesTabProps {
  cases: Case[];
  onOpenSnapshotEditor: (appointmentId: string) => void;
}

const OrthoCasesTab: React.FC<OrthoCasesTabProps> = ({ cases, onOpenSnapshotEditor }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Orthodontic Cases</h3>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-md">
          <Plus className="w-4 h-4" />
          Create New Orthodontic Case
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cases.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Smile className="w-6 h-6" />
                </div>
                <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold border border-emerald-100">
                  {c.status}
                </span>
              </div>
              
              <h4 className="text-lg font-bold text-slate-800 mb-1">Case #{c.id.split('-')[1] || '1'}</h4>
              <p className="text-xs font-medium text-slate-500 mb-4">{c.caseType}</p>
              
              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-slate-400 uppercase tracking-widest">Start Date</span>
                  <span className="font-bold text-slate-700">{c.startDate}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-slate-400 uppercase tracking-widest">Last Appt</span>
                  <span className="font-bold text-slate-700">12 Mar 2024</span>
                </div>
                <div className="pt-2">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progress</span>
                    <span className="text-[10px] font-bold text-blue-600">{c.progress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${c.progress}%` }} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button className="flex items-center justify-center gap-2 py-2 bg-slate-50 text-slate-700 rounded-xl text-[10px] font-bold hover:bg-slate-100 transition-colors border border-slate-100">
                  <Eye className="w-3.5 h-3.5" />
                  Open Case
                </button>
                <button 
                  onClick={() => onOpenSnapshotEditor('app-1')}
                  className="flex items-center justify-center gap-2 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-bold hover:bg-blue-100 transition-colors border border-blue-100"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Snapshot Editor
                </button>
              </div>
              
              <button className="w-full mt-2 flex items-center justify-center gap-2 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-[10px] font-bold transition-colors">
                <XCircle className="w-3.5 h-3.5" />
                Close Case
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrthoCasesTab;
