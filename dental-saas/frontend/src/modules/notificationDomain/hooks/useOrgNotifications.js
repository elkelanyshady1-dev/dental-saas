/**
 * useOrgNotifications.js
 *
 * Encapsulates ALL notification state for OrgHeader.
 * - Polling: unread count every 60s (always active)
 * - Full list: only fetched on first open, then cached until mark/delete
 * - All mutations: optimistic local update first, no duplicate requests
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
    getNotifications,
    getUnreadCount,
    markAsRead as apiMarkAsRead,
    markAllRead as apiMarkAllRead,
    deleteNotification as apiDelete,
} from "../services/orgNotification.api";

export function useOrgNotifications() {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(false);

    // Tracks whether the full list has been fetched at least once
    const fetched = useRef(false);
    const pollTimer = useRef(null);
    const fetchLock = useRef(false); // prevents duplicate concurrent fetches

    // ── Fetch unread badge count (lightweight) ────────────────────────────────
    const refreshCount = useCallback(async () => {
        try {
            const res = await getUnreadCount();
            setUnreadCount(res?.count ?? res?.data?.count ?? 0);
        } catch { /* silent */ }
    }, []);

    // ── Fetch full notification list ──────────────────────────────────────────
    const fetchNotifications = useCallback(async () => {
        if (fetchLock.current) return; // debounce concurrent calls
        fetchLock.current = true;
        setLoading(true);
        try {
            const res = await getNotifications({ limit: 20 });
            const data = res?.data ?? res;
            setNotifications(Array.isArray(data) ? data : []);
            setHasMore(res?.meta?.hasMore ?? false);
            // Derive count from returned data for accuracy
            const unread = (Array.isArray(data) ? data : []).filter(n => !n.isRead).length;
            setUnreadCount(unread);
            fetched.current = true;
        } catch { /* silent */ } finally {
            setLoading(false);
            fetchLock.current = false;
        }
    }, []);

    // ── Called when dropdown is opened ───────────────────────────────────────
    const onDropdownOpen = useCallback(() => {
        // Always refetch to get fresh data each time dropdown opens
        fetchNotifications();
    }, [fetchNotifications]);

    // ── Mount: start unread count polling ────────────────────────────────────
    useEffect(() => {
        refreshCount(); // immediate on mount
        pollTimer.current = setInterval(refreshCount, 60_000);
        return () => clearInterval(pollTimer.current);
    }, [refreshCount]);

    // ── Mark single as read ───────────────────────────────────────────────────
    const markAsRead = useCallback(async (id) => {
        // Optimistic update
        setNotifications(prev =>
            prev.map(n => n._id === id ? { ...n, isRead: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
        try {
            await apiMarkAsRead(id);
        } catch {
            // Revert on failure
            setNotifications(prev =>
                prev.map(n => n._id === id ? { ...n, isRead: false } : n)
            );
            setUnreadCount(prev => prev + 1);
        }
    }, []);

    // ── Mark all read ─────────────────────────────────────────────────────────
    const markAllRead = useCallback(async () => {
        // Optimistic
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
        try {
            await apiMarkAllRead();
        } catch {
            // Revert: refetch to restore actual state
            fetchNotifications();
        }
    }, [fetchNotifications]);

    // ── Soft delete ───────────────────────────────────────────────────────────
    const removeNotification = useCallback(async (id) => {
        // Optimistic: remove immediately
        setNotifications(prev => {
            const removed = prev.find(n => n._id === id);
            if (removed && !removed.isRead) {
                setUnreadCount(c => Math.max(0, c - 1));
            }
            return prev.filter(n => n._id !== id);
        });
        try {
            await apiDelete(id);
        } catch {
            // Non-fatal: list already looks correct, just refresh
            fetchNotifications();
        }
    }, [fetchNotifications]);

    return {
        notifications,
        unreadCount,
        loading,
        hasMore,
        onDropdownOpen,
        markAsRead,
        markAllRead,
        removeNotification,
        refreshCount,
    };
}
