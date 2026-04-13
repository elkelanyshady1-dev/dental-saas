import { CubeIcon, BeakerIcon } from "@heroicons/react/24/outline";

export default function Inventory() {
    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-slate-100">Inventory & Lab</h1>
                <p className="text-slate-400 text-sm">Track supplies and laboratory orders.</p>
            </header>

            <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-12 text-center">
                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6 text-slate-500">
                    <CubeIcon className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-semibold text-slate-200">Supply Management</h2>
                <p className="text-slate-500 max-w-sm mx-auto mt-2">
                    Connect your clinic with dental labs and track consumables in real-time. Component under integration.
                </p>
            </div>
        </div>
    );
}
