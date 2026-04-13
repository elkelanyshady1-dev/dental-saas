/**
 * GlobalSearchBar.jsx
 * Platform — Unified Entity Search  (v2.0)
 *
 * Replaces the decorative search input in TopCommandBar.
 * Debounces keystrokes, calls GET /api/platform/search?q=,
 * renders a floating results dropdown grouped by entity type.
 *
 * v2.0 changes:
 *   - Full keyboard navigation (↑ ↓ Enter Escape)
 *   - Correct invoice navigation: goes to billing/invoices?open=<id>
 *     so PlatformInvoicesPage can auto-open the detail modal
 *   - "platform-staff" route for platform users
 *   - Secondary label line per item (country, email, status…)
 *   - Result count per section
 *   - Highlighted query match in result labels
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Loader2, Building2, Users, FileText, CreditCard } from "lucide-react";
import { createPortal } from "react-dom";
import platformApi from "../../auth/platformApi";

// ── Debounce helper ───────────────────────────────────────────────────────────
function useDebounce(value, delay) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

// ── Entity navigation map ─────────────────────────────────────────────────────
// Each function receives the result item and returns a React Router path string.
const ENTITY_NAV = {
    // Full detail page (registered in platformFeatureRegistry as organizations/:id)
    organizations: (item) => `/platform/organizations/${item._id}`,

    // Platform staff detail page
    users: (item) => `/platform/users/${item._id}`,

    // Contract goes to the subscription detail for that org
    contracts: (item) => `/platform/subscriptions/${item.organizationId}`,

    // No dedicated invoice detail route — navigate to invoice list and pass ?open=<id>
    // PlatformInvoicesPage reads this param on mount and auto-opens the detail modal.
    invoices: (item) => `/platform/billing/invoices?open=${item._id}`,
};

// ── Section display metadata ──────────────────────────────────────────────────
const SECTION_META = {
    organizations: { label: "Organizations", icon: Building2, color: "text-indigo-600" },
    users: { label: "Platform Users", icon: Users, color: "text-violet-600" },
    contracts: { label: "Contracts", icon: FileText, color: "text-blue-600" },
    invoices: { label: "Invoices", icon: CreditCard, color: "text-emerald-600" },
};

// ── Per-item label + secondary line ──────────────────────────────────────────
function getItemLabel(type, item) {
    switch (type) {
        case "organizations": return item.name || item.slug || String(item._id).slice(-8);
        case "users": return item.name || item.email || String(item._id).slice(-8);
        case "contracts": return item.planCode
            ? `${item.planCode} · ${item.contractStatus || ""}`
            : String(item._id).slice(-8);
        case "invoices": return item.invoiceNumber
            ? `${item.invoiceNumber}`
            : String(item._id).slice(-8);
        default: return String(item._id);
    }
}

function getItemSub(type, item) {
    switch (type) {
        case "organizations": return item.billingCountry || item.regionCode || null;
        case "users": return item.email || null;
        case "contracts": return item.organizationId ? `Org: ${String(item.organizationId).slice(-8)}` : null;
        case "invoices": {
            const parts = [];
            if (item.status) parts.push(item.status.toUpperCase());
            if (item.totalAmount != null) parts.push(`${item.currency || "USD"} ${Number(item.totalAmount).toFixed(2)}`);
            return parts.join(" · ") || null;
        }
        default: return null;
    }
}

// ── Highlight matched query text ──────────────────────────────────────────────
function Highlight({ text, query }) {
    if (!query || !text) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return (
        <>
            {text.slice(0, idx)}
            <mark className="bg-yellow-100 text-yellow-900 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
            {text.slice(idx + query.length)}
        </>
    );
}

// ── Flatten results into a linear list for keyboard navigation ────────────────
function flattenResults(results) {
    const flat = [];
    for (const [type, items] of Object.entries(results)) {
        if (!items?.length) continue;
        for (const item of items) {
            flat.push({ type, item });
        }
    }
    return flat;
}

// ── Dropdown ──────────────────────────────────────────────────────────────────
function SearchDropdown({ results, query, onSelect, anchorRef, activeIndex, setActiveIndex, flat }) {
    const sections = Object.entries(results).filter(([, items]) => items?.length > 0);
    const isEmpty = sections.length === 0;

    if (!anchorRef.current) return null;
    const rect = anchorRef.current.getBoundingClientRect();

    const style = {
        position: "fixed",
        top: rect.bottom + 6,
        left: rect.left,
        width: Math.max(rect.width, 420),
        zIndex: 9999,
    };

    // Track current flat index per item for keyboard highlighting
    let globalIdx = 0;

    return createPortal(
        <div style={style}>
            <div
                className="rounded-xl border shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-border-default)" }}
            >
                {isEmpty ? (
                    <div className="px-4 py-5 text-center text-sm text-slate-400">
                        No results for <strong>"{query}"</strong>
                    </div>
                ) : (
                    <div className="divide-y" style={{ borderColor: "var(--color-border-default)" }}>
                        {sections.map(([type, items]) => {
                            const meta = SECTION_META[type];
                            const Icon = meta?.icon || FileText;
                            return (
                                <div key={type} className="py-1">
                                    {/* Section header */}
                                    <div className={`flex items-center justify-between px-4 py-1.5`}>
                                        <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${meta?.color || "text-slate-500"}`}>
                                            <Icon className="w-3 h-3" />
                                            {meta?.label || type}
                                        </div>
                                        <span className="text-[9px] text-slate-400 font-medium">{items.length}</span>
                                    </div>

                                    {/* Items */}
                                    {items.map(item => {
                                        const thisIdx = globalIdx++;
                                        const isActive = activeIndex === thisIdx;
                                        const label = getItemLabel(type, item);
                                        const sub = getItemSub(type, item);

                                        return (
                                            <button
                                                key={item._id}
                                                id={`search-result-${thisIdx}`}
                                                onClick={() => onSelect(type, item)}
                                                onMouseEnter={() => setActiveIndex(thisIdx)}
                                                className={`w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm transition-colors cursor-pointer ${isActive
                                                        ? "bg-indigo-50 text-indigo-900"
                                                        : ""
                                                    }`}
                                                style={!isActive ? { color: "var(--color-text-primary)" } : {}}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium truncate">
                                                        <Highlight text={label} query={query} />
                                                    </div>
                                                    {sub && (
                                                        <div className="text-[11px] text-slate-400 font-medium mt-0.5 truncate">{sub}</div>
                                                    )}
                                                </div>
                                                {isActive && (
                                                    <span className="text-[9px] text-indigo-400 font-black uppercase tracking-widest flex-shrink-0">
                                                        Enter ↵
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Footer */}
                <div
                    className="px-4 py-2 text-[10px] text-slate-400 border-t flex items-center justify-between"
                    style={{ borderColor: "var(--color-border-default)", background: "var(--color-surface-soft)" }}
                >
                    <span>{flat.length} results</span>
                    <span className="flex items-center gap-2">
                        <kbd className="px-1 py-0.5 bg-slate-100 rounded text-[9px] font-mono border border-slate-200">↑↓</kbd>
                        navigate
                        <kbd className="px-1 py-0.5 bg-slate-100 rounded text-[9px] font-mono border border-slate-200">Enter</kbd>
                        open
                        <kbd className="px-1 py-0.5 bg-slate-100 rounded text-[9px] font-mono border border-slate-200">Esc</kbd>
                        close
                    </span>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function GlobalSearchBar() {
    const navigate = useNavigate();
    const inputRef = useRef(null);
    const wrapRef = useRef(null);

    const [query, setQuery] = useState("");
    const [results, setResults] = useState(null);   // null = not searched yet
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);  // keyboard cursor

    const debouncedQuery = useDebounce(query, 280);

    // Flatten results for keyboard navigation
    const flat = results ? flattenResults(results) : [];

    // ── Fetch results ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!debouncedQuery || debouncedQuery.length < 2) {
            setResults(null);
            setOpen(false);
            setActiveIndex(-1);
            return;
        }
        let cancelled = false;
        setLoading(true);
        platformApi
            .get(`/search?q=${encodeURIComponent(debouncedQuery)}`)
            .then(res => {
                if (!cancelled) {
                    setResults(res.data?.data || {});
                    setOpen(true);
                    setActiveIndex(-1);
                }
            })
            .catch(() => { if (!cancelled) setResults({}); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [debouncedQuery]);

    // ── Outside click + keyboard handlers ────────────────────────────────────
    useEffect(() => {
        const handleKey = (e) => {
            if (!open) return;

            if (e.key === "Escape") {
                setOpen(false);
                setQuery("");
                setActiveIndex(-1);
                return;
            }

            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex(prev => Math.min(prev + 1, flat.length - 1));
                return;
            }

            if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex(prev => Math.max(prev - 1, 0));
                return;
            }

            if (e.key === "Enter" && activeIndex >= 0 && flat[activeIndex]) {
                e.preventDefault();
                const { type, item } = flat[activeIndex];
                handleSelect(type, item);
                return;
            }
        };

        const handleClick = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) {
                setOpen(false);
            }
        };

        document.addEventListener("keydown", handleKey);
        document.addEventListener("mousedown", handleClick);
        return () => {
            document.removeEventListener("keydown", handleKey);
            document.removeEventListener("mousedown", handleClick);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, activeIndex, flat]);

    // Scroll active item into view
    useEffect(() => {
        if (activeIndex >= 0) {
            document.getElementById(`search-result-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
        }
    }, [activeIndex]);

    // ── Selection handler ─────────────────────────────────────────────────────
    const handleSelect = useCallback((type, item) => {
        const navFn = ENTITY_NAV[type];
        setOpen(false);
        setQuery("");
        setResults(null);
        setActiveIndex(-1);
        if (navFn) {
            navigate(navFn(item));
        }
    }, [navigate]);

    const clearSearch = () => {
        setQuery("");
        setResults(null);
        setOpen(false);
        setActiveIndex(-1);
        inputRef.current?.focus();
    };

    return (
        <div ref={wrapRef} className="flex items-center gap-2 relative" id="global-search">
            {loading ? (
                <Loader2 className="w-4 h-4 text-slate-400 animate-spin flex-shrink-0" />
            ) : (
                <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            )}
            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setActiveIndex(-1); }}
                onFocus={() => {
                    if (results && Object.values(results).some(v => v?.length > 0)) setOpen(true);
                }}
                placeholder="Search Platform Entities..."
                aria-label="Search platform entities"
                aria-autocomplete="list"
                aria-expanded={open}
                id="platform-global-search-input"
                className="bg-transparent border-none focus:ring-0 text-sm placeholder:text-slate-400 w-64 outline-none text-slate-700"
            />
            {query && (
                <button onClick={clearSearch} className="text-slate-300 hover:text-slate-500 transition-colors" aria-label="Clear search">
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
            {open && results && (
                <SearchDropdown
                    results={results}
                    query={debouncedQuery}
                    onSelect={handleSelect}
                    anchorRef={wrapRef}
                    activeIndex={activeIndex}
                    setActiveIndex={setActiveIndex}
                    flat={flat}
                />
            )}
        </div>
    );
}
