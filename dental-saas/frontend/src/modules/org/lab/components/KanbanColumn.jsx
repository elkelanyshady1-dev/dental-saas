/**
 * KanbanColumn + KanbanCard — memoized subcomponents for LabKanban.
 *
 * Split out so that moving a card in column A does not re-render column B,
 * and so that selection-toggle bits stay cheap on boards with 1000+ cards.
 */

import { memo } from "react";
import CaseStatusBadge from "./CaseStatusBadge";
import SLABadge from "./SLABadge";
import { getSLAStatus } from "../utils/sla";

export const KanbanCard = memo(function KanbanCard({
    c,
    selected,
    pending,
    onToggleSelect,
    onDragStart,
    onClick,
}) {
    const sla = getSLAStatus(c.expectedDelivery);
    const borderTone =
        sla === "overdue" ? "border-red-300" :
        sla === "urgent"  ? "border-red-200" :
        "border-borderSubtle";

    return (
        <div
            draggable
            onDragStart={onDragStart}
            onClick={onClick}
            className={`relative bg-card rounded-xl border shadow-xs p-3 cursor-grab active:cursor-grabbing hover:shadow-card transition-shadow ${borderTone} ${selected ? "ring-2 ring-brand-clinical" : ""} ${pending ? "opacity-70" : ""}`}
        >
            <input
                type="checkbox"
                checked={selected}
                onChange={() => {}}
                onClick={onToggleSelect}
                className="absolute top-2 right-2 w-3.5 h-3.5 rounded border-border text-brand-clinical focus:ring-brand-clinical cursor-pointer"
                aria-label="Select case"
            />
            <div className="flex items-center justify-between pr-5">
                <span className="text-xs font-mono text-brand-clinical font-medium">
                    {c.caseCode}
                </span>
                <CaseStatusBadge status={c.status} />
            </div>
            <p className="text-sm font-medium text-text-primary mt-1.5 truncate">
                {c.patientDisplayName || c.patientName || "Unknown Patient"}
            </p>
            <p className="text-[11px] text-text-muted mt-0.5 truncate capitalize">
                {c.applianceType?.replace("_", " ")}
            </p>
            <div className="flex items-center justify-between mt-2.5 gap-2">
                <span className="text-[11px] text-text-muted truncate max-w-[55%]">
                    {c.labDisplayName || c.labName}
                </span>
                {c.expectedDelivery && (
                    <SLABadge expectedDelivery={c.expectedDelivery} dense />
                )}
            </div>
            {pending && (
                <div className="mt-2 flex items-center gap-1 text-[10px] text-brand-clinical">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-clinical animate-pulse" />
                    Saving…
                </div>
            )}
        </div>
    );
});

export const KanbanColumn = memo(function KanbanColumn({
    col,
    items,
    isDragTarget,
    onDragOver,
    onDrop,
    onCardDragStart,
    onCardClick,
    onCardToggleSelect,
    selectedIds,
    pendingIds,
    loading,
}) {
    const { icon: Icon, label, tint, key } = col;
    return (
        <div
            onDragOver={onDragOver}
            onDrop={onDrop}
            className={`bg-surface-low rounded-card p-3 min-h-[400px] transition-colors ${
                isDragTarget ? "ring-2 ring-brand-clinical/40 bg-brand-clinical-lt/60" : ""
            }`}
        >
            <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${tint}`}>
                        <Icon className="w-3.5 h-3.5 text-text-secondary" />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        {label}
                    </span>
                </div>
                <span className="text-[11px] font-semibold text-text-muted bg-card px-1.5 rounded-full">
                    {items.length}
                </span>
            </div>
            <div className="space-y-2">
                {loading && items.length === 0 && <SkeletonCard />}
                {!loading && items.length === 0 && (
                    <p className="text-[11px] text-text-subtle text-center py-6">
                        No cases
                    </p>
                )}
                {items.map((c) => (
                    <KanbanCard
                        key={c._id}
                        c={c}
                        selected={selectedIds.has(c._id)}
                        pending={pendingIds.has(c._id)}
                        onToggleSelect={(e) => onCardToggleSelect(c._id, e)}
                        onDragStart={() => onCardDragStart(c._id, key)}
                        onClick={() => onCardClick(c._id)}
                    />
                ))}
            </div>
        </div>
    );
}, (prev, next) => {
    // Re-render only when inputs relevant to THIS column change.
    return (
        prev.items === next.items &&
        prev.isDragTarget === next.isDragTarget &&
        prev.loading === next.loading &&
        prev.selectedIds === next.selectedIds &&
        prev.pendingIds === next.pendingIds &&
        prev.col === next.col &&
        prev.onDragOver === next.onDragOver &&
        prev.onDrop === next.onDrop &&
        prev.onCardDragStart === next.onCardDragStart &&
        prev.onCardClick === next.onCardClick &&
        prev.onCardToggleSelect === next.onCardToggleSelect
    );
});

function SkeletonCard() {
    return (
        <div className="bg-card rounded-xl p-3 animate-pulse">
            <div className="h-3 bg-surface-high rounded w-1/2 mb-2" />
            <div className="h-4 bg-surface-high rounded w-3/4 mb-1" />
            <div className="h-3 bg-surface-high rounded w-1/3" />
        </div>
    );
}
