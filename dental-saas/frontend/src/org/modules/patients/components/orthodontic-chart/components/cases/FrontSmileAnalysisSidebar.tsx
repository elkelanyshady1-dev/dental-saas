import React from 'react';
import { Activity, X } from 'lucide-react';
import { PhotoRecord } from '../../types';

export interface FrontSmileAnalysisSidebarProps {
  selectedPhoto: PhotoRecord;
  records: PhotoRecord[];
  onUpdateAnalysis: (photoId: string, key: string, value: any) => void;
  onClose: () => void;
}

const FrontSmileAnalysisSidebar: React.FC<FrontSmileAnalysisSidebarProps> = ({
  selectedPhoto,
  records,
  onUpdateAnalysis,
  onClose,
}) => {
  return (
    <div className="w-96 bg-slate-900/40 backdrop-blur-2xl border-l border-white/10 p-8 overflow-y-auto flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Activity className="w-4 h-4" />
          </div>
          <h3 className="text-lg font-bold text-white">Smile Analysis</h3>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-8">
        {/* 1. Upper Lip Position */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">1. Upper Lip Position</span>
          <div className="grid grid-cols-1 gap-2">
            {['High (Gummy)', 'Normal', 'Low (Decreased Display)'].map(pos => (
              <button
                key={pos}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'upperLipPosition', pos)}
                className={`w-full p-3 rounded-xl border text-left transition-all ${
                  selectedPhoto.analysis?.upperLipPosition === pos 
                  ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/20' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{pos}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Smile Arc */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">2. Smile Arc</span>
          <div className="grid grid-cols-3 gap-2">
            {['Consonant', 'Straight', 'Reversed'].map(arc => (
              <button
                key={arc}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'smileArc', arc)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedPhoto.analysis?.smileArc === arc 
                  ? 'bg-emerald-600 border-emerald-500 text-white' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{arc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 3. Incisal/Gingival Display */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">3. Incisal Display</span>
          <div className="grid grid-cols-2 gap-2">
            {['Normal Display', 'Gummy (>3mm)'].map(display => (
              <button
                key={display}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'incisalDisplay', display)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedPhoto.analysis?.incisalDisplay === display 
                  ? 'bg-emerald-600 border-emerald-500 text-white' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{display}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 4. Buccal Corridors */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">4. Buccal Corridors</span>
          <div className="grid grid-cols-2 gap-2">
            {['Narrow (Large Space)', 'Broad (Minimal Space)'].map(corridor => (
              <button
                key={corridor}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'buccalCorridors', corridor)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedPhoto.analysis?.buccalCorridors === corridor 
                  ? 'bg-emerald-600 border-emerald-500 text-white' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{corridor}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 5. Symmetry & Canting */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">5. Symmetry & Canting</span>
          <div className="grid grid-cols-1 gap-2">
            {['Symmetrical', 'Occlusal Canting', 'Asymmetrical Dynamics'].map(sym => (
              <button
                key={sym}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'smileSymmetry', sym)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  selectedPhoto.analysis?.smileSymmetry === sym 
                  ? 'bg-emerald-600 border-emerald-500 text-white' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{sym}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-auto pt-8 border-t border-white/10">
        <button 
          onClick={onClose}
          className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/20"
        >
          Complete Analysis
        </button>
      </div>
    </div>
  );
};

export default React.memo(FrontSmileAnalysisSidebar);
