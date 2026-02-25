import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, Users, Building2, ShieldAlert, MapPin, X } from "lucide-react";
import api from "../../../../services/api";

export default function GlobalSearch() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const navigate = useNavigate();
    const dropdownRef = useRef(null);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.trim().length >= 2) {
                setLoading(true);
                try {
                    const res = await api.get(`/platform/search?q=${encodeURIComponent(query.trim())}`);
                    setResults(res.data.data);
                    setIsOpen(true);
                } catch (error) {
                    console.error("Search failed:", error);
                    setResults(null);
                } finally {
                    setLoading(false);
                }
            } else {
                setResults(null);
                setIsOpen(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (type, item) => {
        setIsOpen(false);
        setQuery("");
        switch (type) {
            case "organization":
                navigate(`/platform/organizations/${item._id}`);
                break;
            case "branch":
                navigate(`/platform/organizations/${item.organizationId}?tab=Branches`);
                break;
            case "user":
                navigate(`/platform/organizations/${item.organizationId}?tab=Users&userId=${item._id}`);
                // Note: could also go to specific user detail if path existed: /platform/organizations/${item.organizationId}/users/${item._id}
                break;
            case "platformUser":
                navigate(`/platform/users/${item._id}`);
                break;
            default:
                break;
        }
    };

    const hasResults = results && (
        results.organizations.length > 0 ||
        results.branches.length > 0 ||
        results.users.length > 0 ||
        results.platformUsers.length > 0
    );

    return (
        <div className="relative" ref={dropdownRef}>
            <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
                    placeholder="Search platform..."
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-800 text-slate-200 rounded-md focus:outline-none placeholder:text-slate-400 transition-colors focus:ring-1 focus:ring-slate-600 border border-transparent focus:border-slate-700"
                />
                {(query || loading) && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        {loading ? (
                            <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                        ) : (
                            <button onClick={() => setQuery("")}>
                                <X className="w-3 h-3 text-slate-400 hover:text-white" />
                            </button>
                        )}
                    </div>
                )}
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 overflow-hidden max-h-[400px] overflow-y-auto custom-scrollbar">
                    {!hasResults ? (
                        <div className="p-4 text-center text-sm text-slate-400">
                            No results found for "{query}"
                        </div>
                    ) : (
                        <div className="py-2">
                            {/* Organizations */}
                            {results.organizations.length > 0 && (
                                <Section label="Organizations" icon={Building2}>
                                    {results.organizations.map(org => (
                                        <ResultItem
                                            key={org._id}
                                            title={org.name}
                                            subtitle={org.slug}
                                            badge={org.subscription?.tier}
                                            onClick={() => handleSelect("organization", org)}
                                        />
                                    ))}
                                </Section>
                            )}

                            {/* Branches */}
                            {results.branches.length > 0 && (
                                <Section label="Branches" icon={MapPin}>
                                    {results.branches.map(branch => (
                                        <ResultItem
                                            key={branch._id}
                                            title={branch.name}
                                            subtitle="Branch"
                                            onClick={() => handleSelect("branch", branch)}
                                        />
                                    ))}
                                </Section>
                            )}

                            {/* Users */}
                            {results.users.length > 0 && (
                                <Section label="Organization Users" icon={Users}>
                                    {results.users.map(u => (
                                        <ResultItem
                                            key={u._id}
                                            title={u.name}
                                            subtitle={u.email}
                                            onClick={() => handleSelect("user", u)}
                                        />
                                    ))}
                                </Section>
                            )}

                            {/* Platform Users */}
                            {results.platformUsers.length > 0 && (
                                <Section label="Platform Staff" icon={ShieldAlert}>
                                    {results.platformUsers.map(pu => (
                                        <ResultItem
                                            key={pu._id}
                                            title={pu.name}
                                            subtitle={`${pu.email} • ${pu.role}`}
                                            onClick={() => handleSelect("platformUser", pu)}
                                        />
                                    ))}
                                </Section>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function Section({ label, icon: Icon, children }) {
    return (
        <div className="mb-2 last:mb-0">
            <div className="px-4 py-1 flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-800/50">
                <Icon className="w-3 h-3" />
                {label}
            </div>
            <div className="mt-1">{children}</div>
        </div>
    );
}

function ResultItem({ title, subtitle, badge, onClick }) {
    return (
        <button
            onClick={onClick}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-slate-800 text-left transition-colors group"
        >
            <div className="min-w-0">
                <div className="text-sm font-medium text-slate-200 group-hover:text-white truncate">
                    {title}
                </div>
                <div className="text-xs text-slate-400 truncate">
                    {subtitle}
                </div>
            </div>
            {badge && (
                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-900/40 text-blue-400 border border-blue-800">
                    {badge}
                </span>
            )}
        </button>
    );
}
