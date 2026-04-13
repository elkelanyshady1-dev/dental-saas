import React from 'react';
import { ShieldAlert, LogOut } from 'lucide-react';
import { usePlatformAuth } from '../../auth/PlatformAuthContext';

/**
 * PlatformLockdown
 * v18.0 Hardened Governance — Emergency Kill Switch UI
 */
const PlatformLockdown = () => {
    const { logout } = usePlatformAuth();

    return (
        <div className="fixed inset-0 z-[9999] bg-slate-950 flex items-center justify-center p-6 text-white font-sans">
            <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500">
                <div className="flex justify-center">
                    <div className="p-4 bg-red-500/10 rounded-2xl border border-red-500/20 shadow-2xl shadow-red-500/10">
                        <ShieldAlert className="w-16 h-16 text-red-500 animate-pulse" />
                    </div>
                </div>

                <div className="space-y-4">
                    <h1 className="text-4xl font-black tracking-tighter uppercase italic">System Lockdown</h1>
                    <p className="text-slate-400 text-sm leading-relaxed font-medium">
                        The Platform Control Plane has entered an emergency lockdown state.
                        Global administrative access is currently suspended by governance policy.
                    </p>
                </div>

                <div className="pt-8 space-y-4">
                    <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 text-[10px] font-mono text-slate-500 text-left uppercase">
                        <p>Reason: PLATFORM_KILL_SWITCH_ACTIVE</p>
                        <p>Status: ARCHITECTURAL_REJECT</p>
                        <p>Timestamp: {new Date().toISOString()}</p>
                    </div>

                    <button
                        onClick={logout}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition-all border border-slate-700 active:scale-95"
                    >
                        <LogOut className="w-4 h-4" />
                        Safe Exit
                    </button>
                </div>

                <p className="text-[10px] text-slate-700 font-bold tracking-widest uppercase">
                    v18.0 TDS Sovereign Governance Enforced
                </p>
            </div>
        </div>
    );
};

export default PlatformLockdown;
