import { CurrencyDollarIcon, ArrowUpIcon, ArrowDownIcon } from "@heroicons/react/24/outline";

export default function Finance() {
    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-slate-100">Financial Insights</h1>
                <p className="text-slate-400 text-sm">Revenue tracking and billing management.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { label: "Net Revenue", value: "$42,400", trend: "+12%", icon: CurrencyDollarIcon, color: "text-emerald-400" },
                    { label: "Outstanding", value: "$8,200", trend: "-5%", icon: ArrowUpIcon, color: "text-red-400" },
                    { label: "Expenses", value: "$14,500", trend: "+8%", icon: ArrowDownIcon, color: "text-blue-400" },
                ].map((stat, i) => (
                    <div key={i} className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6 shadow-xl">
                        <div className="flex items-center justify-between mb-4">
                            <stat.icon className={`w-6 h-6 ${stat.color}`} />
                            <span className={`text-xs font-bold ${stat.trend.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}`}>{stat.trend}</span>
                        </div>
                        <p className="text-2xl font-black text-slate-100">{stat.value}</p>
                        <p className="text-xs font-semibold text-slate-400 mt-1">{stat.label}</p>
                    </div>
                ))}
            </div>

            <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-12 text-center">
                <h2 className="text-xl font-semibold text-slate-200">Financial Reports</h2>
                <p className="text-slate-500 max-w-sm mx-auto mt-2">
                    Detailed financial logging and invoice tracking is being initialized for this billing cycle.
                </p>
            </div>
        </div>
    );
}
