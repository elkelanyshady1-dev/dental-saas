import React from 'react';
import {
  Camera,
  Activity,
  Box,
  Plus,
  ChevronRight,
  AlertCircle,
  Target,
  ArrowLeft,
  Ruler,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   QuickActionsPanel — Sidebar with navigation and action buttons.
   Extracted from OrthoRecordsTab (lines 813–907).
   ═══════════════════════════════════════════════════════════════ */

type SubTab = 'records' | 'problem-list' | 'treatment-plan';

export interface QuickActionsPanelProps {
  activeSubTab: SubTab;
  onTabChange: (tab: SubTab) => void;
  stlFiles: { id: string; name: string; url: string }[];
  onStlUpload: () => void;
  onOpenStl: (file: { id: string; name: string; url: string }) => void;
  onOpenExtraoral: () => void;
  onOpenIntraoral: () => void;
  onOpenCastAnalysis?: () => void;
}

const QuickActionsPanel: React.FC<QuickActionsPanelProps> = ({
  activeSubTab,
  onTabChange,
  stlFiles,
  onStlUpload,
  onOpenStl,
  onOpenExtraoral,
  onOpenIntraoral,
  onOpenCastAnalysis,
}) => {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col gap-4">
      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quick Actions</h4>
      <button 
        onClick={onOpenExtraoral}
        className="flex items-center justify-between p-4 bg-blue-50 text-blue-700 rounded-2xl font-bold text-xs hover:bg-blue-100 transition-all group"
      >
        <div className="flex items-center gap-3">
          <Camera className="w-5 h-5" />
          Extraoral Records
        </div>
        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>
      <button 
        onClick={onOpenIntraoral}
        className="flex items-center justify-between p-4 bg-emerald-50 text-emerald-700 rounded-2xl font-bold text-xs hover:bg-emerald-100 transition-all group"
      >
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5" />
          Intraoral Records
        </div>
        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>
      <button 
        onClick={onStlUpload}
        className="flex items-center justify-between p-4 bg-indigo-50 text-indigo-700 rounded-2xl font-bold text-xs hover:bg-indigo-100 transition-all group"
      >
        <div className="flex items-center gap-3">
          <Box className="w-5 h-5" />
          Upload STL Model
        </div>
        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>

      {onOpenCastAnalysis && (
        <button
          onClick={onOpenCastAnalysis}
          className="flex items-center justify-between p-4 bg-rose-50 text-rose-700 rounded-2xl font-bold text-xs hover:bg-rose-100 transition-all group"
        >
          <div className="flex items-center gap-3">
            <Ruler className="w-5 h-5" />
            Cast Analysis
          </div>
          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      )}
      
      <div className="h-px bg-slate-100 my-2" />
      
      <button 
        onClick={() => onTabChange('problem-list')}
        className={`flex items-center justify-between p-4 rounded-2xl font-bold text-xs transition-all group ${activeSubTab === 'problem-list' ? 'bg-amber-600 text-white shadow-lg shadow-amber-200' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
      >
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5" />
          Problem List
        </div>
        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>

      <button 
        onClick={() => onTabChange('treatment-plan')}
        className={`flex items-center justify-between p-4 rounded-2xl font-bold text-xs transition-all group ${activeSubTab === 'treatment-plan' ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}
      >
        <div className="flex items-center gap-3">
          <Target className="w-5 h-5" />
          Treatment Plan
        </div>
        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>

      {activeSubTab !== 'records' && (
        <button 
          onClick={() => onTabChange('records')}
          className="flex items-center justify-center gap-2 p-3 text-slate-400 hover:text-slate-600 text-[10px] font-bold uppercase tracking-widest transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Records
        </button>
      )}
      {stlFiles.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Recent Models</span>
          {stlFiles.slice(-3).map(file => (
            <button 
              key={file.id}
              onClick={() => onOpenStl(file)}
              className="flex items-center justify-between p-3 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-bold hover:bg-slate-100 transition-all border border-slate-100"
            >
              <div className="flex items-center gap-2 truncate">
                <Box className="w-3.5 h-3.5 text-indigo-500" />
                <span className="truncate">{file.name}</span>
              </div>
              <ChevronRight className="w-3 h-3 opacity-40" />
            </button>
          ))}
        </div>
      )}
      <button className="flex items-center justify-between p-4 bg-slate-50 text-slate-700 rounded-2xl font-bold text-xs hover:bg-slate-100 transition-all group">
        <div className="flex items-center gap-3">
          <Plus className="w-5 h-5" />
          Add New Record Set
        </div>
        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>
    </div>
  );
};

export default React.memo(QuickActionsPanel);
