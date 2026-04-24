/**
 * statusStyles.js — Single source of truth for recall-status visual tokens.
 *
 * Mirrors the calendar's STATUS_LEGEND pattern so recall + appointment
 * status colors stay coherent across the scheduling family. If the
 * appointment palette changes, update here in lockstep.
 */

export const RECALL_STATUS = {
    pending: {
        label: "Pending",
        bg: "bg-slate-100",
        text: "text-slate-700",
        border: "border-slate-200",
        dot: "bg-slate-400",
    },
    sent: {
        label: "Sent",
        bg: "bg-blue-50",
        text: "text-blue-700",
        border: "border-blue-200",
        dot: "bg-blue-400",
    },
    booked: {
        label: "Booked",
        bg: "bg-emerald-50",
        text: "text-emerald-700",
        border: "border-emerald-200",
        dot: "bg-emerald-400",
    },
    cancelled: {
        label: "Cancelled",
        bg: "bg-red-50",
        text: "text-red-700",
        border: "border-red-200",
        dot: "bg-red-400",
    },
};

export const OVERDUE_STYLE = {
    label: "Overdue",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    dot: "bg-red-500",
};

export function statusToken(status) {
    return RECALL_STATUS[status] || RECALL_STATUS.pending;
}
