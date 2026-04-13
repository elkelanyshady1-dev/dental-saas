import React from 'react';
import {
  FlipHorizontal,
  FlipVertical,
  Activity,
} from 'lucide-react';
import { PhotoRecord } from '../../types';

/* ═══════════════════════════════════════════════════════════════
   RecordsToolbar — Fullscreen photo viewer bottom toolbar.
   Extracted from OrthoRecordsTab (lines 946–1241).
   Contains: overlay toggle buttons, midline/profile/lateral/dental
   midline sliders, and flip H/V buttons.
   ═══════════════════════════════════════════════════════════════ */

export interface RecordsToolbarProps {
  selectedPhoto: PhotoRecord;
  overlayState: any;
  updateOverlay: (path: string[], value: any) => void;
  onFlipH: () => void;
  onFlipV: () => void;
  onUpdateAnalysis: (photoId: string, key: string, value: string) => void;
}

const RecordsToolbar: React.FC<RecordsToolbarProps> = ({
  selectedPhoto,
  overlayState,
  updateOverlay,
  onFlipH,
  onFlipV,
  onUpdateAnalysis,
}) => {
  return (
    <div className="absolute bottom-12 left-0 right-0 flex justify-center items-center gap-4 z-20">
      {/* Frontal Tools */}
      {(selectedPhoto.id === 'front-rest' || selectedPhoto.id === 'front-smile') && (
        <>
          <button 
            onClick={() => updateOverlay(['midline', 'visible'], !overlayState.midline.visible)}
            className={`p-4 backdrop-blur-md rounded-2xl transition-all border flex flex-col items-center gap-2 ${
              overlayState.midline.visible 
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
              : 'bg-white/10 border-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Activity className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">Midline</span>
          </button>
          
          {overlayState.midline.visible && (
            <div className="flex flex-col gap-2 px-6 py-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10">
              <div className="flex items-center gap-4 min-w-[160px]">
                <span className="text-[10px] font-bold text-white/40 uppercase w-8">H</span>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={overlayState.midline.x} 
                  onChange={(e) => updateOverlay(['midline', 'x'], Number(e.target.value))}
                  className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                />
              </div>
              <div className="flex items-center gap-4 min-w-[160px]">
                <span className="text-[10px] font-bold text-white/40 uppercase w-8">V</span>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={overlayState.midline.y} 
                  onChange={(e) => updateOverlay(['midline', 'y'], Number(e.target.value))}
                  className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Frontal Retracted Tools */}
      {selectedPhoto.id === 'frontal-retracted' && (
        <>
          <button 
            onClick={() => updateOverlay(['dentalMidlines', 'visible'], !overlayState.dentalMidlines.visible)}
            className={`p-4 backdrop-blur-md rounded-2xl transition-all border flex flex-col items-center gap-2 ${
              overlayState.dentalMidlines.visible 
              ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' 
              : 'bg-white/10 border-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Activity className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">Dental Midlines</span>
          </button>
          
          {overlayState.dentalMidlines.visible && (
            <div className="flex flex-col gap-3 px-6 py-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10">
              <div className="flex items-center gap-4 min-w-[200px]">
                <span className="text-[8px] font-bold text-white/40 uppercase w-12">Facial</span>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  step="0.1"
                  value={overlayState.dentalMidlines.facial} 
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    updateOverlay(['dentalMidlines', 'facial'], val);
                    const upperShift = ((overlayState.dentalMidlines.upper - val) * 0.5).toFixed(1);
                    const lowerShift = ((overlayState.dentalMidlines.lower - val) * 0.5).toFixed(1);
                    onUpdateAnalysis('frontal-retracted', 'upperMidlineShift', upperShift);
                    onUpdateAnalysis('frontal-retracted', 'lowerMidlineShift', lowerShift);
                  }}
                  className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>
              <div className="flex items-center gap-4 min-w-[200px]">
                <span className="text-[8px] font-bold text-blue-400/60 uppercase w-12">Upper</span>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  step="0.1"
                  value={overlayState.dentalMidlines.upper} 
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    updateOverlay(['dentalMidlines', 'upper'], val);
                    const upperShift = ((val - overlayState.dentalMidlines.facial) * 0.5).toFixed(1);
                    onUpdateAnalysis('frontal-retracted', 'upperMidlineShift', upperShift);
                  }}
                  className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-400"
                />
              </div>
              <div className="flex items-center gap-4 min-w-[200px]">
                <span className="text-[8px] font-bold text-rose-400/60 uppercase w-12">Lower</span>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  step="0.1"
                  value={overlayState.dentalMidlines.lower} 
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    updateOverlay(['dentalMidlines', 'lower'], val);
                    const lowerShift = ((val - overlayState.dentalMidlines.facial) * 0.5).toFixed(1);
                    onUpdateAnalysis('frontal-retracted', 'lowerMidlineShift', lowerShift);
                  }}
                  className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-rose-400"
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Lateral Tools */}
      {(selectedPhoto.id === 'lateral-right' || selectedPhoto.id === 'lateral-left') && (
        <>
          <button 
            onClick={() => updateOverlay(['lateralLines', 'visible'], !overlayState.lateralLines.visible)}
            className={`p-4 backdrop-blur-md rounded-2xl transition-all border flex flex-col items-center gap-2 ${
              overlayState.lateralLines.visible 
              ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' 
              : 'bg-white/10 border-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Activity className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">Align Lines</span>
          </button>
          
          {overlayState.lateralLines.visible && (
            <div className="flex flex-col gap-4 px-6 py-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 min-w-[320px]">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Right Side</span>
                  <div className="flex gap-4">
                    <span className="text-[8px] font-bold text-rose-400 uppercase">Upper (Red)</span>
                    <span className="text-[8px] font-bold text-blue-400 uppercase">Lower (Blue)</span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-white/40 uppercase">Molar</span>
                    <div className="flex items-center gap-4">
                      <input 
                        type="range" min="0" max="100" step="0.1"
                        value={overlayState.lateralLines.right.molarUpper} 
                        onChange={(e) => updateOverlay(['lateralLines', 'right', 'molarUpper'], Number(e.target.value))}
                        className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-rose-500"
                      />
                      <input 
                        type="range" min="0" max="100" step="0.1"
                        value={overlayState.lateralLines.right.molarLower} 
                        onChange={(e) => updateOverlay(['lateralLines', 'right', 'molarLower'], Number(e.target.value))}
                        className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-white/40 uppercase">Canine</span>
                    <div className="flex items-center gap-4">
                      <input 
                        type="range" min="0" max="100" step="0.1"
                        value={overlayState.lateralLines.right.canineUpper} 
                        onChange={(e) => updateOverlay(['lateralLines', 'right', 'canineUpper'], Number(e.target.value))}
                        className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-rose-500"
                      />
                      <input 
                        type="range" min="0" max="100" step="0.1"
                        value={overlayState.lateralLines.right.canineLower} 
                        onChange={(e) => updateOverlay(['lateralLines', 'right', 'canineLower'], Number(e.target.value))}
                        className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-white/5" />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Left Side</span>
                  <div className="flex gap-4">
                    <span className="text-[8px] font-bold text-rose-400 uppercase">Upper (Red)</span>
                    <span className="text-[8px] font-bold text-blue-400 uppercase">Lower (Blue)</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-white/40 uppercase">Canine</span>
                    <div className="flex items-center gap-4">
                      <input 
                        type="range" min="0" max="100" step="0.1"
                        value={overlayState.lateralLines.left.canineUpper} 
                        onChange={(e) => updateOverlay(['lateralLines', 'left', 'canineUpper'], Number(e.target.value))}
                        className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-rose-500"
                      />
                      <input 
                        type="range" min="0" max="100" step="0.1"
                        value={overlayState.lateralLines.left.canineLower} 
                        onChange={(e) => updateOverlay(['lateralLines', 'left', 'canineLower'], Number(e.target.value))}
                        className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-white/40 uppercase">Molar</span>
                    <div className="flex items-center gap-4">
                      <input 
                        type="range" min="0" max="100" step="0.1"
                        value={overlayState.lateralLines.left.molarUpper} 
                        onChange={(e) => updateOverlay(['lateralLines', 'left', 'molarUpper'], Number(e.target.value))}
                        className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-rose-500"
                      />
                      <input 
                        type="range" min="0" max="100" step="0.1"
                        value={overlayState.lateralLines.left.molarLower} 
                        onChange={(e) => updateOverlay(['lateralLines', 'left', 'molarLower'], Number(e.target.value))}
                        className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Profile Tools */}
      {selectedPhoto.id === 'profile-rest' && (
        <>
          <button 
            onClick={() => updateOverlay(['profileLine', 'visible'], !overlayState.profileLine.visible)}
            className={`p-4 backdrop-blur-md rounded-2xl transition-all border flex flex-col items-center gap-2 ${
              overlayState.profileLine.visible 
              ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' 
              : 'bg-white/10 border-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Activity className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">Ref Line</span>
          </button>
          
          {overlayState.profileLine.visible && (
            <div className="flex flex-col gap-2 px-6 py-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10">
              <div className="flex items-center gap-4 min-w-[160px]">
                <span className="text-[10px] font-bold text-white/40 uppercase w-8">Pos</span>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={overlayState.profileLine.x} 
                  onChange={(e) => updateOverlay(['profileLine', 'x'], Number(e.target.value))}
                  className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                />
              </div>
              <div className="flex items-center gap-4 min-w-[160px]">
                <span className="text-[10px] font-bold text-white/40 uppercase w-8">Rot</span>
                <input 
                  type="range" 
                  min="-45" 
                  max="45" 
                  value={overlayState.profileLine.rotation} 
                  onChange={(e) => updateOverlay(['profileLine', 'rotation'], Number(e.target.value))}
                  className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                />
              </div>
            </div>
          )}
        </>
      )}

      <button 
        onClick={onFlipH}
        className="p-4 bg-white/10 backdrop-blur-md rounded-2xl text-white hover:bg-white/20 transition-all border border-white/10 flex flex-col items-center gap-2"
      >
        <FlipHorizontal className="w-6 h-6" />
        <span className="text-[10px] font-bold uppercase">Flip H</span>
      </button>
      <button 
        onClick={onFlipV}
        className="p-4 bg-white/10 backdrop-blur-md rounded-2xl text-white hover:bg-white/20 transition-all border border-white/10 flex flex-col items-center gap-2"
      >
        <FlipVertical className="w-6 h-6" />
        <span className="text-[10px] font-bold uppercase">Flip V</span>
      </button>
    </div>
  );
};

export default React.memo(RecordsToolbar);
