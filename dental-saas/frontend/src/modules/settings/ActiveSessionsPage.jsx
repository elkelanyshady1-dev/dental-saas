import { useState, useEffect } from "react";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";

export default function ActiveSessionsPage() {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { logout } = useAuth();

    const fetchSessions = async () => {
        try {
            setLoading(true);
            const res = await api.get("/auth/sessions");
            setSessions(res.data);
            setError(null);
        } catch (err) {
            setError("Failed to load active sessions.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    const handleRevoke = async (id) => {
        if (!window.confirm("Are you sure you want to log out of this device?")) return;
        try {
            await api.post(`/auth/sessions/${id}/revoke`);
            setSessions(sessions.filter(s => s.id !== id));
        } catch (err) {
            alert("Failed to revoke session.");
        }
    };

    const handleRevokeAll = async () => {
        if (!window.confirm("This will log you out of ALL devices, including this one. Continue?")) return;
        try {
            await api.post("/auth/sessions/revoke-all");
            logout(); // The backend cleared cookies and bumped tokenVersion, so frontend must logout
        } catch (err) {
            alert("Failed to revoke all sessions.");
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-400">Loading sessions...</div>;

    return (
        <div className="max-w-4xl mx-auto p-6">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Active Sessions</h1>
                    <p className="text-slate-500">Manage all devices currently logged into your account.</p>
                </div>
                <button
                    onClick={handleRevokeAll}
                    className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors border border-red-200"
                >
                    Log Out All Others
                </button>
            </header>

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl">
                    {error}
                </div>
            )}

            <div className="grid gap-4">
                {sessions.map((session) => (
                    <div
                        key={session.id}
                        className={`p-5 rounded-2xl border transition-all ${session.isCurrentSession
                                ? "bg-blue-50/50 border-blue-100 ring-1 ring-blue-200"
                                : "bg-white border-slate-100 hover:border-slate-200 shadow-sm"
                            }`}
                    >
                        <div className="flex justify-between items-start">
                            <div className="flex gap-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${session.isCurrentSession ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                                    }`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-slate-800">{session.deviceName || "Web Sessions"}</h3>
                                        {session.isCurrentSession && (
                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full uppercase tracking-wider">
                                                Current Device
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-slate-500 mt-1">{session.userAgent || "Unknown User Agent"}</p>
                                    <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                                        <span className="flex items-center gap-1">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                                            {session.ipAddress}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                                            Last active {new Date(session.lastUsedAt).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {!session.isCurrentSession && (
                                <button
                                    onClick={() => handleRevoke(session.id)}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    title="Revoke Session"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <section className="mt-12 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-2">Security Note</h2>
                <p className="text-sm text-slate-500 leading-relaxed">
                    If you see a device you don't recognize, we recommend revoking its access immediately and changing your password.
                    Revoking a session will force that device to log in again on their next request.
                </p>
            </section>
        </div>
    );
}
