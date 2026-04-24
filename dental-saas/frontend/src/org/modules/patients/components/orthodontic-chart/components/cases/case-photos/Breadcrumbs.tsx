/**
 * Breadcrumbs.tsx — folder path indicator for Case Assets.
 *
 * Derived, stateless: reads the active `selectedPoolId` and renders the
 * path. Clicking a segment navigates back up the hierarchy via
 * `onNavigate`. The last segment is static (already where we are).
 *
 * Examples
 *   selectedPoolId = { kind: "all" }
 *     →  Inbox
 *   selectedPoolId = { kind: "recordSet", refId: "..." }
 *     →  Inbox  ›  Record Sets  ›  Pre-treatment
 *   selectedPoolId = { kind: "visit", refId: "..." }
 *     →  Inbox  ›  Visits  ›  Visit #3
 *
 * The group label ("Record Sets" / "Visits") is NOT a navigable pool —
 * clicking it returns to Inbox (there is no "all record sets" selection).
 */

import React from "react";
import { ChevronRight } from "lucide-react";
import type { PoolDescriptor, PoolId } from "./types";

export interface BreadcrumbsProps {
    selectedPoolId: PoolId;
    recordSets:     PoolDescriptor[];
    visits:         PoolDescriptor[];
    onNavigate:     (id: PoolId) => void;
}

interface Segment {
    label:    string;
    onClick?: () => void;
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
    selectedPoolId,
    recordSets,
    visits,
    onNavigate,
}) => {
    const segments = _buildSegments(selectedPoolId, recordSets, visits, onNavigate);

    return (
        <nav aria-label="Folder breadcrumbs" className="flex items-center gap-1 text-xs text-slate-500 min-w-0">
            {segments.map((seg, i) => {
                const isLast = i === segments.length - 1;
                return (
                    <React.Fragment key={`${seg.label}-${i}`}>
                        {seg.onClick && !isLast ? (
                            <button
                                type="button"
                                onClick={seg.onClick}
                                className="px-1.5 py-0.5 rounded transition-colors hover:bg-slate-100 hover:text-slate-700 truncate max-w-[12rem]"
                            >
                                {seg.label}
                            </button>
                        ) : (
                            <span
                                className={`px-1.5 py-0.5 truncate max-w-[16rem] ${
                                    isLast ? "font-bold text-slate-900" : ""
                                }`}
                            >
                                {seg.label}
                            </span>
                        )}
                        {!isLast && <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />}
                    </React.Fragment>
                );
            })}
        </nav>
    );
};

function _buildSegments(
    selected:   PoolId,
    recordSets: PoolDescriptor[],
    visits:     PoolDescriptor[],
    onNavigate: (id: PoolId) => void,
): Segment[] {
    const inbox: Segment = { label: "Inbox", onClick: () => onNavigate({ kind: "all" }) };

    if (selected.kind === "all") {
        // Root-only: just the Inbox label (no crumb trail).
        return [{ label: "Inbox" }];
    }

    if (selected.kind === "recordSet") {
        const leaf = recordSets.find((p) => p.id.refId === selected.refId);
        return [
            inbox,
            { label: "Record Sets", onClick: () => onNavigate({ kind: "all" }) },
            { label: leaf?.label ?? "Record Set" },
        ];
    }

    if (selected.kind === "visit") {
        const leaf = visits.find((p) => p.id.refId === selected.refId);
        return [
            inbox,
            { label: "Visits", onClick: () => onNavigate({ kind: "all" }) },
            { label: leaf?.label ?? "Visit" },
        ];
    }

    return [{ label: "Inbox" }];
}

export default Breadcrumbs;
