/**
 * ReplyBox.jsx — Composer for platform-agent replies
 *
 * Owns only the draft text (local UI state — not server state). Submission
 * flows through a parent-supplied mutation; the parent handles invalidation.
 * On 409 VERSION_CONFLICT the ticket detail query is already invalidated by
 * the mutation onError handler in the parent, so the next submit uses the
 * refreshed `expectedVersion`.
 */

import { useState } from "react";
import { Send, Loader2 } from "lucide-react";

const MAX_LENGTH = 5000;

export default function ReplyBox({ onSend, isSending, expectedVersion, canReply = true }) {
    const [draft, setDraft] = useState("");
    const [localError, setLocalError] = useState(null);

    const trimmed = draft.trim();
    const disabled =
        !canReply ||
        isSending ||
        trimmed.length === 0 ||
        trimmed.length > MAX_LENGTH;

    const submit = async (e) => {
        e.preventDefault();
        if (disabled) return;
        setLocalError(null);
        try {
            await onSend({ message: trimmed, expectedVersion });
            setDraft("");
        } catch (err) {
            setLocalError(err?.response?.data?.error?.message || err?.message || "Failed to send");
        }
    };

    return (
        <form onSubmit={submit} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
            {!canReply && (
                <div className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                    You don&apos;t have permission to reply to support tickets.
                </div>
            )}
            <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={canReply ? "Reply as platform support…" : "Read-only view"}
                rows={4}
                maxLength={MAX_LENGTH}
                disabled={!canReply || isSending}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-y disabled:opacity-60 disabled:cursor-not-allowed"
            />

            <div className="flex items-center justify-between">
                <div className="text-[10px] text-slate-500 tabular-nums">
                    {trimmed.length} / {MAX_LENGTH}
                </div>

                <div className="flex items-center gap-3">
                    {localError && (
                        <span className="text-xs text-red-300">{localError}</span>
                    )}
                    <button
                        type="submit"
                        disabled={disabled}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold transition-colors"
                    >
                        {isSending ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" /> Sending…
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4" /> Send reply
                            </>
                        )}
                    </button>
                </div>
            </div>
        </form>
    );
}
