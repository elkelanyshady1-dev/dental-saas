import { useState, useEffect } from "react";

export default function SystemCronPage() {
    // Placeholder Data: In a future phase, this would be fetched from a GET /api/platform/system/locks endpoint
    const [locks, setLocks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Simulate network fetch
        setTimeout(() => {
            const now = Date.now();
            setLocks([
                {
                    id: "1",
                    jobName: "scanSubscriptions",
                    lockedBy: "worker-node-alpha",
                    lockedUntil: new Date(now + 10 * 60 * 1000).toISOString(),
                    status: "active",
                    lastRunDuration: "142ms"
                },
                {
                    id: "2",
                    jobName: "scanPendingInvoices",
                    lockedBy: "worker-node-beta",
                    lockedUntil: new Date(now - 60 * 1000).toISOString(), // Expired
                    status: "idle",
                    lastRunDuration: "89ms"
                }
            ]);
            setLoading(false);
        }, 500);
    }, []);

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-5 h-5 border-2 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Pinging Daemon Locks...</p>
        </div>
    );

    return (
        <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">System Daemons</h1>
                <p className="text-gray-500 mt-1 text-sm">Background worker synchronization and distributed lock states</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-400 uppercase tracking-wider text-[10px] font-bold">
                        <tr>
                            <th className="px-6 py-4">Daemon Process</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Active Worker Node</th>
                            <th className="px-6 py-4">Lock Expiration</th>
                            <th className="px-6 py-4 text-right">Last Duration</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {locks.map(lock => {
                            const isExpired = new Date(lock.lockedUntil) < new Date();
                            return (
                                <tr key={lock.id} className="hover:bg-gray-50/50">
                                    <td className="px-6 py-4 font-bold text-gray-800 font-mono text-xs">{lock.jobName}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${!isExpired ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-gray-100 text-gray-500'}`}>
                                            {!isExpired ? "Locked (Running)" : "Idle"}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 text-[11px] font-mono">{!isExpired ? lock.lockedBy : '—'}</td>
                                    <td className="px-6 py-4 text-gray-600 text-xs">
                                        {new Date(lock.lockedUntil).toLocaleTimeString()}
                                    </td>
                                    <td className="px-6 py-4 text-right text-gray-600 text-xs font-mono">{lock.lastRunDuration}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-xs text-blue-800 font-medium flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p>Distributed cron locking is powered by MongoDB `cronLockService`. Live API endpoints will be connected in an upcoming platform release to monitor these exact MongoDB documents natively.</p>
            </div>
        </div>
    );
}
