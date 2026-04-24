/**
 * SLABadge — small pill showing deadline health for a lab case.
 *
 * Props:
 *   expectedDelivery: Date | string | null
 *   dense: boolean (smaller / icon only)
 */

import { ClockIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { getSLAStatus, daysUntil, slaLabel, SLA_TOKENS } from "../utils/sla";

export default function SLABadge({ expectedDelivery, dense = false }) {
    const status = getSLAStatus(expectedDelivery);
    const days   = daysUntil(expectedDelivery);
    const token  = SLA_TOKENS[status] || SLA_TOKENS.none;
    const urgent = status === "urgent" || status === "overdue";
    const Icon   = urgent ? ExclamationTriangleIcon : ClockIcon;

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full font-medium ${token} ${
                dense ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-[11px]"
            }`}
            title={expectedDelivery ? new Date(expectedDelivery).toLocaleString() : "No due date"}
        >
            <Icon className={dense ? "w-3 h-3" : "w-3.5 h-3.5"} />
            {slaLabel(status, days)}
        </span>
    );
}
