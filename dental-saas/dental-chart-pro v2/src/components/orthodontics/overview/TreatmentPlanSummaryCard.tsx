import React, { useState } from 'react';
import { Plus, X, ClipboardList } from 'lucide-react';

const TreatmentPlanSummaryCard: React.FC = () => {
  const [plan, setPlan] = useState<string[]>([
    "4s Extraction",
    "Expansion",
    "IPR",
    "Class II Correction",
    "Midline Correction"
  ]);
  const [newItem, setNewItem] = useState("");

  const addItem = () => {
    if (newItem.trim()) {
      setPlan([...plan, newItem.trim()]);
      setNewItem("");
    }
  };

  const removeItem = (index: number) => {
    setPlan(plan.filter((_, i) => i !== index));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
            <ClipboardList className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <h3 className="font-bold text-slate-800 text-sm">Treatment Plan Summary</h3>
        </div>
      </div>
      
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {plan.map((item, index) => (
            <div 
              key={index} 
              className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-100 rounded-full group hover:border-blue-200 transition-all"
            >
              <span className="text-[10px] font-bold text-slate-600">{item}</span>
              <button 
                onClick={() => removeItem(index)}
                className="text-slate-300 hover:text-rose-500 transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-slate-50 flex gap-2">
          <input 
            type="text" 
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Add plan item..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
          />
          <button 
            onClick={addItem}
            className="w-8 h-8 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TreatmentPlanSummaryCard;
