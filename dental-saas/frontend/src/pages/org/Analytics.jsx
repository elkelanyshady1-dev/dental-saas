import { ChartBarIcon, RocketLaunchIcon } from "@heroicons/react/24/outline";

export default function Analytics() {
    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-slate-100">Performance Analytics</h1>
                <p className="text-slate-400 text-sm">Data visualization for growth tracking.</p>
            </header>

            <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-12 text-center">
                <div className="w-16 h-16 bg-sky-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-sky-500">
                    <RocketLaunchIcon className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-semibold text-slate-200">Deep Insights Coming Soon</h2>
                <p className="text-slate-500 max-w-sm mx-auto mt-2">
                    We are building a powerful analytics engine to help you optimize patient retention and clinic throughput.
                </p>
            </div>
        </div>
    );
}
