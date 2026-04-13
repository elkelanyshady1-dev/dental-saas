import React from 'react';
import { Activity, X } from 'lucide-react';
import { PhotoRecord } from '../../types';

export interface ObliqueAnalysisSidebarProps {
  selectedPhoto: PhotoRecord;
  records: PhotoRecord[];
  onUpdateAnalysis: (photoId: string, key: string, value: any) => void;
  onClose: () => void;
}

const ObliqueAnalysisSidebar: React.FC<ObliqueAnalysisSidebarProps> = ({
  selectedPhoto,
  records,
  onUpdateAnalysis,
  onClose,
}) => {
  return (
    <div className="w-96 bg-slate-900/40 backdrop-blur-2xl border-l border-white/10 p-8 overflow-y-auto flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
            <Activity className="w-4 h-4" />
          </div>
          <h3 className="text-lg font-bold text-white">Oblique Analysis</h3>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-8">
        {/* 1. Midface Deficiency */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">1. Midface Deficiency</span>
          <div className="grid grid-cols-2 gap-2">
            {['Normal', 'Deficient'].map(status => (
              <button
                key={status}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'midfaceDeficiency', status)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedPhoto.analysis?.midfaceDeficiency === status 
                  ? 'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-900/20' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{status}</span>
              </button>
            ))}
          </div>
          <p className="text-[9px] text-white/30 italic">
            * Best seen from ¾ or 45-angle views
          </p>
        </div>

        {/* 2. Nasal Deformity */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">2. Nasal Deformity</span>
          <div className="grid grid-cols-2 gap-2">
            {['Normal', 'Dorsal Hump', 'Tip Pointed Up', 'Tip Pointed Down'].map(type => (
              <button
                key={type}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'nasalDeformity', type)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedPhoto.analysis?.nasalDeformity === type 
                  ? 'bg-amber-600 border-amber-500 text-white' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{type}</span>
              </button>
            ))}
          </div>
          <p className="text-[9px] text-white/30 italic">
            * Considering the dorsum and tip
          </p>
        </div>

        {/* 3. Lip Fullness */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">3. Lip Fullness</span>
          <div className="grid grid-cols-3 gap-2">
            {['Normal', 'Increased', 'Decreased'].map(status => (
              <button
                key={status}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'lipFullness', status)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedPhoto.analysis?.lipFullness === status 
                  ? 'bg-amber-600 border-amber-500 text-white' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{status}</span>
              </button>
            ))}
          </div>
          <p className="text-[9px] text-white/30 italic">
            * Volume, position, and labial support
          </p>
        </div>

        {/* 4. Vermilion Line */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">4. Vermilion Line</span>
          <div className="grid grid-cols-3 gap-2">
            {['Normal', 'Increased', 'Decreased'].map(status => (
              <button
                key={status}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'vermilionLine', status)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedPhoto.analysis?.vermilionLine === status 
                  ? 'bg-amber-600 border-amber-500 text-white' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{status}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 5. Occlusal Canting (A-P) */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">5. Occlusal Canting (A-P)</span>
          <div className="grid grid-cols-3 gap-2">
            {['Normal', 'Canted Up', 'Canted Down'].map(status => (
              <button
                key={status}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'occlusalCantingAP', status)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedPhoto.analysis?.occlusalCantingAP === status 
                  ? 'bg-amber-600 border-amber-500 text-white' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{status}</span>
              </button>
            ))}
          </div>
          <p className="text-[9px] text-white/30 italic">
            * Antero-posterior inclination of occlusal plane
          </p>
        </div>
      </div>

      <div className="mt-auto pt-8 border-t border-white/10">
        <button 
          onClick={onClose}
          className="w-full py-4 bg-amber-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-amber-700 transition-all shadow-lg shadow-amber-900/20"
        >
          Complete Analysis
        </button>
      </div>
    </div>
  );
};

export default React.memo(ObliqueAnalysisSidebar);
