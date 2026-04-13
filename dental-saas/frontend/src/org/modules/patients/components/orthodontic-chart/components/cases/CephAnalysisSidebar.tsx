import React from 'react';
import { Activity, X } from 'lucide-react';
import { PhotoRecord } from '../../types';

/* ═══════════════════════════════════════════════════════════════
   CephAnalysisSidebar — Cephalometric analysis sidebar.
   Receives CephAnalysisTable as a render prop to avoid
   moving CephAnalysisTable out of OrthoRecordsTab.
   ═══════════════════════════════════════════════════════════════ */

export interface CephAnalysisSidebarProps {
  selectedPhoto: PhotoRecord;
  records: PhotoRecord[];
  onUpdateAnalysis: (photoId: string, key: string, value: any) => void;
  onClose: () => void;
  renderCephTable: (data: Record<string, any>, onChange: (key: string, value: string) => void) => React.ReactNode;
}

const CephAnalysisSidebar: React.FC<CephAnalysisSidebarProps> = ({
  selectedPhoto,
  records,
  onUpdateAnalysis,
  onClose,
  renderCephTable,
}) => {
  return (
    <div className="w-96 bg-slate-900/40 backdrop-blur-2xl border-l border-white/10 p-8 overflow-y-auto flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
            <Activity className="w-4 h-4" />
          </div>
          <h3 className="text-lg font-bold text-white">Ceph Analysis</h3>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-6">
        {renderCephTable(
          selectedPhoto.analysis || {}, 
          (key, value) => onUpdateAnalysis(selectedPhoto.id, key, value)
        )}
      </div>

      <div className="mt-auto pt-8 border-t border-white/10">
        <button 
          onClick={onClose}
          className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20"
        >
          Complete Analysis
        </button>
      </div>
    </div>
  );
};

export default React.memo(CephAnalysisSidebar);
