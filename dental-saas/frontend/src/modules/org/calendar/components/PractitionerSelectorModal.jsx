/**
 * PractitionerSelectorModal.jsx — Clinical Practitioner Filter Modal
 *
 * Glassmorphism overlay that replaces the old dropdown for filtering
 * the calendar by one or more practitioners.
 *
 * Props:
 *   practitioners []  — array of { _id, name, specialty, avatarUrl, status }
 *   selectedIds   Set<string>  — currently selected practitioner IDs
 *   onApply       (ids: string[]) => void
 *   onClose       () => void
 *   onViewDossier (practitioner) => void  — opens the dossier drawer
 *
 * Design: "Clinical Curator" — glassmorphism, Manrope/Inter, surface tokens
 *
 * @module modules/org/calendar/components/PractitionerSelectorModal
 */
import { useState, useMemo } from "react";

// Status badge config
const STATUS_CONFIG = {
    active:    { dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700",  label: "In Clinic"  },
    available: { dot: "bg-blue-500",    badge: "bg-blue-50 text-blue-700",        label: "Available"  },
    away:      { dot: "bg-[#c3c6d7]",  badge: "bg-[#f2f4f6] text-[#737686]",    label: "Away"       },
    on_leave:  { dot: "bg-amber-400",  badge: "bg-amber-50 text-amber-700",       label: "On Leave"   },
};

function getStatusConfig(status) {
    return STATUS_CONFIG[status] || STATUS_CONFIG.available;
}

export default function PractitionerSelectorModal({
    practitioners = [],
    selectedIds,
    onApply,
    onClose,
    onViewDossier,
}) {
    const [search,  setSearch]   = useState("");
    const [checked, setChecked]  = useState(new Set(selectedIds || []));

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return practitioners;
        return practitioners.filter(p =>
            p.name?.toLowerCase().includes(q) ||
            p.specialty?.toLowerCase().includes(q)
        );
    }, [practitioners, search]);

    function toggle(id) {
        setChecked(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    function selectAll()  { setChecked(new Set(practitioners.map(p => p._id))); }
    function clearAll()   { setChecked(new Set()); }

    function applyAndClose() {
        onApply([...checked]);
        onClose();
    }

    const selectedCount = checked.size;

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(25,28,30,0.12)", backdropFilter: "blur(6px)" }}
        >
            {/* Click-outside dismiss */}
            <div className="absolute inset-0" onClick={onClose} aria-hidden />

            {/* Modal panel */}
            <section
                className="relative w-full max-w-[480px] rounded-2xl overflow-hidden flex flex-col max-h-[88vh]"
                style={{
                    background: "rgba(255,255,255,0.88)",
                    backdropFilter: "blur(24px)",
                    boxShadow: "0 24px 64px -8px rgba(25,28,30,0.18), 0 0 0 1px rgba(195,198,215,0.18)",
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <header className="px-7 py-5 flex items-center justify-between border-b border-[#c3c6d7]/15 bg-white/60">
                    <div>
                        <h2 className="font-headline font-extrabold text-[#191c1e] text-lg leading-tight">
                            Select Practitioners
                        </h2>
                        <p className="text-xs text-[#737686] mt-0.5 font-medium">
                            Filter the calendar view by specialist
                        </p>
                    </div>
                    <button
                        id="practitioner-modal-close"
                        onClick={onClose}
                        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#eceef0] transition-colors text-[#737686]"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </header>

                {/* Search + Utilities */}
                <div className="px-7 pt-5 pb-4 bg-[#f7f9fb]/80">
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#737686] text-xl pointer-events-none">
                            search
                        </span>
                        <input
                            id="practitioner-search"
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search by name or specialty…"
                            autoFocus
                            className="w-full pl-11 pr-4 py-3 bg-white rounded-xl border border-[#c3c6d7]/20 text-sm text-[#191c1e] placeholder:text-[#c3c6d7] focus:outline-none focus:ring-2 focus:ring-[#004ac6]/20 shadow-sm font-medium transition-all"
                        />
                    </div>

                    <div className="flex items-center justify-between mt-4 px-0.5">
                        <span className="text-[10px] font-black text-[#737686] uppercase tracking-widest">
                            Practitioners ({filtered.length})
                            {selectedCount > 0 && (
                                <span className="ml-2 px-1.5 py-0.5 bg-[#004ac6]/10 text-[#004ac6] rounded font-black">
                                    {selectedCount} selected
                                </span>
                            )}
                        </span>
                        <div className="flex gap-4">
                            <button
                                id="practitioner-select-all"
                                onClick={selectAll}
                                className="text-[11px] font-bold text-[#004ac6] hover:opacity-70 transition-opacity"
                            >
                                Select All
                            </button>
                            <button
                                id="practitioner-clear-all"
                                onClick={clearAll}
                                className="text-[11px] font-bold text-[#737686] hover:text-[#191c1e] transition-colors"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                </div>

                {/* Scrollable List */}
                <div className="flex-1 overflow-y-auto px-4 py-2 bg-[#f7f9fb]/60 space-y-1.5"
                    style={{ scrollbarWidth: "thin", scrollbarColor: "#e0e3e5 transparent" }}
                >
                    {filtered.length === 0 && (
                        <div className="flex flex-col items-center py-12 text-center">
                            <span className="material-symbols-outlined text-[#c3c6d7] text-4xl mb-2">person_search</span>
                            <p className="text-sm font-bold text-[#737686]">No practitioners found</p>
                        </div>
                    )}

                    {filtered.map(doc => {
                        const isChecked = checked.has(doc._id);
                        const sc = getStatusConfig(doc.status);
                        return (
                            <div
                                key={doc._id}
                                id={`practitioner-row-${doc._id}`}
                                onClick={() => toggle(doc._id)}
                                className={`flex items-center gap-4 p-3.5 rounded-xl cursor-pointer group transition-all duration-150
                                    ${isChecked
                                        ? "bg-white shadow-[0_2px_12px_-2px_rgba(0,74,198,0.10)] border border-[#004ac6]/10"
                                        : "bg-white/70 hover:bg-white border border-transparent hover:border-[#c3c6d7]/15 hover:shadow-sm"
                                    }`}
                            >
                                {/* Avatar */}
                                <div className="relative flex-shrink-0">
                                    <div className={`w-11 h-11 rounded-full overflow-hidden ring-2 ${isChecked ? "ring-[#004ac6]/30" : "ring-[#c3c6d7]/20"} bg-[#f2f4f6] flex items-center justify-center`}>
                                        {doc.avatarUrl
                                            ? <img src={doc.avatarUrl} alt={doc.name} className="w-full h-full object-cover" />
                                            : <span className="text-sm font-extrabold text-[#004ac6]">{doc.name?.[0]}</span>
                                        }
                                    </div>
                                    <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${sc.dot}`} />
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-[#191c1e] truncate">Dr. {doc.name}</p>
                                    <p className="text-[10px] text-[#737686] font-medium truncate">{doc.specialty || "Practitioner"}</p>
                                </div>

                                {/* Status + View + Checkbox */}
                                <div className="flex items-center gap-2.5 flex-shrink-0">
                                    <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wide rounded-full ${sc.badge}`}>
                                        {sc.label}
                                    </span>

                                    {/* View dossier link */}
                                    <button
                                        id={`view-dossier-${doc._id}`}
                                        onClick={e => { e.stopPropagation(); onViewDossier && onViewDossier(doc); }}
                                        title="View practitioner dossier"
                                        className="w-7 h-7 flex items-center justify-center rounded-lg text-[#737686] hover:text-[#004ac6] hover:bg-[#004ac6]/5 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <span className="material-symbols-outlined text-base">open_in_new</span>
                                    </button>

                                    {/* Checkbox */}
                                    <div
                                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150
                                            ${isChecked
                                                ? "bg-[#004ac6] border-[#004ac6]"
                                                : "border-[#c3c6d7] bg-transparent group-hover:border-[#004ac6]/40"
                                            }`}
                                    >
                                        {isChecked && (
                                            <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'wght' 700" }}>
                                                check
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <footer className="px-7 py-5 bg-white/80 border-t border-[#c3c6d7]/15">
                    <button
                        id="practitioner-apply-btn"
                        onClick={applyAndClose}
                        className="w-full py-3.5 rounded-xl bg-[#004ac6] text-white font-headline font-bold text-sm shadow-lg shadow-[#004ac6]/20 hover:bg-[#003ea8] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        {selectedCount === 0
                            ? "Show All Practitioners"
                            : `Apply ${selectedCount} Practitioner${selectedCount !== 1 ? "s" : ""}`
                        }
                        <span className="material-symbols-outlined text-xl">keyboard_arrow_right</span>
                    </button>
                </footer>
            </section>
        </div>
    );
}
