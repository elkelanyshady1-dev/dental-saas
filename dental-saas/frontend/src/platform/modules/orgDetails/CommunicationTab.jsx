import { useSearchParams } from "react-router-dom";
import { useOrgCommunication } from "../../hooks/useOrgCommunication";
import { Spinner } from "../../utils/components/Spinner";
import { Mail, MessageSquare, PhoneCall, AlertCircle, ArrowUpRight } from "lucide-react";

export default function CommunicationTab({ orgId }) {
    const { data: comms, loading, error } = useOrgCommunication(orgId);
    const [, setSearchParams] = useSearchParams();

    if (loading) return <Spinner />;
    if (error) return <div className="p-4 text-danger-text bg-danger-bg rounded-card border border-danger-border text-sm font-medium">{error}</div>;
    if (!comms) return <div className="p-6 text-slate-500 font-medium">No communication metrics found.</div>;

    const navigateToAddons = () => setSearchParams({ tab: "Add-ons" });

    const Gauge = ({ label, used, cap, icon: Icon, color }) => {
        const percentage = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
        const remaining = Math.max((cap || 0) - (used || 0), 0);
        const isCritical = percentage > 90;

        return (
            <div className={`p-8 rounded-3xl border transition-all hover:shadow-md ${isCritical ? 'bg-red-50/50 border-red-100' : 'bg-bg-card border-brand-border'} shadow-card relative overflow-hidden group`}>
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl bg-${color}-50 text-${color}-600 group-hover:scale-110 transition-transform`}>
                            <Icon className="w-6 h-6" />
                        </div>
                        <div>
                            <h4 className="text-lg font-black text-slate-900 tracking-tight">{label}</h4>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Monthly Consumption</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="flex justify-between items-end">
                        <div>
                            <span className="text-4xl font-black text-slate-900 tracking-tight">{used.toLocaleString()}</span>
                            <span className="text-xs text-slate-400 font-bold ml-2 uppercase tracking-tighter">/ {cap.toLocaleString()} CAP</span>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Remaining</p>
                            <p className={`text-sm font-black ${isCritical ? 'text-red-600' : 'text-slate-900'}`}>{remaining.toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="h-4 bg-slate-100 rounded-full overflow-hidden p-1 shadow-inner">
                        <div
                            className={`h-full rounded-full transition-all duration-1000 ${isCritical ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]' : `bg-${color}-500 shadow-[0_0_12px_rgba(var(--${color}-rgb),0.3)]`}`}
                            style={{ width: `${percentage}%` }}
                        />
                    </div>

                    <div className="flex justify-between text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        <span>Utilization</span>
                        <span className={isCritical ? 'text-red-600 animate-pulse' : `text-${color}-600`}>{Math.round(percentage)}%</span>
                    </div>
                </div>

                {isCritical && (
                    <div className="mt-8 pt-6 border-t border-red-100 flex items-center gap-2 text-red-600 font-black text-[10px] uppercase tracking-widest animate-in slide-in-from-bottom-2">
                        <AlertCircle className="w-4 h-4" />
                        CAP LIMIT REACHED — SERVICE INTERRUPTION RISK
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-bg-card p-8 border border-brand-border rounded-card shadow-card">
                <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Communication Gateway</h3>
                    <p className="text-sm text-slate-500 font-medium mt-1">Managed SMS, Email, and WhatsApp transmission throughput.</p>
                </div>
                <button
                    onClick={navigateToAddons}
                    className="flex items-center gap-2 px-6 py-3 bg-bg-dark text-white text-xs font-black uppercase tracking-widest rounded-btn hover:bg-sidebar-hover transition-all shadow-xl active:scale-95 group"
                >
                    Provision Capacity
                    <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Gauge label="Email Delivery" used={comms.emailUsed || 0} cap={comms.emailCap || 5000} icon={Mail} color="blue" />
                <Gauge label="SMS Gateway" used={comms.smsUsed || 0} cap={comms.smsCap || 500} icon={MessageSquare} color="amber" />
                <Gauge label="WhatsApp API" used={comms.whatsappUsed || 0} cap={comms.whatsappCap || 250} icon={PhoneCall} color="emerald" />
            </div>

            {/* Capacity Suggestion UI */}
            <div className="bg-brand-primary-lt border border-brand-border rounded-card p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-bg-card rounded-2xl flex items-center justify-center shadow-card border border-brand-border">
                        <ArrowUpRight className="w-8 h-8 text-brand-primary" />
                    </div>
                    <div>
                        <h4 className="text-lg font-black text-blue-900 tracking-tight">Need More Throughput?</h4>
                        <p className="text-sm text-brand-primary font-medium">You can add high-volume bundles or priority gateway access through the Add-ons registry.</p>
                    </div>
                </div>
                <button
                    onClick={navigateToAddons}
                    className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-brand-primary border border-brand-border bg-bg-card rounded-btn hover:bg-brand-primary-lt transition-all active:scale-95"
                >
                    View Add-ons
                </button>
            </div>
        </div>
    );
}
