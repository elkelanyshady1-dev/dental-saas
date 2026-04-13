/**
 * NotificationDropdown.jsx
 * Production-grade notification panel for OrgHeader.
 *
 * Presentational component — all state is passed via props.
 * State + data fetching lives in useOrgNotifications (called by OrgHeader).
 *
 * Props:
 *   isOpen        {boolean}
 *   onClose       {function}
 *   anchorRef     {React.ref}  — bell button ref for outside-click detection
 *   notifications {Array}
 *   unreadCount   {number}
 *   loading       {boolean}
 *   onDropdownOpen {function}  — called when isOpen becomes true (triggers fetch)
 *   onMarkAsRead  {function(id)}
 *   onMarkAllRead {function}
 *   onDelete      {function(id)}
 */

import { useEffect, useRef, useCallback, forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import {
    BellIcon,
    XMarkIcon,
    CheckIcon,
    TrashIcon,
    ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

// ── Priority config ───────────────────────────────────────────────────────────
const PRIORITY = {
    high: { border: "border-l-red-500", dot: "bg-red-500", },
    normal: { border: "border-l-blue-500", dot: "bg-blue-400", },
    low: { border: "border-l-slate-500", dot: "bg-slate-400", },
};

// ── Relative time formatter ───────────────────────────────────────────────────
function relativeTime(dateStr) {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days = Math.floor(diff / 86_400_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Skeleton row ──────────────────────────────────────────────────────────────
function SkeletonRow() {
    return (
        <div className="flex gap-3 px-4 py-3 border-b border-white/5 animate-pulse">
            <div className="w-2 h-2 rounded-full bg-white/10 mt-2 flex-shrink-0" />
            <div className="flex-1 space-y-2">
                <div className="h-3 bg-white/10 rounded w-3/4" />
                <div className="h-2.5 bg-white/[0.08] rounded w-full" />
                <div className="h-2 bg-white/5 rounded w-1/4" />
            </div>
        </div>
    );
}

// ── NotificationItem ──────────────────────────────────────────────────────────
function NotificationItem({ notification: n, onMarkAsRead, onDelete }) {
    const navigate = useNavigate();
    const p = PRIORITY[n.priority] ?? PRIORITY.normal;

    const handleClick = useCallback(() => {
        if (!n.isRead) onMarkAsRead(n._id);
        // Navigate to entity if entityType/Id is set (future-safe)
        const pathMap = {
            PATIENT: `/org/patients/${n.entityId}`,
            APPOINTMENT: `/org/appointments`,
            BOOKING_REQUEST: `/org/appointments`,
        };
        if (n.entityType && n.entityId && pathMap[n.entityType]) {
            navigate(pathMap[n.entityType]);
        }
    }, [n, onMarkAsRead, navigate]);

    return (
        <div
            className={`
                relative flex gap-3 px-4 py-3 cursor-pointer
                border-l-4 ${p.border}
                border-b border-white/5 last:border-0
                transition-all duration-150
                ${!n.isRead ? "bg-blue-500/5 hover:bg-blue-500/10" : "hover:bg-white/[0.03]"}
                group
            `}
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === "Enter" && handleClick()}
            aria-label={n.title}
        >
            {/* Unread indicator dot */}
            <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 transition-colors ${!n.isRead ? p.dot : "bg-transparent"}`} />

            {/* Content */}
            <div className="flex-1 min-w-0 pr-7">
                <p className={`text-sm leading-snug ${!n.isRead ? "font-semibold text-white" : "font-medium text-white/60"}`}>
                    {n.title}
                </p>
                <p className="text-xs text-white/40 mt-0.5 line-clamp-2 leading-relaxed">
                    {n.message}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-white/25">{relativeTime(n.createdAt)}</span>
                    {n.priority === "high" && (
                        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-red-400">
                            <ExclamationTriangleIcon className="w-2.5 h-2.5" /> High
                        </span>
                    )}
                </div>
            </div>

            {/* Hover-reveal delete button */}
            <button
                onClick={e => { e.stopPropagation(); onDelete(n._id); }}
                title="Dismiss"
                className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-all"
                aria-label="Dismiss notification"
            >
                <TrashIcon className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

// ── Main Dropdown (forwardRef so parent can attach notifPanelRef) ─────────────
const NotificationDropdown = forwardRef(function NotificationDropdown(
    {
        isOpen,
        onClose,
        anchorRef,
        notifications = [],
        unreadCount = 0,
        loading = false,
        onDropdownOpen,
        onMarkAsRead,
        onMarkAllRead,
        onDelete,
    },
    ref
) {
    // Trigger fetch when dropdown opens
    useEffect(() => {
        if (isOpen && onDropdownOpen) onDropdownOpen();
    }, [isOpen, onDropdownOpen]);

    // Outside click (panel ref comes from parent via forwardRef)
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => {
            const panel = ref?.current;
            const anchor = anchorRef?.current;
            if (
                panel && !panel.contains(e.target) &&
                anchor && !anchor.contains(e.target)
            ) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [isOpen, onClose, anchorRef, ref]);

    // ESC key (handled at OrgHeader level too, but defensive here)
    useEffect(() => {
        if (!isOpen) return;
        const handler = e => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            ref={ref}
            role="dialog"
            aria-label="Notifications"
            aria-modal="false"
            style={{ zIndex: 9999 }}
            className="
                absolute right-0 top-full mt-2
                w-[360px]
                flex flex-col
                bg-[#0d1e40]/98 backdrop-blur-2xl
                border border-white/10
                rounded-2xl shadow-2xl shadow-black/60
                overflow-hidden
                animate-in fade-in slide-in-from-top-2 duration-150
            "
        >
            {/* ── Sticky header ─────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <BellIcon className="w-4 h-4 text-white/40" />
                    <h3 className="text-sm font-bold text-white">Notifications</h3>
                    {unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 bg-blue-500/20 border border-blue-500/25 text-blue-400 text-[10px] font-bold rounded-full">
                            {unreadCount > 99 ? "99+" : unreadCount} new
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {unreadCount > 0 && (
                        <button
                            onClick={onMarkAllRead}
                            title="Mark all as read"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-all"
                        >
                            <CheckIcon className="w-3 h-3" /> All read
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-white/25 hover:text-white hover:bg-white/5 transition-all"
                        aria-label="Close notifications"
                    >
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* ── Scrollable list ───────────────────────────────── */}
            <div className="overflow-y-auto max-h-[420px] overscroll-contain">
                {loading ? (
                    <>
                        <SkeletonRow />
                        <SkeletonRow />
                        <SkeletonRow />
                    </>
                ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-14 gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                            <BellIcon className="w-5 h-5 text-white/20" />
                        </div>
                        <p className="text-sm text-white/30 italic">No notifications yet</p>
                    </div>
                ) : (
                    notifications.map(n => (
                        <NotificationItem
                            key={n._id}
                            notification={n}
                            onMarkAsRead={onMarkAsRead}
                            onDelete={onDelete}
                        />
                    ))
                )}
            </div>

            {/* ── Footer ───────────────────────────────────────── */}
            {notifications.length > 0 && (
                <div className="px-4 py-2 border-t border-white/[0.08] flex-shrink-0">
                    <p className="text-[10px] text-white/20 text-center">
                        {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
                    </p>
                </div>
            )}
        </div>
    );
});

export default NotificationDropdown;

// ── Bell trigger (exported separately for OrgHeader) ─────────────────────────
export function NotificationBell({ unreadCount, isOpen, onToggle, bellRef }) {
    return (
        <button
            ref={bellRef}
            onClick={onToggle}
            title="Notifications"
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
            aria-expanded={isOpen}
            className="relative w-9 h-9 rounded-xl flex items-center justify-center text-white/55 hover:text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
        >
            <BellIcon style={{ width: "18px", height: "18px" }} />
            {unreadCount > 0 && (
                <span
                    className="absolute -top-1 -right-1 min-w-[16px] h-[16px] bg-red-500 rounded-full border-2 border-[#0f1f3d] flex items-center justify-center text-[9px] font-bold text-white px-0.5 leading-none"
                    aria-hidden="true"
                >
                    {unreadCount > 99 ? "99+" : unreadCount}
                </span>
            )}
        </button>
    );
}
