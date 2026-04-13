import React, { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const DentalNotationChart = ({ 
  arch, 
  data, 
  onChange,
  mode = 'clinical'
}: { 
  arch: 'upper' | 'lower' | 'both', 
  data: Record<string, string[]>, 
  onChange: (tooth: string, statuses: string[]) => void,
  mode?: 'clinical' | 'opg' | 'problem-list'
}) => {
  const [activeTooth, setActiveTooth] = useState<string | null>(null);
  
  const upperTeeth = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const lowerTeeth = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

  const clinicalStatuses = [
    { id: 'missing', label: 'M', color: 'bg-slate-500' },
    { id: 'caries', label: 'C', color: 'bg-red-500' },
    { id: 'fracture', label: 'F', color: 'bg-amber-500' },
    { id: 'restoration', label: 'R', color: 'bg-blue-500' },
    { id: 'rotated', label: 'Ro', color: 'bg-emerald-500' },
    { id: 'displaced', label: 'D', color: 'bg-rose-500' }
  ];

  const opgStatuses = [
    { id: 'missing', label: 'M', color: 'bg-slate-500' },
    { id: 'resorption', label: 'RR', color: 'bg-orange-500' },
    { id: 'unerupted', label: 'U', color: 'bg-cyan-500' },
    { id: 'pathology', label: 'P', color: 'bg-fuchsia-500' },
    { id: 'impacted', label: 'I', color: 'bg-red-600' }
  ];

  const problemListStatuses = [
    { id: 'caries', label: 'C', color: 'bg-red-500' },
    { id: 'missing', label: 'M', color: 'bg-slate-500' },
    { id: 'impacted', label: 'I', color: 'bg-red-600' },
    { id: 'extra', label: 'E', color: 'bg-emerald-500' },
    { id: 'ankylosed', label: 'A', color: 'bg-amber-600' },
    { id: 'non-restorable', label: 'NR', color: 'bg-rose-700' },
    { id: 'other', label: 'O', color: 'bg-blue-500' }
  ];

  const getStatuses = () => {
    if (mode === 'opg') return opgStatuses;
    if (mode === 'problem-list') return problemListStatuses;
    return clinicalStatuses;
  };

  const statuses = getStatuses();

  const renderTeethRow = (teethList: number[]) => (
    <div className="grid grid-cols-8 gap-2">
      {teethList.map(tooth => {
        const toothStr = tooth.toString();
        const currentStatuses = data[toothStr] || [];
        const isActive = activeTooth === toothStr;
        
        return (
          <div key={tooth} className="flex flex-col items-center gap-1 relative">
            <span className="text-[8px] font-bold text-slate-400">{tooth}</span>
            <div 
              onClick={() => setActiveTooth(isActive ? null : toothStr)}
              className={`w-8 h-10 rounded-lg border flex flex-col items-center justify-center transition-all cursor-pointer relative ${
                currentStatuses.length > 0 
                ? 'bg-purple-500/10 border-purple-500/30' 
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              } ${isActive ? 'ring-2 ring-purple-500 border-transparent' : ''}`}
            >
              <div className="flex flex-wrap gap-0.5 justify-center p-0.5">
                {currentStatuses.map(s => (
                  <div key={s} className={`w-2 h-2 rounded-full ${statuses.find(st => st.id === s)?.color} shadow-sm`} />
                ))}
              </div>
              {currentStatuses.length === 0 && <div className="w-1 h-1 rounded-full bg-slate-200" />}
            </div>
            
            {/* Popover menu */}
            <AnimatePresence>
              {isActive && (
                <>
                  <div 
                    className="fixed inset-0 z-[60]" 
                    onClick={() => setActiveTooth(null)}
                  />
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 10 }}
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white border border-slate-200 rounded-xl p-2 shadow-2xl z-[70] flex flex-col gap-1 min-w-[130px]"
                  >
                    <div className="px-2 py-1 mb-1 border-b border-slate-100 flex justify-between items-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Tooth {tooth}</span>
                      <button onClick={() => setActiveTooth(null)} className="text-slate-300 hover:text-slate-600">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    {statuses.map(s => (
                      <button
                        key={s.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          const newStatuses = currentStatuses.includes(s.id)
                            ? currentStatuses.filter(item => item !== s.id)
                            : [...currentStatuses, s.id];
                          onChange(toothStr, newStatuses);
                        }}
                        className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-[10px] transition-all ${
                          currentStatuses.includes(s.id)
                          ? 'bg-slate-100 text-slate-900 font-bold'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${s.color}`} />
                          <span className="capitalize">{s.id.replace('-', ' ')}</span>
                        </div>
                        {currentStatuses.includes(s.id) && <div className="w-1 h-1 rounded-full bg-purple-500" />}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-200 relative">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          {mode === 'opg' ? 'Radiographic Chart' : mode === 'problem-list' ? 'Problem List Snapshot' : `Dental Chart (${arch})`}
        </span>
        <div className="flex flex-wrap gap-x-3 gap-y-1 justify-end max-w-[220px]">
          {statuses.map(s => (
            <div key={s.id} className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
              <span className="text-[8px] text-slate-500 uppercase">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
      
      {arch === 'upper' && renderTeethRow(upperTeeth)}
      {arch === 'lower' && renderTeethRow(lowerTeeth)}
      {arch === 'both' && (
        <div className="space-y-6">
          <div className="space-y-2">
            <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Upper Arch</span>
            {renderTeethRow(upperTeeth)}
          </div>
          <div className="space-y-2">
            <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Lower Arch</span>
            {renderTeethRow(lowerTeeth)}
          </div>
        </div>
      )}
    </div>
  );
};
