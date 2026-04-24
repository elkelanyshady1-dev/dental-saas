/**
 * RecallCard — Single recall row used in DayView and as the chip drilldown
 * target in WeekView / MonthView.
 *
 * Capability gating is per-action (not per-card): a user with recalls.read
 * but no recalls.update sees the card and the patient info but no Convert
 * or Cancel buttons. Convert additionally requires appointments.create
 * because the chained flow opens CreateAppointmentDrawer.
 */

import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import StatusPill from "./StatusPill";
import { isOverdue } from "../utils/dateRange";

function fmtDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (!Number.isFinite(dt.getTime())) return "—";
    return dt.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
}

export default function RecallCard({
    recall,
    onConvert,
    onCancel,
    isMutating = false,
    compact = false,
}) {
    const canUpdate = useCapability(P.RECALLS_UPDATE);
    const canCreateAppointment = useCapability(P.APPOINTMENTS_CREATE);

    const overdue = isOverdue(recall);
    const patientName = recall.patient?.name || "Unknown patient";
    const contact =
        recall.patient?.phone ||
        recall.patient?.email ||
        "No contact info";
    const branchName = recall.branch?.name || "—";

    const isTerminal = recall.status === "booked" || recall.status === "cancelled";

    return (
        <article
            className={[
                "group bg-white rounded-xl border border-[#c3c6d7]/40 shadow-sm",
                "hover:border-[#004ac6]/30 hover:shadow-md transition-all",
                recall._optimistic ? "opacity-60" : "",
                compact ? "p-3" : "p-4",
            ].join(" ")}
            aria-label={`Recall for ${patientName}`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className={`font-semibold text-[#0f172a] truncate ${compact ? "text-sm" : "text-base"}`}>
                            {patientName}
                        </h3>
                        <StatusPill status={recall.status} overdue={overdue} />
                    </div>
                    <p className="text-xs text-[#737686] mb-2">
                        {contact} · {branchName}
                    </p>
                    <p className="text-xs text-[#434655]">
                        Due <span className="font-medium">{fmtDate(recall.dueDate)}</span>
                        {recall.reason && (
                            <>
                                {" · "}
                                <span className="italic">{recall.reason}</span>
                            </>
                        )}
                    </p>
                </div>
            </div>

            {!isTerminal && (canUpdate || canCreateAppointment) && (
                <div className="mt-3 flex items-center gap-2">
                    {canUpdate && canCreateAppointment && (
                        <button
                            type="button"
                            onClick={() => onConvert?.(recall)}
                            disabled={isMutating || recall._optimistic}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#004ac6] text-white hover:bg-[#003ba0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Convert to Appointment
                        </button>
                    )}
                    {canUpdate && (
                        <button
                            type="button"
                            onClick={() => onCancel?.(recall)}
                            disabled={isMutating || recall._optimistic}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[#c3c6d7]/60 text-[#434655] hover:bg-[#f6f7fb] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            )}
        </article>
    );
}
