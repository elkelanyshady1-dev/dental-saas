/**
 * NotificationBell.jsx
 * Platform — Notification Bell with Dropdown
 *
 * Polls GET /api/platform/notifications/unread-count every 30s.
 * Clicking opens a dropdown listing recent notifications.
 * Each notification has a "Mark as read" action.
 * "Mark all read" button at top of dropdown.
 * Clickable entity links where applicable.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { Bell, X, CheckCheck, AlertTriangle, Info, ShieldAlert, CheckCircle2 } from "lucide-react";
import platformApi from "../../auth/platformApi";

const POLL_INTERVAL_MS = 30_000; // 30 seconds

// ── Entity link map ───────────────────────────────────────────────────────────
const ENTITY_ROUTES = {
    organization: (id) => `/platform/organizations/${id}`,
    contract: (id) => `/platform/subscriptions`,
    invoice: (id) => `/platform/billing/invoices`,
    user: (id) => `/platform/users/${id}`,
};

// ── Severity icon + color ─────────────────────────────────────────────────────
const SEVERITY_CONFIG = {
    info: { Icon: Info, color: "text-blue-500", bg: "bg-blue-50", border: "border-blue-100" },
    warning: { Icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-50", border: "border-amber-100" },
    critical: { Icon: ShieldAlert, color: "text-red-500", bg: "bg-red-50", border: "border-red-100" },
};

function fmt(d) {
    if (!d) return "";
    const date = new Date(d);
    const now = new Date();
    const diffMs = now - date;
    if (diffMs < 60_000) return "Just now";
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
    if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Notification item ─────────────────────────────────────────────────────────
function NotifItem({ notif, onMarkRead, navigate }) {
    const sev = SEVERITY_CONFIG[notif.severity] || SEVERITY_CONFIG.info;
    const Icon = sev.Icon;
    const isRead = notif.isRead;

    const handleEntityClick = () => {
        if (notif.organizationId && ENTITY_ROUTES.organization) {
            navigate(ENTITY_ROUTES.organization(notif.organizationId));
        }
    };

    return (
        <div
            className={`px-4 py-3 border-b last:border-0 flex gap-3 items-start transition-colors ${isRead ? "opacity-60" : ""}`}
            style={{ borderColor: "var(--color-border-default)", background: isRead ? "transparent" : "var(--color-surface-soft)" }}
        >
            {/* Severity icon */}
            <div className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${sev.bg} ${sev.border} border`}>
                <Icon className={`w-3 h-3 ${sev.color}`} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 leading-snug">
                    {notif.title || notif.type.replace(/_/g, " ")}
                </p>
                {notif.message && (
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{notif.message}</p>
                )}
                {notif.organizationId && (
                    <button
                        onClick={handleEntityClick}
                        className="text-[10px] text-violet-500 hover:text-violet-700 underline transition-colors mt-1"
                    >
                        View organization →
                    </button>
                )}
                <p className="text-[10px] text-slate-400 mt-1">{fmt(notif.createdAt)}</p>
            </div>

            {/* Mark-read action */}
            {!isRead && (
                <button
                    onClick={() => onMarkRead(notif._id)}
                    title="Mark as read"
                    className="flex-shrink-0 mt-0.5 text-slate-300 hover:text-slate-600 transition-colors"
                >
                    <CheckCircle2 className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}

// ── Dropdown panel ────────────────────────────────────────────────────────────
function NotifDropdown({ notifications, loading, onMarkRead, onMarkAll, onClose, anchorRef, navigate }) {
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target) && !anchorRef.current.contains(e.target)) onClose(); };
        const keyHandler = (e) => { if (e.key === "Escape") onClose(); };
        const t = setTimeout(() => {
            document.addEventListener("mousedown", handler);
            document.addEventListener("keydown", keyHandler);
        }, 0);
        return () => {
            clearTimeout(t);
            document.removeEventListener("mousedown", handler);
            document.removeEventListener("keydown", keyHandler);
        };
    }, [onClose, anchorRef]);

    if (!anchorRef.current) return null;
    const rect = anchorRef.current.getBoundingClientRect();
    const style = {
        position: "fixed",
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
        width: 340,
        zIndex: 9999,
    };

    return createPortal(
        <div ref={ref} style={style}>
            <div
                className="rounded-xl border shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
                style={{ background: "var(--color-surface)", borderColor: "var(--color-border-default)" }}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-4 py-3 border-b"
                    style={{ borderColor: "var(--color-border-default)" }}
                >
                    <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Notifications</span>
                    <div className="flex items-center gap-2">
                        {notifications.some(n => !n.isRead) && (
                            <button
                                onClick={onMarkAll}
                                className="flex items-center gap-1 text-[10px] font-bold text-violet-500 hover:text-violet-700 transition-colors"
                                title="Mark all as read"
                            >
                                <CheckCheck className="w-3 h-3" /> Mark all read
                            </button>
                        )}
                        <button onClick={onClose} className="text-slate-300 hover:text-slate-600 transition-colors">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="max-h-[400px] overflow-y-auto">
                    {loading ? (
                        <div className="py-8 text-center text-xs text-slate-400">Loading…</div>
                    ) : notifications.length === 0 ? (
                        <div className="py-8 text-center">
                            <Bell className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                            <p className="text-xs text-slate-400">No notifications</p>
                        </div>
                    ) : (
                        notifications.map(n => (
                            <NotifItem key={n._id} notif={n} onMarkRead={onMarkRead} navigate={navigate} />
                        ))
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export function NotificationBell() {
    const navigate = useNavigate();
    const buttonRef = useRef(null);

    const [open, setOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);

    // Poll unread count every 30 seconds
    const fetchCount = useCallback(async () => {
        try {
            const res = await platformApi.get("/notifications/unread-count");
            setUnreadCount(res.data?.count ?? 0);
        } catch { /* silent — bell is non-critical */ }
    }, []);

    useEffect(() => {
        fetchCount();
        const interval = setInterval(fetchCount, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [fetchCount]);

    // Fetch full list when dropdown opens
    const fetchList = useCallback(async () => {
        setLoading(true);
        try {
            const res = await platformApi.get("/notifications?limit=20");
            setNotifications(res.data?.data || []);
        } catch { setNotifications([]); }
        finally { setLoading(false); }
    }, []);

    const handleOpen = () => {
        setOpen(prev => {
            if (!prev) fetchList();
            return !prev;
        });
    };

    const handleMarkRead = async (id) => {
        try {
            await platformApi.post(`/notifications/${id}/read`);
            setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch { /* silent */ }
    };

    const handleMarkAll = async () => {
        try {
            await platformApi.post("/notifications/read-all");
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch { /* silent */ }
    };

    return (
        <>
            <button
                ref={buttonRef}
                onClick={handleOpen}
                id="notification-bell-button"
                aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
                className="p-2 rounded-lg transition-colors relative"
                style={{ color: "var(--color-text-muted)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--color-surface-soft)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                title="Notifications"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span
                        className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2"
                        style={{ borderColor: "var(--color-surface)" }}
                    >
                        {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <NotifDropdown
                    notifications={notifications}
                    loading={loading}
                    onMarkRead={handleMarkRead}
                    onMarkAll={handleMarkAll}
                    onClose={() => setOpen(false)}
                    anchorRef={buttonRef}
                    navigate={navigate}
                />
            )}
        </>
    );
}
