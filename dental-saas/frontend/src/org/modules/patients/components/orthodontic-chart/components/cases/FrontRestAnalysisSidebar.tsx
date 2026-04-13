import React from 'react';
import { Activity, X } from 'lucide-react';
import { PhotoRecord } from '../../types';

export interface FrontRestAnalysisSidebarProps {
  selectedPhoto: PhotoRecord;
  records: PhotoRecord[];
  onUpdateAnalysis: (photoId: string, key: string, value: any) => void;
  onClose: () => void;
}

const FrontRestAnalysisSidebar: React.FC<FrontRestAnalysisSidebarProps> = ({
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
          <h3 className="text-lg font-bold text-white">Clinical Analysis</h3>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-8">
        {/* 1. Facial Type */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">1. Facial Type</span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {['Dolichofacial', 'Brachyfacial', 'Mesofacial'].map(type => (
              <button
                key={type}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'facialType', type)}
                className={`w-full p-3 rounded-xl border text-left transition-all ${
                  selectedPhoto.analysis?.facialType === type 
                  ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">{type}</span>
                  {selectedPhoto.analysis?.facialType === type && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <p className="text-[9px] mt-1 opacity-50">
                  {type === 'Dolichofacial' && 'Tendency for open bite and narrow arch'}
                  {type === 'Brachyfacial' && 'Deep bite and square arch'}
                  {type === 'Mesofacial' && 'Average and proportioned'}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Lip Length */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">2. Lip Length</span>
          <div className="grid grid-cols-3 gap-2">
            {['Short', 'Normal', 'Long'].map(len => (
              <button
                key={len}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'lipLength', len)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedPhoto.analysis?.lipLength === len 
                  ? 'bg-blue-600 border-blue-500 text-white' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{len}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 3. Lip Posture */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">3. Lip Posture</span>
          <div className="grid grid-cols-3 gap-2">
            {['Everted', 'Strained', 'At Rest'].map(posture => (
              <button
                key={posture}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'lipPosture', posture)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedPhoto.analysis?.lipPosture === posture 
                  ? 'bg-blue-600 border-blue-500 text-white' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{posture}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 4. Competency */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">4. Competency</span>
          <div className="grid grid-cols-2 gap-2">
            {['Competent', 'Incompetent'].map(comp => (
              <button
                key={comp}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'lipCompetency', comp)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedPhoto.analysis?.lipCompetency === comp 
                  ? 'bg-blue-600 border-blue-500 text-white' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{comp}</span>
              </button>
            ))}
          </div>
          <p className="text-[9px] text-white/30 italic">
            * More than 2-3mm separation is considered incompetent
          </p>
        </div>

        {/* 5. Asymmetry */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">5. Asymmetry</span>
          <div className="grid grid-cols-1 gap-2">
            {['None', 'Midline Deviation', 'Functional Shift'].map(asym => (
              <button
                key={asym}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'asymmetry', asym)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  selectedPhoto.analysis?.asymmetry === asym 
                  ? 'bg-blue-600 border-blue-500 text-white' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{asym}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-auto pt-8 border-t border-white/10">
        <button 
          onClick={onClose}
          className="w-full py-4 bg-white text-slate-900 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-100 transition-all"
        >
          Complete Analysis
        </button>
      </div>
    </div>
  );
};

export default React.memo(FrontRestAnalysisSidebar);
