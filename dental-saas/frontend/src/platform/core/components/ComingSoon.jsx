import React from 'react';
import { Construction } from 'lucide-react';

const ComingSoon = ({ featureName }) => {
    return (
        <div className="h-full flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-700">
            <div className="w-20 h-20 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-6 border border-indigo-500/20 shadow-xl shadow-indigo-500/5">
                <Construction className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-bold text-slate-100 mb-3">{featureName}</h2>
            <p className="text-slate-400 max-w-md mx-auto leading-relaxed">
                This sovereign module is currently under development. Its backend capabilities are active, but the frontend interface is being hardened for high-scale operations.
            </p>
            <div className="mt-8 flex gap-2">
                <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 text-[10px] font-bold uppercase tracking-widest rounded-full border border-indigo-500/20">
                    Sovereign Core
                </span>
                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-widest rounded-full border border-emerald-500/20">
                    Backend Validated
                </span>
            </div>
        </div>
    );
};

export default ComingSoon;
