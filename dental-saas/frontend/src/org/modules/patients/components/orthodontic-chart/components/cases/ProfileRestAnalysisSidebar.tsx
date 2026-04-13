import React from 'react';
import {
  Activity,
  X,
} from 'lucide-react';
import { PhotoRecord } from '../../types';

/* ═══════════════════════════════════════════════════════════════
   ProfileRestAnalysisSidebar — Profile analysis for profile-rest.
   Contains: Profile Type, Nasolabial Angle, Mentolabial Sulcus,
   Chin Position, Lip Prominence (E-Line), Submental Analysis.
   ═══════════════════════════════════════════════════════════════ */

export interface ProfileRestAnalysisSidebarProps {
  selectedPhoto: PhotoRecord;
  records: PhotoRecord[];
  onUpdateAnalysis: (photoId: string, key: string, value: any) => void;
  onClose: () => void;
}

const ProfileRestAnalysisSidebar: React.FC<ProfileRestAnalysisSidebarProps> = ({
  selectedPhoto,
  records,
  onUpdateAnalysis,
  onClose,
}) => {
  return (
    <div className="w-96 bg-slate-900/40 backdrop-blur-2xl border-l border-white/10 p-8 overflow-y-auto flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Activity className="w-4 h-4" />
          </div>
          <h3 className="text-lg font-bold text-white">Profile Analysis</h3>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-8">
        {/* 1. Profile Type */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">1. Profile Type</span>
          <div className="grid grid-cols-3 gap-2">
            {['Straight', 'Convex', 'Concave'].map(type => (
              <button
                key={type}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'profileType', type)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedPhoto.analysis?.profileType === type 
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/20' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{type}</span>
              </button>
            ))}
          </div>
          <p className="text-[9px] text-white/30 italic">
            * Landmarks: Glabella, Subnasale, Pogonion
          </p>
        </div>

        {/* 2. Nasolabial Angle */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">2. Nasolabial Angle</span>
          <div className="grid grid-cols-3 gap-2">
            {['Acute (<90°)', 'Normal (90-105°)', 'Obtuse (>105°)'].map(angle => (
              <button
                key={angle}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'nasolabialAngle', angle)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedPhoto.analysis?.nasolabialAngle === angle 
                  ? 'bg-indigo-600 border-indigo-500 text-white' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-[9px] font-bold leading-tight">{angle}</span>
              </button>
            ))}
          </div>
          <p className="text-[9px] text-white/30 italic">
            * Landmarks: Columella, Subnasale, Upper Lip
          </p>
        </div>

        {/* 3. Mentolabial Sulcus */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">3. Mentolabial Sulcus</span>
          <div className="grid grid-cols-2 gap-2">
            {['Deep', 'Shallow', 'Normal', 'Flat'].map(sulcus => (
              <button
                key={sulcus}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'mentolabialSulcus', sulcus)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedPhoto.analysis?.mentolabialSulcus === sulcus 
                  ? 'bg-indigo-600 border-indigo-500 text-white' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{sulcus}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 4. Chin Position */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">4. Chin Position</span>
          <div className="grid grid-cols-1 gap-2">
            {['Orthognathic', 'Prognathic', 'Retrognathic'].map(pos => (
              <button
                key={pos}
                onClick={() => onUpdateAnalysis(selectedPhoto.id, 'chinPosition', pos)}
                className={`w-full p-3 rounded-xl border text-left transition-all ${
                  selectedPhoto.analysis?.chinPosition === pos 
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/20' 
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold">{pos}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 5. Lip Prominence (E-Line) */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">5. Lip Prominence (E-Line)</span>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Upper Lip</span>
              <div className="grid grid-cols-3 gap-2">
                {['Protrusive', 'Normal', 'Retrusive'].map(status => (
                  <button
                    key={status}
                    onClick={() => onUpdateAnalysis(selectedPhoto.id, 'upperLipProminence', status)}
                    className={`p-2 rounded-lg border text-center transition-all text-[10px] font-bold ${
                      selectedPhoto.analysis?.upperLipProminence === status 
                      ? 'bg-indigo-600 border-indigo-500 text-white' 
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Lower Lip</span>
              <div className="grid grid-cols-3 gap-2">
                {['Protrusive', 'Normal', 'Retrusive'].map(status => (
                  <button
                    key={status}
                    onClick={() => onUpdateAnalysis(selectedPhoto.id, 'lowerLipProminence', status)}
                    className={`p-2 rounded-lg border text-center transition-all text-[10px] font-bold ${
                      selectedPhoto.analysis?.lowerLipProminence === status 
                      ? 'bg-indigo-600 border-indigo-500 text-white' 
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="text-[9px] text-white/30 italic">
            * Reference: Ricketts' E-Line (Nose tip to Chin tip)
          </p>
        </div>

        {/* 6. Throat Angle & Double Chin */}
        <div className="space-y-4">
          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">6. Submental Analysis</span>
          <div className="space-y-3">
            <div className="flex flex-col gap-2">
              <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Throat Angle</span>
              <div className="grid grid-cols-2 gap-2">
                {['Obtuse', 'Normal'].map(angle => (
                  <button
                    key={angle}
                    onClick={() => onUpdateAnalysis(selectedPhoto.id, 'throatAngle', angle)}
                    className={`p-2 rounded-lg border text-center transition-all text-[10px] font-bold ${
                      selectedPhoto.analysis?.throatAngle === angle 
                      ? 'bg-indigo-600 border-indigo-500 text-white' 
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {angle}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Double Chin</span>
              <div className="grid grid-cols-2 gap-2">
                {['Present', 'Absent'].map(status => (
                  <button
                    key={status}
                    onClick={() => onUpdateAnalysis(selectedPhoto.id, 'doubleChin', status)}
                    className={`p-2 rounded-lg border text-center transition-all text-[10px] font-bold ${
                      selectedPhoto.analysis?.doubleChin === status 
                      ? 'bg-indigo-600 border-indigo-500 text-white' 
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-8 border-t border-white/10">
        <button 
          onClick={onClose}
          className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-900/20"
        >
          Complete Analysis
        </button>
      </div>
    </div>
  );
};

export default React.memo(ProfileRestAnalysisSidebar);
