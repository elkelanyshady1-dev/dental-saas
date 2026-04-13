/**
 * BulkActionBar.jsx — Floating Bulk Action Bar v1.0
 *
 * Appears at the bottom of the screen when any patients are selected.
 * Actions: Tag · Remove Tag · Assign Doctor · Export · Send WhatsApp · Clear
 *
 * Props:
 *   selectedIds   string[]
 *   onClear       () => void
 *   onAction      (action, payload) => Promise<void>
 */
import { useState } from "react";

const PRESET_TAGS = ["orthodontics", "implant", "vip", "insurance", "aligners", "family plan", "recall"];

export default function BulkActionBar({ selectedIds, onClear, onAction }) {
    const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
    const [customTag, setCustomTag] = useState("");
    const [loading, setLoading] = useState(null); // action key

    if (selectedIds.length === 0) return null;

    const act = async (action, payload) => {
        setLoading(action);
        try {
            await onAction(action, payload);
        } finally {
            setLoading(null);
            setTagDropdownOpen(false);
            setCustomTag("");
        }
    };

    const Btn = ({ id, children, onClick, color = "slate" }) => {
        const colors = {
            blue: "bg-blue-600 hover:bg-blue-700 text-white border-blue-700 shadow-blue-500/20",
            violet: "bg-violet-600 hover:bg-violet-700 text-white border-violet-700 shadow-violet-500/20",
            emerald: "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-emerald-500/20",
            amber: "bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-amber-500/20",
            slate: "bg-white hover:bg-slate-50 text-slate-700 border-slate-200",
            red: "bg-red-500 hover:bg-red-600 text-white border-red-600",
        };
        return (
            <button
                onClick={onClick}
                disabled={loading === id}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border shadow-sm transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5 ${colors[color]}`}
            >
                {loading === id ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> : null}
                {children}
            </button>
        );
    };

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
            <div className="pointer-events-auto bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-200">

                {/* Selection badge */}
                <div className="flex items-center gap-2 pr-3 border-r border-slate-700">
                    <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center text-white text-[11px] font-black">
                        {selectedIds.length}
                    </div>
                    <span className="text-xs font-bold text-slate-300">selected</span>
                </div>

                {/* Tag action with dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setTagDropdownOpen(v => !v)}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition-all"
                    >
                        🏷️ Add Tag
                        <svg className={`w-3 h-3 transition-transform ${tagDropdownOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {tagDropdownOpen && (
                        <div className="absolute bottom-full mb-2 left-0 bg-white rounded-2xl border border-slate-100 shadow-2xl p-3 w-52 space-y-1">
                            <div className="flex gap-1 mb-2">
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Custom tag…"
                                    value={customTag}
                                    onChange={e => setCustomTag(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter" && customTag.trim()) act("tag", { tag: customTag.trim() }); }}
                                    className="flex-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                                <button
                                    onClick={() => customTag.trim() && act("tag", { tag: customTag.trim() })}
                                    className="px-2 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                                >
                                    +
                                </button>
                            </div>
                            {PRESET_TAGS.map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => act("tag", { tag })}
                                    className="w-full text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-50 text-slate-700 capitalize transition-colors"
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Export */}
                <Btn id="export" color="slate" onClick={() => act("export", {})}>
                    📤 Export
                </Btn>

                {/* WhatsApp — opens CSV-style broadcast (frontend only) */}
                <Btn id="whatsapp" color="emerald" onClick={() => act("whatsapp", {})}>
                    💬 WhatsApp
                </Btn>

                {/* Divider */}
                <div className="w-px h-5 bg-slate-700" />

                {/* Clear */}
                <button
                    onClick={onClear}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all flex items-center gap-1"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear
                </button>
            </div>
        </div>
    );
}
