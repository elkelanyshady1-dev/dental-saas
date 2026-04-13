import React from 'react';
import { ShieldAlert, Home, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PlatformUnauthorized = () => {
    const navigate = useNavigate();

    return (
        <div className="h-full flex flex-col items-center justify-center p-12 text-center animate-in zoom-in duration-500">
            <div className="w-24 h-24 rounded-3xl bg-red-500/10 flex items-center justify-center text-red-500 mb-8 border border-red-500/20 shadow-2xl shadow-red-500/10">
                <ShieldAlert className="w-12 h-12 animate-pulse" />
            </div>

            <h1 className="text-4xl font-extrabold text-white mb-4 tracking-tight">Access Denied</h1>
            <p className="text-slate-400 max-w-md mx-auto leading-relaxed mb-10 text-lg">
                Your sovereign account does not have the required capabilities to penetrate this module.
                Governance rules prevent unauthorized escalation.
            </p>

            <div className="flex gap-4">
                <button
                    onClick={() => navigate(-1)}
                    className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-2xl transition-all font-bold flex items-center gap-2 border border-slate-700 hover:border-slate-600 shadow-xl"
                >
                    <ChevronLeft className="w-5 h-5" />
                    Go Back
                </button>
                <button
                    onClick={() => navigate('/platform/dashboard')}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl transition-all font-bold flex items-center gap-2 border border-indigo-500 shadow-xl shadow-indigo-500/20"
                >
                    <Home className="w-5 h-5" />
                    Teleport Home
                </button>
            </div>

            <div className="mt-16 pt-8 border-t border-slate-800/50 w-full max-w-xs">
                <p className="text-[10px] text-slate-600 uppercase tracking-[0.2em] font-black">
                    TDS Sovereign Security Layer
                </p>
            </div>
        </div>
    );
};

export default PlatformUnauthorized;
