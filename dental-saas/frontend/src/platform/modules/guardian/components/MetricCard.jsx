/**
 * MetricCard.jsx
 * Platform Guardian Dashboard — Single Metric Display Card
 *
 * Props:
 *   title   {string}  — Card label
 *   value   {any}     — Metric value to display
 *   danger  {boolean} — If true, renders red danger state
 *   unit    {string}  — Optional unit suffix (e.g. "MB", "s")
 *   icon    {node}    — Optional React icon node
 */
export function MetricCard({ title, value, danger = false, unit = "", icon }) {
    return (
        <div className={`
            rounded-xl border p-5 flex flex-col gap-2 transition-all duration-200
            ${danger
                ? "bg-red-950/40 border-red-500/40 shadow-red-900/30 shadow-lg"
                : "bg-slate-800/60 border-slate-700/50 shadow-slate-900/20 shadow-md"
            }
        `}>
            <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold uppercase tracking-widest ${danger ? "text-red-400" : "text-slate-400"}`}>
                    {title}
                </span>
                {icon && (
                    <span className={`${danger ? "text-red-400" : "text-slate-500"}`}>
                        {icon}
                    </span>
                )}
            </div>
            <div className="flex items-end gap-1.5 mt-1">
                <span className={`text-3xl font-black tabular-nums ${danger ? "text-red-300" : "text-white"}`}>
                    {value ?? "—"}
                </span>
                {unit && (
                    <span className={`text-sm font-medium mb-0.5 ${danger ? "text-red-400" : "text-slate-500"}`}>
                        {unit}
                    </span>
                )}
            </div>
            {danger && (
                <div className="flex items-center gap-1.5 mt-1">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Action Required</span>
                </div>
            )}
        </div>
    );
}
