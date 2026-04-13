/**
 * TopCommandBar.jsx
 * v20.4 — Avatar + profile dropdown menu
 *
 * Changes from v14.1:
 *  - Text-only user identity → circular avatar with initials/photo fallback
 *  - Clicking avatar opens profile dropdown: My Profile / Security Settings / Log Out
 *  - "My Profile" routes to /platform/users/:id using auth context user id
 *  - All other markup and CSS token usage is preserved exactly
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { usePlatformAuth } from "../../auth/PlatformAuthContext";
import { LogOut, Globe, Shield, ChevronDown, Settings } from "lucide-react";
import { GlobalSearchBar } from "./GlobalSearchBar";
import { NotificationBell } from "./NotificationBell";

// ─── Avatar ────────────────────────────────────────────────────────────────────

function getInitials(name = "") {
    return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function UserAvatar({ user, size = "sm" }) {
    const dim = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
    if (user?.profilePhotoUrl) {
        return (
            <img
                src={user.profilePhotoUrl}
                alt={user.name}
                className={`${dim} rounded-full object-cover flex-shrink-0`}
                style={{ border: "1px solid var(--color-border-default)" }}
            />
        );
    }
    return (
        <div
            className={`${dim} rounded-full flex items-center justify-center font-bold flex-shrink-0 select-none`}
            style={{
                background: "var(--color-brand-primary-lt)",
                color: "var(--color-brand-primary)",
                border: "1px solid var(--color-brand-border)",
            }}
        >
            {getInitials(user?.name)}
        </div>
    );
}

// ─── Profile Dropdown ──────────────────────────────────────────────────────────

function ProfileMenu({ user, anchorRect, onClose, onLogout, onProfile, onSettings }) {
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        const keyHandler = (e) => { if (e.key === "Escape") onClose(); };
        const id = setTimeout(() => {
            document.addEventListener("mousedown", handler);
            document.addEventListener("keydown", keyHandler);
        }, 0);
        return () => {
            clearTimeout(id);
            document.removeEventListener("mousedown", handler);
            document.removeEventListener("keydown", keyHandler);
        };
    }, [onClose]);

    if (!anchorRect) return null;

    const style = {
        position: "fixed",
        top: anchorRect.bottom + 8,
        right: window.innerWidth - anchorRect.right,
        zIndex: 9999,
        minWidth: 200,
    };

    return createPortal(
        <div ref={ref} style={style}>
            <div
                className="rounded-xl shadow-2xl overflow-hidden border animate-in fade-in zoom-in-95 duration-150"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-border-default)" }}
            >
                {/* User header */}
                <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border-default)" }}>
                    <div className="flex items-center gap-2.5">
                        <UserAvatar user={user} size="sm" />
                        <div className="min-w-0">
                            <p className="text-xs font-bold truncate" style={{ color: "var(--color-text-primary)" }}>
                                {user?.name}
                            </p>
                            <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--color-brand-primary)" }}>
                                {user?.role}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Menu items */}
                <div className="py-1">
                    <button
                        onClick={onProfile}
                        className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors"
                        style={{ color: "var(--color-text-secondary)" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-surface-soft)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                        <Shield className="w-3.5 h-3.5 opacity-60" />
                        My Profile
                    </button>
                    <button
                        onClick={onSettings}
                        className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors"
                        style={{ color: "var(--color-text-secondary)" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-surface-soft)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                        <Settings className="w-3.5 h-3.5 opacity-60" />
                        Security Settings
                    </button>
                </div>

                <div className="border-t py-1" style={{ borderColor: "var(--color-border-default)" }}>
                    <button
                        onClick={onLogout}
                        className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors"
                        style={{ color: "var(--color-danger-text)" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-danger-bg)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                        <LogOut className="w-3.5 h-3.5 opacity-80" />
                        Sign Out
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ─── TopCommandBar ─────────────────────────────────────────────────────────────

export function TopCommandBar({ capabilities }) {
    const { user, platformLogout } = usePlatformAuth();
    const navigate = useNavigate();

    const [menuOpen, setMenuOpen] = useState(false);
    const [anchorRect, setAnchorRect] = useState(null);
    const triggerRef = useRef(null);

    const openMenu = () => {
        if (menuOpen) { setMenuOpen(false); return; }
        setAnchorRect(triggerRef.current?.getBoundingClientRect() || null);
        setMenuOpen(true);
    };

    const handleProfile = () => {
        setMenuOpen(false);
        if (user?.id) navigate(`/platform/users/${user.id}`);
    };

    const handleSettings = () => {
        setMenuOpen(false);
        navigate("/platform/settings");
    };

    const handleLogout = () => {
        setMenuOpen(false);
        platformLogout();
    };

    return (
        <div className="shrink-0 z-30">
            {/* ── Brand accent strip ── */}
            <div className="h-[3px] bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-500" />

            {/* ── Main header ── */}
            <header
                className="h-[68px] flex items-center justify-between px-8"
                style={{
                    background: "var(--color-surface)",
                    borderBottom: "1px solid var(--color-border-default)",
                    boxShadow: "var(--shadow-xs)",
                }}
            >
                {/* Left: badge + search */}
                <div className="flex items-center gap-5">
                    <div
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                        style={{
                            background: "var(--color-brand-primary-lt)",
                            border: "1px solid var(--color-brand-border)",
                        }}
                    >
                        <Globe className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-[11px] font-bold text-blue-700 uppercase tracking-tight">Global Instance</span>
                    </div>

                    <div className="h-4 w-px bg-slate-200" />

                    <GlobalSearchBar />
                </div>

                {/* Right: bell + avatar menu */}
                <div className="flex items-center gap-4">
                    <NotificationBell />

                    <div className="h-8 w-px bg-slate-200" />

                    {/* ── Avatar + name → opens profile menu ── */}
                    <button
                        ref={triggerRef}
                        onClick={openMenu}
                        className="flex items-center gap-2.5 py-1 px-1.5 rounded-xl transition-colors"
                        style={{ color: "var(--color-text-primary)" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-surface-soft)"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                        aria-label="Open profile menu"
                        aria-haspopup="true"
                        aria-expanded={menuOpen}
                    >
                        <UserAvatar user={user} size="sm" />
                        <div className="flex flex-col items-start leading-none gap-0.5">
                            <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
                                {user?.name}
                            </span>
                            <span
                                className="text-[10px] font-bold uppercase tracking-wide"
                                style={{ color: "var(--color-brand-primary)" }}
                            >
                                {user?.role}
                            </span>
                        </div>
                        <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-150 ${menuOpen ? "rotate-180" : ""}`}
                            style={{ color: "var(--color-text-muted)" }}
                        />
                    </button>
                </div>
            </header>

            {/* Profile dropdown */}
            {menuOpen && (
                <ProfileMenu
                    user={user}
                    anchorRect={anchorRect}
                    onClose={() => setMenuOpen(false)}
                    onProfile={handleProfile}
                    onSettings={handleSettings}
                    onLogout={handleLogout}
                />
            )}
        </div>
    );
}
