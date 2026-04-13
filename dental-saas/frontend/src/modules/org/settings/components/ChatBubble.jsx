/**
 * ChatBubble.jsx — Conversation Message Bubble
 *
 * LEFT variant  → support_agent (gray bubble)
 * RIGHT variant → org_user (blue bubble)
 *
 * Uses DTO fields only: authorRole, message, createdAt
 */

import { UserCircleIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ChatBubble({ comment }) {
    const isAgent = comment.authorRole === "support_agent";

    return (
        <div className={`flex gap-3 max-w-[85%] ${isAgent ? "self-start" : "self-end flex-row-reverse"}`}>
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                isAgent
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-emerald-500/20 text-emerald-400"
            }`}>
                {isAgent
                    ? <ShieldCheckIcon className="w-4 h-4" />
                    : <UserCircleIcon className="w-4 h-4" />
                }
            </div>

            {/* Bubble */}
            <div className={`rounded-2xl px-4 py-3 ${
                isAgent
                    ? "bg-slate-800/80 border border-slate-700/50"
                    : "bg-blue-600/90 border border-blue-500/30"
            }`}>
                <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-xs font-semibold ${isAgent ? "text-blue-400" : "text-blue-100"}`}>
                        {isAgent ? "Support Agent" : "You"}
                    </span>
                    <span className={`text-[10px] ${isAgent ? "text-slate-500" : "text-blue-200/60"}`}>
                        {formatDate(comment.createdAt)} · {formatTime(comment.createdAt)}
                    </span>
                </div>
                <p className={`text-sm leading-relaxed ${isAgent ? "text-slate-300" : "text-white"}`}>
                    {comment.message}
                </p>
            </div>
        </div>
    );
}
