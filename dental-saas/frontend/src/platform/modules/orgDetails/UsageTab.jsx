import React from "react";
import { useOrgUsage } from "../../hooks/useOrgUsage";
import { Spinner } from "../../utils/components/Spinner";
import { Users, Building2, MessageSquare, Mail, PhoneCall } from "lucide-react";

export default function UsageTab({ orgId }) {
    const { data: usage, loading, error } = useOrgUsage(orgId);

    if (loading) return <Spinner />;
    if (error) return <div className="p-6 text-red-500 bg-red-50 rounded-lg border border-red-100">{error}</div>;
    if (!usage) return <div className="p-6 text-slate-500 font-medium">No usage metrics available for this organization.</div>;

    const { stats = {}, limits = {} } = usage;

    const UsageGauge = ({ label, used, max, icon: Icon, color }) => {
        const percentage = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
        const isCritical = percentage > 90;

        return (
            <div className={`p-6 rounded-card border shadow-card transition-all ${isCritical ? 'bg-red-50/30 border-red-100' : 'bg-bg-card border-brand-border'}`}>
                <div className="flex justify-between items-center mb-6">
                    <div className={`p-2.5 rounded-xl ${isCritical ? 'bg-red-100 text-red-600' : `bg-${color}-50 text-${color}-600`}`}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div className="text-right">
                        <span className="text-xl font-black text-slate-900">{used.toLocaleString()}</span>
                        {max && <span className="text-xs text-slate-400 font-bold ml-1 uppercase">/ {max.toLocaleString()}</span>}
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-500">{label}</span>
                        <span className={isCritical ? 'text-red-600' : `text-${color}-600`}>
                            {max ? `${Math.round(percentage)}%` : 'Active'}
                        </span>
                    </div>
                    {max ? (
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-1000 ${isCritical ? 'bg-red-500' : `bg-${color}-500`}`}
                                style={{ width: `${percentage}%` }}
                            />
                        </div>
                    ) : (
                        <div className="h-2 bg-slate-50 rounded-full overflow-hidden">
                            <div className={`h-full w-full rounded-full bg-${color}-500/20`} />
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-bg-card p-6 border border-brand-border rounded-card shadow-card">
                <h3 className="text-lg font-semibold text-slate-900">Resource Governance</h3>
                <p className="text-sm text-slate-500 font-medium">Real-time resource allocation and utilization monitoring.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <UsageGauge label="User Seats" used={stats.users || 0} max={limits.maxUsers} icon={Users} color="blue" />
                <UsageGauge label="Branch Access" used={stats.branches || 0} max={limits.maxBranches} icon={Building2} color="indigo" />
                <UsageGauge label="SMS Gateway" used={stats.sms || 0} max={limits.monthlySms} icon={MessageSquare} color="amber" />
                <UsageGauge label="Email Gateway" used={stats.emails || 0} max={limits.monthlyEmails} icon={Mail} color="sky" />
                <UsageGauge label="WhatsApp API" used={stats.whatsapp || 0} max={limits.monthlyWhatsapp} icon={PhoneCall} color="emerald" />
            </div>
        </div>
    );
}
