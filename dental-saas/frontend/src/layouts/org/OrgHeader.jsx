/**
 * OrgHeader (Design System v4.0 — Light Theme)
 *
 * Layout: Sticky top bar with glass effect.
 * LEFT:   Search input + Branch selector pill
 * RIGHT:  Notifications + User avatar
 *
 * ALL existing search / branch-switching / notification / auth logic is FULLY PRESERVED.
 * Only the visual layer is changed to match the new light design system.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    Bars3Icon,
    MagnifyingGlassIcon,
    BellIcon,
    MapPinIcon,
    ChevronDownIcon,
    CheckIcon,
    BuildingOffice2Icon,
    UserCircleIcon,
    ArrowRightOnRectangleIcon,
    Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/context/AuthContext";
import { useBranch } from "@/context/BranchContext";
import { useOrgBranding } from "@/context/OrgBrandingContext";
import { useOrganizationTime } from "@/context/OrgTimeContext";
import api from "@/services/api";
import NotificationDropdown, { NotificationBell } from "@/modules/notificationDomain/components/NotificationDropdown";
import { useOrgNotifications } from "@/modules/notificationDomain/hooks/useOrgNotifications";
import { useTranslation } from "react-i18next";

// ─ Live Clock ───────────────────────────────────────────────────────────────────
function LiveClock() {
    const { currentTime, currentDateShort } = useOrganizationTime() || {};
    if (!currentTime) return null;
    return (
        <div className="hidden md:flex flex-col items-start leading-tight select-none">
            <span className="text-sm font-bold text-slate-800 tabular-nums tracking-tight">
                {currentTime}
            </span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {currentDateShort}
            </span>
        </div>
    );
}

export default function OrgHeader({ onMenuClick }) {
    const { logout, user } = useAuth();
    const { orgName, logoUrl, defaultLanguage, updateLanguage } = useOrgBranding();
    const navigate  = useNavigate();
    const { i18n }  = useTranslation();

    // ── Search ────────────────────────────────────────────────────────────
    const [searchQuery,   setSearchQuery]   = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching,   setIsSearching]   = useState(false);
    const [showResults,   setShowResults]   = useState(false);
    const searchRef   = useRef(null);
    const searchInput = useRef(null);
    const debounceRef = useRef(null);

    // ⌘K focuses search
    useEffect(() => {
        const onCmdK = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                searchInput.current?.focus();
            }
        };
        window.addEventListener("keydown", onCmdK);
        return () => window.removeEventListener("keydown", onCmdK);
    }, []);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (searchQuery.trim().length < 2) { setSearchResults([]); setShowResults(false); return; }
        debounceRef.current = setTimeout(async () => {
            setIsSearching(true);
            try {
                const res  = await api.get("/org/command/search", { params: { q: searchQuery } });
                const data = Array.isArray(res) ? res : res.data || res;
                setSearchResults(data?.patients || []);
                setShowResults(true);
            } catch { /* silent */ } finally { setIsSearching(false); }
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [searchQuery]);

    // ── Branch Context ────────────────────────────────────────────────────
    const { branches, activeBranch, setActiveBranchId } = useBranch();
    const [showBranchDropdown, setShowBranchDropdown] = useState(false);
    const branchRef = useRef(null);

    const handleSwitchBranch = async (branch) => {
        const success = await setActiveBranchId(branch._id);
        if (success) setShowBranchDropdown(false);
    };

    // ── Notifications ─────────────────────────────────────────────────────
    const {
        notifications, unreadCount, loading,
        onDropdownOpen, markAsRead, markAllRead, removeNotification,
    } = useOrgNotifications();
    const [showNotifications, setShowNotifications] = useState(false);
    const notifBellRef  = useRef(null);
    const notifPanelRef = useRef(null);

    const toggleNotifications = useCallback(() => {
        setShowNotifications(prev => !prev);
        setShowProfile(false);
    }, []);

    // ── Profile ───────────────────────────────────────────────────────────
    const [showProfile, setShowProfile] = useState(false);
    const profileRef = useRef(null);

    // ── Outside click / ESC ───────────────────────────────────────────────
    useEffect(() => {
        const onClick = (e) => {
            if (searchRef.current   && !searchRef.current.contains(e.target))   setShowResults(false);
            if (notifBellRef.current && !notifBellRef.current.contains(e.target) &&
                notifPanelRef.current && !notifPanelRef.current.contains(e.target))
                setShowNotifications(false);
            if (profileRef.current  && !profileRef.current.contains(e.target))  setShowProfile(false);
            if (branchRef.current   && !branchRef.current.contains(e.target))   setShowBranchDropdown(false);
        };
        const onKey = (e) => {
            if (e.key === "Escape") {
                setShowResults(false); setShowNotifications(false);
                setShowProfile(false); setShowBranchDropdown(false);
            }
        };
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onClick);
            document.removeEventListener("keydown", onKey);
        };
    }, []);

    const displayName = user?.firstName || user?.name?.split(" ")[0] || "User";
    const avatarInitial = (displayName[0] || "U").toUpperCase();

    return (
        <header className="
            flex justify-between items-center px-6 py-4 w-full
            border-b border-slate-100 bg-white/80 backdrop-blur-xl
            sticky top-0 z-50 shadow-[0px_1px_24px_rgba(77,68,227,0.06)]
        ">
            {/* ── LEFT: Mobile toggle + Search + Clock + Branch ─── */}
            <div className="flex items-center gap-4">

                {/* Mobile hamburger */}
                <button
                    onClick={onMenuClick}
                    className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
                >
                    <Bars3Icon className="w-5 h-5" />
                </button>

                {/* Search */}
                <div className="relative hidden sm:block" ref={searchRef}>
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <MagnifyingGlassIcon className={`w-4 h-4 transition-colors ${isSearching ? "text-indigo-400" : "text-slate-400"}`} />
                    </span>
                    <input
                        ref={searchInput}
                        type="search"
                        placeholder="Search patient or record…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
                        className="
                            pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm w-64
                            focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all
                            text-slate-800 placeholder:text-slate-400
                        "
                    />
                    {/* -- Search Results -- */}
                    {showResults && searchResults.length > 0 && (
                        <div className="absolute top-full mt-2 w-full bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden z-[200] py-1">
                            {searchResults.map(p => (
                                <button
                                    key={p._id}
                                    onClick={() => { navigate(`/org/patients/${p._id}`); setSearchQuery(""); setShowResults(false); }}
                                    className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 text-left"
                                >
                                    <span className="text-sm text-slate-800">{p.displayName || "Unknown"}</span>
                                    <span className="text-[10px] text-slate-400 font-mono">{p.patientCode}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    {showResults && searchResults.length === 0 && !isSearching && searchQuery.length >= 2 && (
                        <div className="absolute top-full mt-2 w-full bg-white border border-slate-100 rounded-2xl shadow-xl z-[200] p-4 text-center text-sm text-slate-400 italic">
                            No results for "{searchQuery}"
                        </div>
                    )}
                </div>

                {/* Live Clock */}
                <LiveClock />

                {/* Branch Selector Pill */}
                <div className="relative" ref={branchRef}>
                    <button
                        onClick={() => setShowBranchDropdown(prev => !prev)}
                        className="flex items-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-full border border-slate-200 transition-all gap-1.5"
                    >
                        <MapPinIcon className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider truncate max-w-[140px]">
                            {activeBranch?.name || "Select Branch"}
                        </span>
                        <ChevronDownIcon className={`w-3 h-3 text-slate-400 transition-transform ${showBranchDropdown ? "rotate-180" : ""}`} />
                    </button>

                    {showBranchDropdown && (
                        <div className="absolute left-0 top-full mt-2 min-w-[210px] bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden z-[200]">
                            <div className="px-4 py-2 border-b border-slate-50">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Switch Branch</p>
                            </div>
                            <div className="py-1.5 max-h-60 overflow-y-auto">
                                {branches.length === 0
                                    ? <div className="px-4 py-3 text-sm text-slate-400 text-center italic">No branches</div>
                                    : branches.map(b => (
                                        <button
                                            key={b._id}
                                            onClick={() => handleSwitchBranch(b)}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors"
                                        >
                                            <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${b._id === activeBranch?._id ? "bg-indigo-500" : "bg-slate-100"}`}>
                                                {b._id === activeBranch?._id
                                                    ? <CheckIcon className="w-3 h-3 text-white" />
                                                    : <BuildingOffice2Icon className="w-3 h-3 text-slate-400" />}
                                            </div>
                                            <span className={`text-sm ${b._id === activeBranch?._id ? "font-semibold text-slate-900" : "text-slate-500"}`}>
                                                {b.name}
                                            </span>
                                        </button>
                                    ))
                                }
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── RIGHT: Notifications + Avatar ─── */}
            <div className="flex items-center gap-3">

                {/* Notification Bell */}
                <div className="relative">
                    <NotificationBell
                        bellRef={notifBellRef}
                        unreadCount={unreadCount}
                        isOpen={showNotifications}
                        onToggle={toggleNotifications}
                    />
                    <NotificationDropdown
                        ref={notifPanelRef}
                        isOpen={showNotifications}
                        onClose={() => setShowNotifications(false)}
                        anchorRef={notifBellRef}
                        notifications={notifications}
                        unreadCount={unreadCount}
                        loading={loading}
                        onDropdownOpen={onDropdownOpen}
                        onMarkAsRead={markAsRead}
                        onMarkAllRead={markAllRead}
                        onDelete={removeNotification}
                    />
                </div>

                {/* User Avatar — opens profile dropdown */}
                <div className="relative" ref={profileRef}>
                    <button
                        id="header-avatar-btn"
                        onClick={() => setShowProfile(prev => !prev)}
                        title="My Account"
                        className="
                            w-10 h-10 rounded-full overflow-hidden
                            border-2 border-white shadow-md
                            hover:ring-2 hover:ring-indigo-400 hover:ring-offset-1
                            transition-all duration-200 flex-shrink-0
                        "
                    >
                        {(user?.profileImage || user?.avatarUrl) ? (
                            <img
                                src={user.profileImage || user.avatarUrl}
                                alt={displayName}
                                className="w-full h-full object-cover"
                                onError={(e) => { e.target.style.display = 'none'; }}
                            />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                                <span className="text-sm font-bold text-white">{avatarInitial}</span>
                            </div>
                        )}
                    </button>

                    {/* Profile Dropdown */}
                    {showProfile && (
                        <div className="absolute right-0 top-full mt-3 w-64 bg-white border border-slate-100 rounded-2xl shadow-2xl shadow-slate-200/60 overflow-hidden z-[300]">

                            {/* User Info Header */}
                            <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-50">
                                <div className="w-10 h-10 rounded-full overflow-hidden shadow-sm border border-slate-100 flex-shrink-0">
                                    {(user?.profileImage || user?.avatarUrl) ? (
                                        <img
                                            src={user.profileImage || user.avatarUrl}
                                            alt={displayName}
                                            className="w-full h-full object-cover"
                                            onError={(e) => { e.target.style.display = 'none'; }}
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                                            <span className="text-sm font-bold text-white">{avatarInitial}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-800 truncate">
                                        {user?.firstName
                                            ? `${user.firstName} ${user.lastName || ""}`.trim()
                                            : user?.name || "User"
                                        }
                                    </p>
                                    <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                                </div>
                            </div>

                            {/* Menu Items */}
                            <div className="py-2">
                                <button
                                    id="header-profile-link"
                                    onClick={() => { navigate("/org/profile"); setShowProfile(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                                >
                                    <UserCircleIcon className="w-4 h-4 text-slate-400" />
                                    <span className="font-medium">My Profile</span>
                                </button>

                                <button
                                    id="header-settings-link"
                                    onClick={() => { navigate("/org/settings"); setShowProfile(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                                >
                                    <Cog6ToothIcon className="w-4 h-4 text-slate-400" />
                                    <span className="font-medium">Settings</span>
                                </button>
                            </div>

                            {/* Sign Out */}
                            <div className="border-t border-slate-50 py-2">
                                <button
                                    id="header-signout-btn"
                                    onClick={() => { logout(); setShowProfile(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-500 hover:bg-red-50 transition-colors text-left"
                                >
                                    <ArrowRightOnRectangleIcon className="w-4 h-4" />
                                    <span className="font-medium">Sign Out</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
