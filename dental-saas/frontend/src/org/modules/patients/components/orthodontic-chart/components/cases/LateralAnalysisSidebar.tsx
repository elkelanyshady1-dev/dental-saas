import React from 'react';
import {
  Activity,
  X,
} from 'lucide-react';
import { PhotoRecord } from '../../types';

/* ═══════════════════════════════════════════════════════════════
   LateralAnalysisSidebar — Fullscreen analysis sidebar for
   lateral-right and lateral-left photos.
   Extracted from OrthoRecordsTab (lines 958–1134).
   Contains: Canine classification, Molar classification,
   Incisor classification, and Overjet measurement.
   ═══════════════════════════════════════════════════════════════ */

export interface LateralAnalysisSidebarProps {
  selectedPhoto: PhotoRecord;
  records: PhotoRecord[];
  onUpdateAnalysis: (photoId: string, key: string, value: string) => void;
  onClose: () => void;
}

const LateralAnalysisSidebar: React.FC<LateralAnalysisSidebarProps> = ({
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
          <h3 className="text-lg font-bold text-white">Lateral Analysis</h3>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-8">
        {/* Canine Class */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">1. Canine Classification</span>
          <div className="space-y-4">
            {['lateral-right', 'lateral-left'].map(sideId => {
              const side = sideId === 'lateral-right' ? 'Right' : 'Left';
              const photo = records.find(r => r.id === sideId);
              return (
                <div key={sideId} className="space-y-2">
                  <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{side} Side</span>
                  <div className="grid grid-cols-3 gap-2">
                    {['I', 'II', 'III'].map(cls => (
                      <button
                        key={cls}
                        onClick={() => onUpdateAnalysis(sideId, 'canineClass', cls)}
                        className={`p-2 rounded-lg border text-center transition-all text-[10px] font-bold ${
                          photo?.analysis?.canineClass === cls 
                          ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20' 
                          : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                        }`}
                      >
                        Class {cls}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {['Full', '1/2', '1/4', '3/4'].map(unit => (
                      <button
                        key={unit}
                        onClick={() => onUpdateAnalysis(sideId, 'canineUnit', unit)}
                        className={`p-1 rounded-md border text-center transition-all text-[8px] font-bold ${
                          photo?.analysis?.canineUnit === unit 
                          ? 'bg-white/20 border-white/30 text-white' 
                          : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                        }`}
                      >
                        {unit}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Molar Class */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">2. Molar Classification</span>
          <div className="space-y-4">
            {['lateral-right', 'lateral-left'].map(sideId => {
              const side = sideId === 'lateral-right' ? 'Right' : 'Left';
              const photo = records.find(r => r.id === sideId);
              return (
                <div key={sideId} className="space-y-2">
                  <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{side} Side</span>
                  <div className="grid grid-cols-3 gap-2">
                    {['I', 'II', 'III'].map(cls => (
                      <button
                        key={cls}
                        onClick={() => onUpdateAnalysis(sideId, 'molarClass', cls)}
                        className={`p-2 rounded-lg border text-center transition-all text-[10px] font-bold ${
                          photo?.analysis?.molarClass === cls 
                          ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20' 
                          : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                        }`}
                      >
                        Class {cls}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {['Full', '1/2', '1/4', '3/4'].map(unit => (
                      <button
                        key={unit}
                        onClick={() => onUpdateAnalysis(sideId, 'molarUnit', unit)}
                        className={`p-1 rounded-md border text-center transition-all text-[8px] font-bold ${
                          photo?.analysis?.molarUnit === unit 
                          ? 'bg-white/20 border-white/30 text-white' 
                          : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                        }`}
                      >
                        {unit}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Incisors Class */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">3. Incisor Classification</span>
          <div className="grid grid-cols-1 gap-2">
            {[
              { id: 'I', label: 'Class I' },
              { id: 'II-1', label: 'Class II Div 1' },
              { id: 'II-2', label: 'Class II Div 2' },
              { id: 'III', label: 'Class III' }
            ].map(cls => (
              <button
                key={cls.id}
                onClick={() => {
                  onUpdateAnalysis('lateral-right', 'incisorClass', cls.id);
                  onUpdateAnalysis('lateral-left', 'incisorClass', cls.id);
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  records.find(r => r.id === 'lateral-right')?.analysis?.incisorClass === cls.id 
                  ? 'bg-blue-600 border-blue-500 text-white' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{cls.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Overjet */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">4. Overjet (mm)</span>
            <span className="text-lg font-bold text-blue-400">
              {records.find(r => r.id === 'lateral-right')?.analysis?.overjet || 2}mm
            </span>
          </div>
          <input 
            type="range" 
            min="-10" 
            max="15" 
            step="0.5"
            value={records.find(r => r.id === 'lateral-right')?.analysis?.overjet || 2} 
            onChange={(e) => {
              onUpdateAnalysis('lateral-right', 'overjet', e.target.value);
              onUpdateAnalysis('lateral-left', 'overjet', e.target.value);
            }}
            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-[8px] font-bold text-white/20 uppercase tracking-widest">
            <span>Reverse</span>
            <span>Normal (2mm)</span>
            <span>Increased</span>
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

export default React.memo(LateralAnalysisSidebar);
