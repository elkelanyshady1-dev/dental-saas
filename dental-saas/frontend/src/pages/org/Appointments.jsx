import { ClipboardDocumentListIcon, FunnelIcon } from "@heroicons/react/24/outline";

export default function Appointments() {
    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Appointments</h1>
                    <p className="text-slate-400 text-sm">List view and confirmation pipeline.</p>
                </div>
                <button className="bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl px-4 py-2 border border-slate-700 transition-all flex items-center gap-2 text-sm font-semibold">
                    <FunnelIcon className="w-4 h-4" />
                    Filters
                </button>
            </header>

            <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-12 text-center shadow-xl">
                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6 text-slate-500">
                    <ClipboardDocumentListIcon className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-semibold text-slate-200">History & Queue</h2>
                <p className="text-slate-500 max-w-sm mx-auto mt-2">
                    Viewing all historical and upcoming appointments in a unified list. Refresh to sync with the calendar.
                </p>
            </div>
        </div>
    );
}
