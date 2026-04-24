/**
 * TicketDetails.jsx — Platform-agent ticket detail view
 *
 * Uses the forensic endpoint which returns the full ticket DTO including the
 * conversation thread and linked billing context. Reply submission goes
 * through useAddMessage which invalidates both the detail + list keys.
 *
 * Version conflict (409) on reply: the mutation error bubbles to ReplyBox,
 * and the detail invalidation refreshes `expectedVersion` for the next try.
 *
 * PLANE: Platform
 */

import { useParams, Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Loader2, Clock, Tag, Building2 } from "lucide-react";
import MessageThread from "../components/MessageThread";
import ReplyBox from "../components/ReplyBox";
import { useTicket, useAddMessage, normalizeMessages } from "../hooks/useSupport";
import { usePlatformCapabilities } from "../../../hooks/usePlatformCapabilities";

function formatDateTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function MetaRow({ icon: Icon, label, value }) {
    return (
        <div className="flex items-center gap-2 text-xs">
            <Icon className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                {label}
            </span>
            <span className="text-slate-200 font-mono">{value || "—"}</span>
        </div>
    );
}

export default function TicketDetails() {
    const { ticketId } = useParams();
    const ticketQuery = useTicket(ticketId);
    // No list filters on the detail route — detail-only mutation; the list
    // page will refresh via its own staleTime on next visit. If we ever
    // embed the detail inside the list view, thread `listFilters` through.
    const addMessage = useAddMessage(ticketId);
    const { hasCapability } = usePlatformCapabilities();

    // Write capability — backend enforces MANAGE_ORGANIZATIONS on reply /
    // assign endpoints. Without this gate the reply button would submit
    // and then surface a 403 to the user, which is a UX violation.
    const canReply = hasCapability("MANAGE_ORGANIZATIONS");

    const payload = ticketQuery.data;
    // Accept either { data: ticket } envelope or bare ticket.
    const ticket = payload?.data || payload || null;

    // Single normalization entry point (see useSupport.normalizeMessages).
    // Handles both legacy `conversationThread` and E5 `messages` shapes.
    const messages = normalizeMessages(ticket);
    const expectedVersion = ticket?.version ?? 0;

    return (
        <div className="p-6 space-y-6 max-w-5xl mx-auto">
            {/* Back link */}
            <Link
                to="/platform/support"
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
            >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to tickets
            </Link>

            {/* Loading */}
            {ticketQuery.isLoading && (
                <div className="flex items-center gap-2 text-slate-400 text-sm p-8 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading ticket…
                </div>
            )}

            {/* Error */}
            {ticketQuery.isError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-red-300 text-sm flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                        <div className="font-semibold">Failed to load ticket</div>
                        <div className="text-xs mt-1 text-red-200/80">
                            {ticketQuery.error?.message || "Unknown error"}
                        </div>
                    </div>
                </div>
            )}

            {/* Detail */}
            {ticket && (
                <>
                    <header className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
                        <h1 className="text-xl font-bold text-white mb-3">
                            {ticket.subject || "(no subject)"}
                        </h1>
                        <p className="text-sm text-slate-300 whitespace-pre-wrap">
                            {ticket.description || ""}
                        </p>

                        <div className="mt-5 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <MetaRow icon={Building2} label="Organization" value={ticket.organizationName || String(ticket.organizationId || "").slice(-8)} />
                            <MetaRow icon={Tag}       label="Category"     value={ticket.category} />
                            <MetaRow icon={Tag}       label="Priority"     value={ticket.priority} />
                            <MetaRow icon={Tag}       label="Status"       value={ticket.status} />
                            <MetaRow icon={Clock}     label="Created"      value={formatDateTime(ticket.createdAt)} />
                            <MetaRow icon={Clock}     label="SLA deadline" value={formatDateTime(ticket.slaDeadline)} />
                        </div>
                    </header>

                    <section>
                        <h2 className="text-sm font-bold text-white mb-3 uppercase tracking-wider">
                            Conversation
                        </h2>
                        <MessageThread messages={messages} />
                    </section>

                    <ReplyBox
                        onSend={(body) => addMessage.mutateAsync(body)}
                        isSending={addMessage.isPending}
                        expectedVersion={expectedVersion}
                        canReply={canReply}
                    />
                </>
            )}
        </div>
    );
}
