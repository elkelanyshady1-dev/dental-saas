/**
 * MessageThread.jsx — Conversation rendering
 *
 * Displays the ticket conversation. Accepts both shapes:
 *   - Embedded thread: ticket.conversationThread[] (legacy / forensic DTO)
 *   - Flat messages array (future TicketMessage-collection endpoint)
 *
 * The component is pure — parent owns data fetching and passes messages in.
 * Newest at the bottom (chat-style), matching how the user will reply.
 */

import { User, Shield } from "lucide-react";

function formatTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function senderLabel(msg) {
    // Supports both legacy (actorType) and E5 (sender) shapes.
    const s = (msg.sender || msg.actorType || "").toUpperCase();
    if (s === "PLATFORM_AGENT" || s === "PLATFORM") return { label: "Platform", isAgent: true };
    if (s === "SYSTEM")                              return { label: "System",   isAgent: false, system: true };
    return { label: "Organization", isAgent: false };
}

export default function MessageThread({ messages }) {
    const list = Array.isArray(messages) ? messages : [];

    if (list.length === 0) {
        return (
            <div className="text-center text-slate-500 text-sm py-8">
                No messages yet on this ticket.
            </div>
        );
    }

    return (
        <ul className="space-y-3">
            {list.map((msg, idx) => {
                const { label, isAgent, system } = senderLabel(msg);
                const Icon = isAgent ? Shield : User;
                const align = isAgent ? "items-end" : "items-start";
                const bubble = isAgent
                    ? "bg-blue-600/20 border-blue-500/30 text-blue-100"
                    : system
                        ? "bg-slate-700/20 border-slate-600/30 text-slate-300 italic"
                        : "bg-slate-800/60 border-slate-700 text-slate-100";

                return (
                    <li key={msg._id || msg.id || idx} className={`flex flex-col ${align}`}>
                        <div className={`max-w-[85%] rounded-xl border px-4 py-3 ${bubble}`}>
                            <div className="flex items-center gap-2 mb-1">
                                <Icon className="w-3 h-3 opacity-70" />
                                <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                                    {label}
                                </span>
                                <span className="text-[10px] opacity-60 ml-auto">
                                    {formatTime(msg.createdAt || msg.timestamp)}
                                </span>
                            </div>
                            <div className="text-sm whitespace-pre-wrap break-words">
                                {msg.message || msg.body || msg.text}
                            </div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
