import React, { useState } from 'react';
import {
    Monitor,
    Smartphone,
    Globe,
    ShieldAlert,
    XCircle,
    Activity,
    Clock
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
    return twMerge(clsx(inputs));
}

const SessionExplorer = ({ sessions = [], onRevoke, loading }) => {
    const maskIP = (ip) => {
        if (!ip) return 'Unknown';
        if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + ':****';
        const parts = ip.split('.');
        if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.***`;
        return ip;
    };

    const getDeviceIcon = (ua) => {
        if (!ua) return Monitor;
        const loweredUA = ua.toLowerCase();
        if (loweredUA.includes('mobi') || loweredUA.includes('android')) return Smartphone;
        return Monitor;
    };

    return (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-bold text-slate-100">Active Security Sessions</h3>
                </div>
                <span className="text-xs font-mono text-slate-500 uppercase tracking-widest bg-slate-800 px-2 py-1 rounded">
                    {sessions.length} Active
                </span>
            </div>

            <div className="divide-y divide-slate-800">
                {sessions.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 italic flex flex-col items-center gap-2">
                        <Clock className="w-8 h-8 opacity-20" />
                        <p>No active sessions detected for this security profile.</p>
                    </div>
                ) : (
                    sessions.map((session, idx) => {
                        const Icon = getDeviceIcon(session.userAgent);
                        return (
                            <div key={idx} className="p-4 hover:bg-slate-800/20 transition-colors flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300">
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-slate-200">{maskIP(session.ipAddress)}</span>
                                            {idx === 0 && (
                                                <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] rounded uppercase font-bold">
                                                    Current
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-slate-500 flex items-center gap-3 mt-0.5">
                                            <span className="truncate max-w-[200px]" title={session.userAgent}>
                                                {session.userAgent || 'Unknown Browser'}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Globe className="w-3 h-3" />
                                                {new Date(session.lastActive).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => onRevoke(session)}
                                    disabled={loading}
                                    className="px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-lg border border-red-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    <XCircle className="w-3.5 h-3.5" />
                                    Revoke
                                </button>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="p-4 bg-red-950/20 border-t border-slate-800">
                <div className="flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                    <div>
                        <p className="text-xs text-red-200 font-medium">Remote Session Termination</p>
                        <p className="text-[10px] text-red-400 leading-relaxed mt-0.5">
                            Revoking a session will immediately invalidate the access token and require re-authentication.
                            Active long-polling or WebSocket connections may persist for up to 5 minutes.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SessionExplorer;
