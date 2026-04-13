/**
 * SupportPage.jsx — Settings Hub: Support Dashboard
 *
 * Split-screen layout:
 *   LEFT (35%):  Ticket list with status filter tabs
 *   RIGHT (65%): Ticket detail (chat) or empty state
 *
 * Architecture:
 *   Uses useTickets + useTicketDetail hooks
 *   Permission: support.read (list + detail), support.write (create + reply)
 *   Data source: DTO only — no raw backend fields
 *
 * @module modules/org/settings/pages/SupportPage
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
    ChatBubbleLeftRightIcon,
    PlusIcon,
    BookOpenIcon,
    PaperAirplaneIcon,
    XMarkIcon,
    TicketIcon,
    ClockIcon,
} from "@heroicons/react/24/outline";

import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { useTickets, useTicketDetail, useCreateTicket, useAddComment } from "../hooks/useSettingsSupport";
import TicketCard from "../components/TicketCard";
import ChatBubble from "../components/ChatBubble";
import StatusBadge from "../components/StatusBadge";
import PriorityTag from "../components/PriorityTag";
import SettingsBreadcrumb from "@/components/settings/SettingsBreadcrumb";

// ─── Skeleton Loader ─────────────────────────────────────────────────────────
function TicketSkeleton() {
    return (
        <div className="px-4 py-3.5 space-y-2.5 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="h-4 w-16 bg-slate-800 rounded-md" />
                <div className="h-3 w-20 bg-slate-800/60 rounded-md" />
            </div>
            <div className="h-4 w-3/4 bg-slate-800 rounded-md" />
            <div className="h-3 w-16 bg-slate-800/60 rounded-md" />
        </div>
    );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ onNewTicket, canWrite }) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            {/* Abstract Illustration */}
            <div className="relative mb-8">
                <div className="flex gap-3">
                    <div className="w-20 h-24 rounded-2xl bg-blue-500/10 border border-blue-500/20" />
                    <div className="flex flex-col gap-3">
                        <div className="w-16 h-14 rounded-2xl bg-slate-800/60 border border-slate-700/50" />
                        <div className="w-16 h-8 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
                            <ChatBubbleLeftRightIcon className="w-4 h-4 text-blue-400" />
                        </div>
                    </div>
                </div>
                <div className="absolute -bottom-2 -right-2 w-14 h-10 rounded-xl bg-slate-800/40 border border-slate-700/30" />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">
                Select a ticket to view details
            </h2>
            <p className="text-sm text-slate-400 max-w-sm mb-6">
                Choose a conversation from the list to start resolving issues,
                checking history, or responding to clinic admins.
            </p>

            <div className="flex items-center gap-3">
                {canWrite && (
                    <button
                        onClick={onNewTicket}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-500/25"
                    >
                        <PlusIcon className="w-4 h-4" />
                        New Ticket
                    </button>
                )}
                <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white text-sm font-medium transition-all">
                    <BookOpenIcon className="w-4 h-4" />
                    Knowledge Base
                </button>
            </div>
        </div>
    );
}

// ─── New Ticket Form ─────────────────────────────────────────────────────────
function NewTicketForm({ onClose, onCreated }) {
    const [subject, setSubject] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState("technical");
    const [priority, setPriority] = useState("MEDIUM");
    const createTicket = useCreateTicket();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!subject.trim() || !description.trim()) return;

        try {
            await createTicket.mutateAsync({ subject, description, category, priority });
            onCreated?.();
            onClose();
        } catch {
            // Error handled by mutation
        }
    };

    return (
        <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center">
                        <TicketIcon className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-white">Create Support Ticket</h2>
                        <p className="text-xs text-slate-500">Tell us about the issue you're experiencing.</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Title */}
                <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ticket Title</label>
                    <input
                        type="text"
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        placeholder="Briefly describe the issue..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-white/20 transition-all"
                        required
                    />
                </div>

                {/* Priority + Category */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Priority Level</label>
                        <select
                            value={priority}
                            onChange={e => setPriority(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all appearance-none"
                        >
                            <option value="LOW">Low</option>
                            <option value="MEDIUM">Medium — Minor Bug</option>
                            <option value="HIGH">High — Major Issue</option>
                            <option value="CRITICAL">Critical — System Down</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Department</label>
                        <select
                            value={category}
                            onChange={e => setCategory(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all appearance-none"
                        >
                            <option value="technical">Technical</option>
                            <option value="billing">Billing</option>
                            <option value="security">Security</option>
                            <option value="subscription">Subscription</option>
                        </select>
                    </div>
                </div>

                {/* Description */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Full Description</label>
                        <span className="text-[10px] text-slate-600">Include steps to reproduce</span>
                    </div>
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Provide as much detail as possible. If this is a clinical error, please include the Patient ID."
                        rows={5}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all resize-none"
                        required
                    />
                </div>

                {/* File Upload Zone */}
                <div className="border-2 border-dashed border-slate-700 hover:border-blue-500/40 rounded-2xl p-6 text-center cursor-pointer transition-colors group">
                    <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-slate-800 flex items-center justify-center group-hover:bg-blue-500/10 transition-colors">
                        <svg className="w-5 h-5 text-slate-500 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                    </div>
                    <p className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">Click to upload screenshots</p>
                    <p className="text-xs text-slate-600 mt-1">PNG, JPG or PDF up to 10MB</p>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={onClose} className="text-sm text-slate-400 hover:text-white transition-colors font-medium">
                        Discard Draft
                    </button>
                    <button
                        type="submit"
                        disabled={createTicket.isPending || !subject.trim() || !description.trim()}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {createTicket.isPending ? (
                            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting…</>
                        ) : "Submit Ticket"}
                    </button>
                </div>

                {/* Info Cards */}
                <div className="grid grid-cols-2 gap-3 pt-3">
                    <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4 flex items-start gap-3">
                        <ClockIcon className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-semibold text-slate-200">Response Time</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">Estimated response within 4 clinical hours.</p>
                        </div>
                    </div>
                    <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4 flex items-start gap-3">
                        <BookOpenIcon className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-semibold text-slate-200">Knowledge Base</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">Search our articles for quick solutions.</p>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}

// ─── Ticket Detail (Chat View) ───────────────────────────────────────────────
function TicketDetail({ ticketId, canWrite }) {
    const { data: ticket, isLoading } = useTicketDetail(ticketId);
    const addComment = useAddComment();
    const [message, setMessage] = useState("");
    const threadEndRef = useRef(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [ticket?.comments?.length]);

    const handleSend = async () => {
        if (!message.trim()) return;
        try {
            await addComment.mutateAsync({ ticketId, message: message.trim() });
            setMessage("");
        } catch {
            // Error handled by mutation
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
            </div>
        );
    }

    if (!ticket) return null;

    function formatTimeAgo(iso) {
        if (!iso) return "";
        const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }

    return (
        <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-800">
                <div className="flex items-center gap-3 mb-1">
                    <StatusBadge status={ticket.status} />
                    <PriorityTag priority={ticket.priority} />
                    <span className="text-[11px] text-slate-500">
                        Opened {formatTimeAgo(ticket.createdAt)}
                    </span>
                </div>
                <h2 className="text-lg font-bold text-white">{ticket.subject}</h2>
                {ticket.slaDeadline && (
                    <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                        <ClockIcon className="w-3 h-3" />
                        SLA deadline: {new Date(ticket.slaDeadline).toLocaleString()}
                    </p>
                )}
            </div>

            {/* Conversation Thread */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 flex flex-col">
                {/* Initial description */}
                {ticket.description && (
                    <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-4 mb-2">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Initial Description</p>
                        <p className="text-sm text-slate-300 leading-relaxed">{ticket.description}</p>
                    </div>
                )}

                {/* Messages */}
                {ticket.comments?.map((comment, i) => (
                    <ChatBubble key={i} comment={comment} />
                ))}

                <div ref={threadEndRef} />
            </div>

            {/* Chat Input */}
            {canWrite && ticket.status !== "CLOSED" && (
                <div className="px-6 py-4 border-t border-slate-800">
                    <div className="rounded-xl bg-white/[0.03] border border-slate-800 focus-within:border-blue-500/30 transition-colors">
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Reply to this ticket…"
                            rows={3}
                            className="w-full bg-transparent px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none resize-none"
                        />
                        <div className="flex items-center justify-between px-4 pb-3">
                            <div className="flex items-center gap-1">
                                {["B", "I"].map(btn => (
                                    <button key={btn} className="w-7 h-7 rounded-md text-xs font-bold text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
                                        {btn}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={handleSend}
                                disabled={!message.trim() || addComment.isPending}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {addComment.isPending ? (
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <PaperAirplaneIcon className="w-3.5 h-3.5" />
                                )}
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export default function SupportPage() {
    const canRead  = useCapability(P.SUPPORT_READ);
    const canWrite = useCapability(P.SUPPORT_WRITE);

    const [activeTab, setActiveTab] = useState("all");
    const [selectedId, setSelectedId] = useState(null);
    const [showNewForm, setShowNewForm] = useState(false);

    const { data: tickets = [], isLoading } = useTickets();

    // Filter tickets by tab
    const filteredTickets = activeTab === "all"
        ? tickets
        : activeTab === "open"
            ? tickets.filter(t => t.status === "OPEN" || t.status === "IN_REVIEW" || t.status === "PENDING")
            : tickets.filter(t => t.status === "RESOLVED" || t.status === "CLOSED");

    if (!canRead) {
        return (
            <div className="p-8">
                <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-6 text-center">
                    <p className="text-sm text-red-400 font-medium">You don't have permission to access support tickets.</p>
                </div>
            </div>
        );
    }

    const TABS = [
        { key: "all", label: "All" },
        { key: "open", label: "Open" },
        { key: "resolved", label: "Resolved" },
    ];

    return (
        <div className="p-6 lg:p-8 h-[calc(100vh-120px)] space-y-4">
            <SettingsBreadcrumb current="Support Center" />
            <div className="h-full flex rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 overflow-hidden">

                {/* ── LEFT PANEL: Ticket List ────────────────────────────────── */}
                <div className="w-[360px] flex-shrink-0 border-r border-slate-800 flex flex-col">
                    {/* Header */}
                    <div className="px-5 pt-5 pb-3">
                        <div className="flex items-center justify-between mb-4">
                            <h1 className="text-lg font-bold text-white">Support Tickets</h1>
                            {canWrite && (
                                <button
                                    onClick={() => { setShowNewForm(true); setSelectedId(null); }}
                                    className="p-2 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors"
                                    title="New Ticket"
                                >
                                    <PlusIcon className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* Tabs */}
                        <div className="flex rounded-xl bg-slate-800/60 p-1">
                            {TABS.map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                        activeTab === tab.key
                                            ? "bg-blue-500/20 text-blue-400"
                                            : "text-slate-500 hover:text-slate-300"
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Ticket List */}
                    <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => <TicketSkeleton key={i} />)
                        ) : filteredTickets.length === 0 ? (
                            <div className="px-4 py-8 text-center">
                                <p className="text-sm text-slate-500">No tickets found.</p>
                            </div>
                        ) : (
                            filteredTickets.map(ticket => (
                                <TicketCard
                                    key={ticket.id}
                                    ticket={ticket}
                                    isActive={selectedId === ticket.id}
                                    onClick={(id) => { setSelectedId(id); setShowNewForm(false); }}
                                />
                            ))
                        )}
                    </div>
                </div>

                {/* ── RIGHT PANEL: Detail / Empty / New Form ─────────────────── */}
                <div className="flex-1 flex flex-col min-w-0">
                    {showNewForm ? (
                        <NewTicketForm
                            onClose={() => setShowNewForm(false)}
                            onCreated={() => {}}
                        />
                    ) : selectedId ? (
                        <TicketDetail ticketId={selectedId} canWrite={canWrite} />
                    ) : (
                        <EmptyState
                            onNewTicket={() => setShowNewForm(true)}
                            canWrite={canWrite}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
