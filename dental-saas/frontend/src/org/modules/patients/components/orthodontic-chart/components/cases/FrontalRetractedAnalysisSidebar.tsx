import React from 'react';
import { Activity, X } from 'lucide-react';
import { PhotoRecord } from '../../types';

export interface FrontalRetractedAnalysisSidebarProps {
  selectedPhoto: PhotoRecord;
  records: PhotoRecord[];
  onUpdateAnalysis: (photoId: string, key: string, value: any) => void;
  onClose: () => void;
}

const FrontalRetractedAnalysisSidebar: React.FC<FrontalRetractedAnalysisSidebarProps> = ({
  selectedPhoto,
  records,
  onUpdateAnalysis,
  onClose,
}) => {
  return (
    <div className="w-96 bg-slate-900/40 backdrop-blur-2xl border-l border-white/10 p-8 overflow-y-auto flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
            <Activity className="w-4 h-4" />
          </div>
          <h3 className="text-lg font-bold text-white">Frontal Retracted Analysis</h3>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-8">
        {/* 1. Plaque and Caries Index */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">1. Plaque and Caries Index</span>
          <div className="grid grid-cols-3 gap-2">
            {['Good', 'Fair', 'Bad'].map(status => (
              <button
                key={status}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'plaqueCaries', status)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedPhoto.analysis?.plaqueCaries === status 
                  ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{status}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Gingival Health */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">2. Gingival Health</span>
          <div className="grid grid-cols-2 gap-2">
            {['Healthy', 'Inflamed', 'Calculus', 'Recession'].map(status => (
              <button
                key={status}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'gingivalHealth', status)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedPhoto.analysis?.gingivalHealth === status 
                  ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{status}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 3. Overbite */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">3. Overbite (mm)</span>
            <span className="text-lg font-bold text-blue-400">{selectedPhoto.analysis?.overbite || 2}mm</span>
          </div>
          <input 
            type="range" 
            min="-5" 
            max="10" 
            step="0.5"
            value={selectedPhoto.analysis?.overbite || 2} 
            onChange={(e) => onUpdateAnalysis(selectedPhoto.id, 'overbite', e.target.value)}
            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-[8px] font-bold text-white/20 uppercase tracking-widest">
            <span>Open Bite</span>
            <span>Normal (2mm)</span>
            <span>Deep Bite</span>
          </div>
        </div>

        {/* 4. Upper Jaw Midline Shift */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">4. Upper Midline Shift (mm)</span>
            <span className={`text-lg font-bold ${Math.abs(Number(selectedPhoto.analysis?.upperMidlineShift)) > 0.5 ? 'text-blue-400' : 'text-white/40'}`}>
              {selectedPhoto.analysis?.upperMidlineShift || 0}mm
            </span>
          </div>
          <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
            <p className="text-[10px] text-white/40 leading-relaxed italic">
              * Adjust the "Upper" midline slider in the viewer to automatically update this value.
            </p>
          </div>
        </div>

        {/* 5. Lower Jaw Midline Shift */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">5. Lower Midline Shift (mm)</span>
            <span className={`text-lg font-bold ${Math.abs(Number(selectedPhoto.analysis?.lowerMidlineShift)) > 0.5 ? 'text-rose-400' : 'text-white/40'}`}>
              {selectedPhoto.analysis?.lowerMidlineShift || 0}mm
            </span>
          </div>
          <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
            <p className="text-[10px] text-white/40 leading-relaxed italic">
              * Adjust the "Lower" midline slider in the viewer to automatically update this value.
            </p>
          </div>
        </div>
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

export default React.memo(FrontalRetractedAnalysisSidebar);
