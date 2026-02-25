import { useState, useEffect, useRef } from "react";
import { Bell, Check, CheckCheck, Info, AlertTriangle, XCircle } from "lucide-react";
import api from "../../../../services/api";

export function NotificationBell() {
    const [notifications, setNotifications] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const fetchNotifications = async () => {
        try {
            const res = await api.get("/platform/notifications");
            setNotifications(res.data);
        } catch (err) {
            console.error("Failed to fetch notifications:", err);
        }
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const markAsRead = async (e, id) => {
        e.stopPropagation();
        try {
            await api.patch(`/platform/notifications/${id}/read`);
            setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
        } catch (err) {
            console.error("Failed to mark read:", err);
        }
    };

    const markAllRead = async () => {
        try {
            await api.patch("/platform/notifications/read-all");
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        } catch (err) {
            console.error("Failed to mark all read:", err);
        }
    };

    const unreadCount = notifications.filter(n => !n.isRead).length;

    const getIcon = (severity) => {
        if (severity === "critical") return <XCircle className="w-4 h-4 text-red-600" />;
        if (severity === "warning") return <AlertTriangle className="w-4 h-4 text-amber-600" />;
        return <Info className="w-4 h-4 text-blue-600" />;
    };

    const getBgColor = (severity, isRead) => {
        if (isRead) return "bg-white hover:bg-slate-50";
        if (severity === "critical") return "bg-red-50 hover:bg-red-100/50";
        if (severity === "warning") return "bg-amber-50 hover:bg-amber-100/50";
        return "bg-blue-50 hover:bg-blue-100/50";
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="text-slate-400 hover:text-slate-900 transition-colors relative p-1 focus:outline-none"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center flex items-center justify-center">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-3 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col max-h-[28rem]">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllRead}
                                className="text-xs flex items-center gap-1 font-medium text-blue-600 hover:text-blue-800 transition-colors"
                            >
                                <CheckCheck className="w-3.5 h-3.5" />
                                Mark all read
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-slate-500 text-sm">
                                You're all caught up!
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {notifications.map(notif => (
                                    <div
                                        key={notif._id}
                                        className={`p-4 transition-colors relative group ${getBgColor(notif.severity, notif.isRead)}`}
                                    >
                                        <div className="flex gap-3">
                                            <div className="shrink-0 mt-0.5">
                                                {getIcon(notif.severity)}
                                            </div>
                                            <div className="flex-1 min-w-0 pr-6">
                                                <p className={`text-sm tracking-tight ${notif.isRead ? "text-slate-700 font-medium" : "text-slate-900 font-semibold"}`}>
                                                    {notif.title}
                                                </p>
                                                <p className={`text-xs mt-1 ${notif.isRead ? "text-slate-500" : "text-slate-600"}`}>
                                                    {notif.message}
                                                </p>
                                                <p className="text-[10px] text-slate-400 mt-2 font-medium">
                                                    {new Date(notif.createdAt).toLocaleString(undefined, {
                                                        month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
                                                    })}
                                                </p>
                                            </div>
                                        </div>
                                        {!notif.isRead && (
                                            <button
                                                onClick={(e) => markAsRead(e, notif._id)}
                                                className="absolute top-4 right-4 p-1.5 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                                                title="Mark as read"
                                            >
                                                <Check className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        {notif.organizationId && (
                                            <div className="mt-2 ml-7">
                                                <span className="inline-block px-2 py-0.5 bg-white border border-slate-200 text-[10px] font-medium text-slate-500 rounded-md shadow-sm">
                                                    {notif.organizationId.name}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
