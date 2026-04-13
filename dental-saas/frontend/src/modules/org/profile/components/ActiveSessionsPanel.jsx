/**
 * ActiveSessionsPanel.jsx — Active Sessions Management
 * Lists active auth sessions with terminate/logout-all functionality.
 */
import { useState, useEffect, useCallback } from "react";
import { authApi } from "../api/auth.api";

export default function ActiveSessionsPanel() {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchSessions = useCallback(async () => {
        setLoading(true);
        try {
            const res = await authApi.getSessions();
            setSessions(res.data?.sessions || res.data || []);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load sessions");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchSessions(); }, [fetchSessions]);

    const handleTerminate = async (sessionId) => {
        if (!window.confirm("Terminate this session?")) return;
        try {
            await authApi.terminateSession(sessionId);
            fetchSessions();
        } catch (err) {
            setError(err.response?.data?.message || "Failed to terminate session");
        }
    };

    const handleLogoutAll = async () => {
        if (!window.confirm("Sign out from ALL devices? You will need to log in again.")) return;
        try {
            await authApi.logoutAll();
            window.dispatchEvent(new Event("auth-session-expired"));
        } catch (err) {
            setError(err.response?.data?.message || "Failed to logout from all devices");
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-base font-bold text-gray-800">Active Sessions</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Manage your active login sessions</p>
                </div>
                <button
                    onClick={handleLogoutAll}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition"
                >
                    Sign Out All
                </button>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-10">
                    <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
            ) : sessions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8 italic">No active sessions found</p>
            ) : (
                <div className="space-y-3">
                    {sessions.map((s) => {
                        const isCurrent = s.isCurrent || s.current;
                        return (
                            <div key={s._id || s.sessionId} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${isCurrent ? "border-blue-200 bg-blue-50/30" : "border-gray-100 bg-gray-50/30"}`}>
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isCurrent ? "bg-emerald-500" : "bg-gray-300"}`} />
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-800 truncate">
                                            {s.userAgent || s.device || "Unknown device"}
                                            {isCurrent && <span className="ml-2 text-xs text-blue-600 font-bold">(This device)</span>}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {s.ip || "—"} • {s.lastActive ? new Date(s.lastActive).toLocaleString() : "—"}
                                        </p>
                                    </div>
                                </div>
                                {!isCurrent && (
                                    <button
                                        onClick={() => handleTerminate(s._id || s.sessionId)}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 transition-colors flex-shrink-0 ml-3"
                                    >
                                        Terminate
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
