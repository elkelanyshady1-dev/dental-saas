/**
 * WorkingHoursEditor.jsx — Weekly working hours configuration (v32.4)
 * Added state replication (Copy/Paste) across days.
 */
import { useState } from "react";

export default function WorkingHoursEditor({ hours = [], onChange }) {
    const [copiedDay, setCopiedDay] = useState(null);

    const toggle = (idx) => {
        const next = [...hours];
        next[idx] = { ...next[idx], isOpen: !next[idx].isOpen };
        onChange(next);
    };

    const setTime = (idx, field, value) => {
        const next = [...hours];
        next[idx] = { ...next[idx], [field]: value };
        onChange(next);
    };

    const handleCopy = (h) => {
        setCopiedDay({ ...h }); // Make a safe clone of the state
    };

    const handlePasteToAll = () => {
        if (!copiedDay) return;
        const next = hours.map((h) => ({
            ...h, // preserve the day name
            isOpen: copiedDay.isOpen,
            open: copiedDay.open,
            close: copiedDay.close,
        }));
        onChange(next);
    };

    const handlePasteToWeekdays = () => {
        if (!copiedDay) return;
        const WEEKEND = ["Friday", "Saturday"]; // E.g., Middle-Eastern weekend, or Saturday/Sunday. Adjusting logic to apply to any day except Fri/Sat for now, but to be robust let's target generic weekdays:
        // By standard we'll just check if it's not Saturday/Sunday
        const STANDARD_WEEKEND = ["Sunday", "Saturday"];
        
        const next = hours.map((h) => {
            if (STANDARD_WEEKEND.includes(h.day)) return h; // Skip weekends
            return {
                ...h,
                isOpen: copiedDay.isOpen,
                open: copiedDay.open,
                close: copiedDay.close,
            };
        });
        onChange(next);
    };

    return (
        <div className="space-y-4">
            {/* Header info / state indicator */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
                    Schedule Layout
                </p>
                {copiedDay && (
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse">
                        <span className="material-symbols-outlined text-[14px]">content_copy</span>
                        Copied: {copiedDay.day}
                    </span>
                )}
            </div>

            <div className="space-y-2">
                {hours.map((h, i) => {
                    const isCopiedSource = copiedDay?.day === h.day;
                    
                    return (
                        <div 
                            key={h.day} 
                            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                                isCopiedSource 
                                    ? "bg-blue-50/50 border-blue-200 ring-1 ring-blue-500/20" 
                                    : "bg-white border-slate-100 hover:border-slate-200"
                            }`}
                        >
                            <label className="flex items-center gap-3 w-32 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={h.isOpen}
                                    onChange={() => toggle(i)}
                                    className="w-4 h-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500/20 transition-all cursor-pointer"
                                />
                                <span className={`text-sm font-bold ${h.isOpen ? "text-slate-800" : "text-slate-400"}`}>
                                    {h.day.slice(0, 3)}
                                </span>
                            </label>
                            
                            <div className="flex-1 flex items-center gap-4">
                                {h.isOpen ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="time" 
                                            value={h.open}
                                            onChange={(e) => setTime(i, "open", e.target.value)}
                                            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-black text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition"
                                        />
                                        <span className="text-slate-300 text-xs font-black uppercase">to</span>
                                        <input
                                            type="time" 
                                            value={h.close}
                                            onChange={(e) => setTime(i, "close", e.target.value)}
                                            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-black text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 px-3 py-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                        <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Closed</span>
                                    </div>
                                )}
                            </div>

                            {/* Row Action */}
                            <button
                                type="button"
                                onClick={() => handleCopy(h)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                                    isCopiedSource
                                        ? "bg-blue-100 text-blue-700 border border-blue-200"
                                        : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-white hover:text-blue-600 hover:border-blue-200 hover:shadow-sm"
                                }`}
                            >
                                <span className="material-symbols-outlined text-[14px]">
                                    {isCopiedSource ? "check" : "content_copy"}
                                </span>
                                {isCopiedSource ? "Copied" : "Copy"}
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Mass Actions */}
            {copiedDay && (
                <div className="flex items-center gap-3 pt-3 mt-4 border-t border-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mr-2">
                        Apply to:
                    </p>
                    <button
                        type="button"
                        onClick={handlePasteToAll}
                        className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-t from-emerald-500 to-emerald-400 text-white rounded-xl shadow-md hover:shadow-lg transition-all active:scale-95 text-xs font-black tracking-tight"
                    >
                        <span className="material-symbols-outlined text-[16px]">done_all</span>
                        All Days
                    </button>
                    <button
                        type="button"
                        onClick={handlePasteToWeekdays}
                        className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-all active:scale-95 text-xs font-black tracking-tight shadow-sm"
                    >
                        <span className="material-symbols-outlined text-[16px]">calendar_view_week</span>
                        Weekdays Only
                    </button>
                </div>
            )}
        </div>
    );
}
