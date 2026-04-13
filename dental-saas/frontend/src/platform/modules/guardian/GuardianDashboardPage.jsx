/**
 * GuardianDashboardPage.jsx
 * Platform Guardian Dashboard — Main Page
 *
 * Features:
 *   - Real-time metrics from /api/platform/guardian/overview
 *   - Auto-refresh every 10 seconds
 *   - WebSocket listener on /guardian-live (instant alert updates)
 *   - Critical alert sound cue when critical count increases
 *   - Run Scan button (POST /guardian/run-scan → persists audit log)
 *   - Export button (GET /guardian/export → JSON download)
 *   - Scan History table (GET /guardian/history)
 *   - Alert table with clickable org links
 *   - Strict mode indicator
 *   - Danger states for violated invariants
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
    RefreshCw,
    ScanLine,
    Download,
    ShieldAlert,
    ShieldCheck,
    AlertTriangle,
    XCircle,
    CheckCircle,
    Clock,
    Cpu,
    MemoryStick,
    Activity,
    History,
    User,
    Zap
} from "lucide-react";
import platformApi from "@/platform/auth/platformApi";
import { MetricCard } from "./components/MetricCard";
import { AlertTable } from "./components/AlertTable";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUptime(seconds) {
    if (!seconds) return "—";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
}

function formatDateTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(undefined, {
        month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
}

function LastRefreshed({ time }) {
    if (!time) return null;
    return (
        <span className="text-[10px] text-slate-500 font-mono">
            Last refreshed: {new Date(time).toLocaleTimeString()}
        </span>
    );
}

// ─── Scan History Table ───────────────────────────────────────────────────────

function ScanHistoryTable({ scans, loading }) {
    if (loading) {
        return (
            <div className="py-8 text-center text-slate-500 text-sm animate-pulse">Loading history…</div>
        );
    }
    if (!scans || scans.length === 0) {
        return (
            <div className="rounded-xl border border-slate-700/50 py-10 text-center text-slate-500 text-sm">
                No scan history yet. Run a manual scan to start recording.
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-800/80 border-b border-slate-700/50">
                        <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Time</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Type</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Total</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Critical</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Warnings</th>
                        <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Triggered By</th>
                    </tr>
                </thead>
                <tbody>
                    {scans.map((scan) => (
                        <tr
                            key={scan._id}
                            className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors"
                        >
                            <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                                {formatDateTime(scan.createdAt)}
                            </td>
                            <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${scan.scanType === "manual"
                                        ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                                        : "bg-slate-700/40 text-slate-400 border border-slate-600/20"
                                    }`}>
                                    {scan.scanType === "manual" ? <Zap className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                                    {scan.scanType}
                                </span>
                            </td>
                            <td className="px-4 py-3 text-white font-semibold text-xs">{scan.summary?.totalAlerts ?? 0}</td>
                            <td className="px-4 py-3">
                                {scan.summary?.critical > 0 ? (
                                    <span className="text-red-400 font-bold text-xs">{scan.summary.critical}</span>
                                ) : (
                                    <span className="text-slate-500 text-xs">0</span>
                                )}
                            </td>
                            <td className="px-4 py-3">
                                {scan.summary?.warnings > 0 ? (
                                    <span className="text-amber-400 font-semibold text-xs">{scan.summary.warnings}</span>
                                ) : (
                                    <span className="text-slate-500 text-xs">0</span>
                                )}
                            </td>
                            <td className="px-4 py-3">
                                {scan.scanTriggeredBy ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                                        <User className="w-3 h-3 text-slate-500" />
                                        {scan.scanTriggeredBy.email || scan.scanTriggeredBy.fullName || "Unknown"}
                                    </span>
                                ) : (
                                    <span className="text-slate-500 text-xs italic">auto</span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GuardianDashboardPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState(null);
    const [lastAt, setLastAt] = useState(null);
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [wsStatus, setWsStatus] = useState("connecting"); // connecting | connected | disconnected
    const prevCriticalRef = useRef(0);

    // ── Data Fetchers ─────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        try {
            const res = await platformApi.get("/guardian/overview");
            const newData = res.data.data;

            // Alert sound on critical increase
            const newCritical = newData?.summary?.critical || 0;
            if (newCritical > prevCriticalRef.current) {
                playAlertCue();
            }
            prevCriticalRef.current = newCritical;

            setData(newData);
            setLastAt(new Date().toISOString());
            setError(null);
        } catch (err) {
            setError(err.response?.data?.error?.message || "Failed to load guardian data");
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchHistory = useCallback(async () => {
        setHistoryLoading(true);
        try {
            const res = await platformApi.get("/guardian/history?limit=25");
            setHistory(res.data.scans || []);
        } catch {
            // Non-critical — silently fail
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    // ── Alert Sound Cue ───────────────────────────────────────────────────────
    function playAlertCue() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = "sine";
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
        } catch {
            // AudioContext not available — silent fail
        }
    }

    // ── Auto-refresh ──────────────────────────────────────────────────────────
    useEffect(() => {
        fetchData();
        fetchHistory();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, [fetchData, fetchHistory]);

    // ── WebSocket Real-Time Listener ──────────────────────────────────────────
    useEffect(() => {
        // Determine WebSocket URL from current page origin
        const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        // In dev: Vite proxy is HTTP only — connect directly to backend port
        const wsHost = import.meta.env.DEV
            ? "ws://localhost:5000"
            : `${wsProtocol}//${window.location.host}`;
        const wsUrl = `${wsHost}/guardian-live`;

        let ws;
        let reconnectTimer;
        let pingTimer;

        const connect = () => {
            try {
                ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    setWsStatus("connected");
                    // Send keepalive PING every 25s
                    pingTimer = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: "PING" }));
                        }
                    }, 25000);
                };

                ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.type === "ALERT_UPDATE") {
                            // Alerts changed server-side — fetch fresh data immediately
                            fetchData();
                            fetchHistory();
                        }
                    } catch {
                        // Malformed frame — ignore
                    }
                };

                ws.onclose = () => {
                    setWsStatus("disconnected");
                    clearInterval(pingTimer);
                    // Reconnect after 5s
                    reconnectTimer = setTimeout(connect, 5000);
                };

                ws.onerror = () => {
                    setWsStatus("disconnected");
                    ws.close();
                };
            } catch {
                setWsStatus("disconnected");
            }
        };

        connect();

        return () => {
            clearTimeout(reconnectTimer);
            clearInterval(pingTimer);
            if (ws) ws.close(1000, "Component unmounted");
        };
    }, [fetchData, fetchHistory]);

    // ── Run Scan ──────────────────────────────────────────────────────────────
    const handleRunScan = async () => {
        setScanning(true);
        try {
            const res = await platformApi.post("/guardian/run-scan");
            setData(res.data.data);
            setLastAt(new Date().toISOString());
            setError(null);
            // Refresh history after manual scan (audit log was persisted by backend)
            fetchHistory();
        } catch (err) {
            setError(err.response?.data?.error?.message || "Scan failed");
        } finally {
            setScanning(false);
        }
    };

    // ── Export ────────────────────────────────────────────────────────────────
    const handleExport = async () => {
        try {
            const res = await platformApi.get("/guardian/export", { responseType: "blob" });
            const blob = new Blob([res.data], { type: "application/json" });
            const href = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = href;
            a.download = `guardian-report-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
            a.click();
            URL.revokeObjectURL(href);
        } catch {
            window.open("/api/platform/guardian/export", "_blank");
        }
    };

    // ── Derived State ─────────────────────────────────────────────────────────
    const summary = data?.summary || {};
    const runtime = data?.runtime || {};
    const system = data?.system || {};
    const alerts = data?.alerts || [];
    const isStrict = system.strictMode;
    const hasCritical = (summary.critical || 0) > 0;

    // ── Loading ───────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
                    <p className="text-slate-400 text-sm font-medium">Loading guardian metrics…</p>
                </div>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="flex-1 p-8">
                <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-8 text-center max-w-lg mx-auto mt-12">
                    <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                    <p className="text-red-300 font-semibold mb-1">Guardian Unavailable</p>
                    <p className="text-slate-400 text-sm">{error}</p>
                    <button onClick={fetchData}
                        className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm font-medium rounded-lg transition-colors">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    // ── Main Dashboard ────────────────────────────────────────────────────────
    return (
        <div className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto p-8 space-y-8">

                {/* ── Header ──────────────────────────────────────────────── */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${hasCritical ? "bg-red-600 shadow-red-900/50" : "bg-blue-600 shadow-blue-900/50"
                            }`}>
                            <ShieldAlert className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-white tracking-tight">Platform Guardian</h1>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                                <LastRefreshed time={lastAt} />
                                <span className="w-1 h-1 bg-slate-600 rounded-full" />

                                {/* WebSocket status */}
                                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${wsStatus === "connected" ? "text-emerald-400" : wsStatus === "connecting" ? "text-blue-400" : "text-slate-400"
                                    }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === "connected" ? "bg-emerald-500 animate-pulse" : wsStatus === "connecting" ? "bg-blue-500 animate-pulse" : "bg-slate-500"
                                        }`} />
                                    {wsStatus === "connected" ? "Live" : wsStatus === "connecting" ? "Connecting…" : "Offline"}
                                </span>

                                <span className="w-1 h-1 bg-slate-600 rounded-full" />

                                {/* Strict mode badge */}
                                {isStrict ? (
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                        Strict Mode
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                                        Soft Mode
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3">
                        <button onClick={fetchData}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all border border-slate-700/50"
                            title="Refresh">
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        <button onClick={handleRunScan} disabled={scanning}
                            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-blue-900/30">
                            {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
                            {scanning ? "Scanning…" : "Run Scan"}
                        </button>
                        <button onClick={handleExport}
                            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl transition-all border border-slate-700/50">
                            <Download className="w-4 h-4" />
                            Export
                        </button>
                    </div>
                </div>

                {/* ── Non-blocking error banner ───────────────────────────── */}
                {error && data && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-5 py-3 flex items-center gap-3">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-amber-300 text-sm">{error} — showing last known data</span>
                    </div>
                )}

                {/* ── Alert Summary Banner ────────────────────────────────── */}
                {summary.totalAlerts > 0 ? (
                    <div className={`rounded-xl border px-6 py-4 flex items-center gap-4 ${hasCritical ? "border-red-500/30 bg-red-950/30" : "border-amber-500/20 bg-amber-950/20"
                        }`}>
                        {hasCritical
                            ? <XCircle className="w-6 h-6 text-red-400 shrink-0" />
                            : <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />}
                        <div>
                            <p className={`font-bold text-sm ${hasCritical ? "text-red-300" : "text-amber-300"}`}>
                                {summary.critical > 0 && `${summary.critical} critical`}
                                {summary.critical > 0 && summary.warnings > 0 && ", "}
                                {summary.warnings > 0 && `${summary.warnings} warning${summary.warnings !== 1 ? "s" : ""}`}
                                {" detected"}
                            </p>
                            <p className="text-slate-400 text-xs mt-0.5">Review the alert table and take corrective action</p>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-6 py-4 flex items-center gap-4">
                        <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
                        <div>
                            <p className="font-bold text-sm text-emerald-300">Platform Integrity Clean</p>
                            <p className="text-slate-400 text-xs mt-0.5">All invariants passing — no revenue risks detected</p>
                        </div>
                    </div>
                )}

                {/* ── Runtime Metrics Grid ────────────────────────────────── */}
                <section>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Contract Runtime</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        <MetricCard title="Active Contracts" value={runtime.activeContracts} icon={<Activity className="w-4 h-4" />} />
                        <MetricCard title="Overlapping" value={runtime.overlappingContracts} danger={runtime.overlappingContracts > 0} icon={<XCircle className="w-4 h-4" />} />
                        <MetricCard title="Null Price" value={runtime.nullLockedPrice} danger={runtime.nullLockedPrice > 0} icon={<XCircle className="w-4 h-4" />} />
                        <MetricCard title="Expired Auto-Renew" value={runtime.expiredAutoRenew} danger={runtime.expiredAutoRenew > 0} icon={<AlertTriangle className="w-4 h-4" />} />
                        <MetricCard title="Orphan Drafts" value={runtime.orphanDrafts} danger={runtime.orphanDrafts > 0} icon={<AlertTriangle className="w-4 h-4" />} />
                    </div>
                </section>

                {/* ── System Metrics ──────────────────────────────────────── */}
                <section>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">System</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <MetricCard title="Process ID" value={system.pid} icon={<Cpu className="w-4 h-4" />} />
                        <MetricCard title="Uptime" value={formatUptime(system.uptimeSeconds)} icon={<Clock className="w-4 h-4" />} />
                        <MetricCard title="Heap Used" value={system.memoryMB} unit="MB" danger={system.memoryMB > 512} icon={<MemoryStick className="w-4 h-4" />} />
                        <MetricCard title="Guardian Mode" value={isStrict ? "STRICT" : "SOFT"}
                            danger={!isStrict}
                            icon={isStrict ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />} />
                    </div>
                </section>

                {/* ── Alert Table ─────────────────────────────────────────── */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
                            Integrity Alerts
                            {alerts.length > 0 && (
                                <span className="ml-2 px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-[10px] font-bold">
                                    {alerts.length}
                                </span>
                            )}
                        </h2>
                    </div>
                    <AlertTable alerts={alerts} />
                </section>

                {/* ── Scan History ─────────────────────────────────────────── */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                            <History className="w-3.5 h-3.5" />
                            Recent Scans
                            {history.length > 0 && (
                                <span className="px-2 py-0.5 bg-slate-700/60 text-slate-400 rounded-full text-[10px] font-bold">
                                    Last {history.length}
                                </span>
                            )}
                        </h2>
                        <button onClick={fetchHistory}
                            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1">
                            <RefreshCw className="w-3 h-3" /> Refresh
                        </button>
                    </div>
                    <ScanHistoryTable scans={history} loading={historyLoading} />
                </section>

            </div>
        </div>
    );
}
