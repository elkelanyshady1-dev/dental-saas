import React from 'react';
import { Eye, CreditCard } from 'lucide-react';

const FinancialSummaryCard: React.FC = () => {
  const totalCost = 5200;
  const paid = 4850;
  const remaining = totalCost - paid;
  const progress = (paid / totalCost) * 100;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
              <CreditCard className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Financial Summary</h3>
          </div>
          <button className="text-slate-300 hover:text-slate-500 transition-colors">
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-medium text-slate-500">Total Cost</span>
              <span className="text-[11px] font-bold text-slate-700">${totalCost.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-medium text-slate-500">Paid to Date</span>
              <span className="text-[11px] font-bold text-emerald-600">${paid.toLocaleString()}</span>
            </div>
            
            <div className="space-y-1 pt-1">
              <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-widest text-slate-400">
                <span>Payment Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="pt-2.5 border-t border-slate-100 flex justify-between items-end">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Remaining Balance</span>
                <p className="text-[9px] text-slate-400 font-medium mt-0.5">12 of 24 installments</p>
              </div>
              <span className="text-lg font-black text-blue-600 tracking-tight">${remaining.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancialSummaryCard;
