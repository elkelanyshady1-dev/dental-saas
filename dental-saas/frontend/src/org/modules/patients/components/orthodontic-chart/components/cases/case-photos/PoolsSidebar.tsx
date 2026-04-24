/**
 * PoolsSidebar.tsx — Drive-level folder tree for Case Assets.
 *
 * Tree shape (U-CAP §2):
 *   Inbox                       ← root, always visible
 *   📁 Record Sets              ← collapsible section header
 *   │   Pre-treatment           ← leaf (droppable)
 *   │   Mid-treatment
 *   │   Post-treatment
 *   🗂 Visits                   ← collapsible section header
 *   │   Visit #1
 *   │   Visit #2
 *
 * Pool kinds (unchanged):
 *   - "all"       — Inbox: logical root pool, undroppable.
 *   - "recordSet" — CaseRecordSet leaf, droppable = LINK target.
 *   - "visit"     — VisitRecord leaf, droppable = LINK target.
 *
 * Each pool row is a @dnd-kit droppable. When an asset is hovered over a
 * pool during drag, the row highlights and shows the LINK intent (not
 * "move" — the asset is referenced, never duplicated).
 */

import React, { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
    Images,
    FolderKanban,
    Stethoscope,
    ChevronRight,
    ChevronDown,
} from "lucide-react";
import type { PoolDescriptor, PoolId } from "./types";
import { serializePoolId } from "./types";

export interface PoolsSidebarProps {
    allPhotosCount: number;
    recordSets: PoolDescriptor[];
    visits: PoolDescriptor[];
    selectedPoolId: PoolId;
    onSelect: (id: PoolId) => void;
}

const PoolsSidebar: React.FC<PoolsSidebarProps> = ({
    allPhotosCount,
    recordSets,
    visits,
    selectedPoolId,
    onSelect,
}) => {
    // U-CAP §2 — collapsible tree nodes. Auto-expand the branch that
    // contains the currently-selected pool so the user's context is
    // always visible after navigation.
    const [recordSetsOpen, setRecordSetsOpen] = useState<boolean>(
        () => selectedPoolId.kind === "recordSet" || true,
    );
    const [visitsOpen,     setVisitsOpen]     = useState<boolean>(
        () => selectedPoolId.kind === "visit" || true,
    );

    return (
        <aside className="w-64 shrink-0 bg-slate-50 border-r border-slate-200 h-full overflow-y-auto py-4">
            <div className="px-4 pb-3">
                <h2 className="text-sm font-bold tracking-wide text-slate-900 uppercase">
                    Case Assets
                </h2>
                <p className="mt-1 text-[11px] text-slate-500 leading-tight">
                    Organise assets by record set or visit
                </p>
            </div>

            {/* Inbox — root. Single source of truth for uploads. Not droppable:
                dragging INTO this pool is a no-op, drag is always *out* to a
                RecordSet / Visit to create a link. */}
            <PoolRow
                poolId={{ kind: "all" }}
                label="Inbox"
                count={allPhotosCount}
                icon={<Images className="w-4 h-4" />}
                selected={selectedPoolId.kind === "all"}
                onSelect={onSelect}
                droppable={false}
                depth={0}
            />

            {/* Record Sets branch */}
            <TreeBranch
                label="Record Sets"
                icon={<FolderKanban className="w-3.5 h-3.5" />}
                open={recordSetsOpen}
                onToggle={() => setRecordSetsOpen((v) => !v)}
                count={recordSets.length}
            />
            {recordSetsOpen && (
                recordSets.length === 0 ? (
                    <p className="pl-10 pr-4 py-1.5 text-xs text-slate-400 italic">No record sets</p>
                ) : (
                    recordSets.map((rs) => (
                        <PoolRow
                            key={serializePoolId(rs.id)}
                            poolId={rs.id}
                            label={rs.label}
                            count={rs.count}
                            selected={
                                selectedPoolId.kind === rs.id.kind &&
                                selectedPoolId.refId === rs.id.refId
                            }
                            onSelect={onSelect}
                            droppable
                            depth={1}
                        />
                    ))
                )
            )}

            {/* Visits branch */}
            <TreeBranch
                label="Visits"
                icon={<Stethoscope className="w-3.5 h-3.5" />}
                open={visitsOpen}
                onToggle={() => setVisitsOpen((v) => !v)}
                count={visits.length}
            />
            {visitsOpen && (
                visits.length === 0 ? (
                    <p className="pl-10 pr-4 py-1.5 text-xs text-slate-400 italic">No linked visits</p>
                ) : (
                    visits.map((v) => (
                        <PoolRow
                            key={serializePoolId(v.id)}
                            poolId={v.id}
                            label={v.label}
                            count={v.count}
                            selected={
                                selectedPoolId.kind === v.id.kind &&
                                selectedPoolId.refId === v.id.refId
                            }
                            onSelect={onSelect}
                            droppable
                            depth={1}
                        />
                    ))
                )
            )}
        </aside>
    );
};

// ── Sub-components ──────────────────────────────────────────────────────────

/**
 * TreeBranch — collapsible header for a section of the tree. Clicking the
 * row toggles expand/collapse (section-only nav — the header is NOT a
 * navigable pool; leaves underneath are). Keeps the caret consistent with
 * a standard file-tree pattern (chevron-right when collapsed,
 * chevron-down when open).
 */
const TreeBranch: React.FC<{
    label: string;
    icon: React.ReactNode;
    open: boolean;
    onToggle: () => void;
    count: number;
}> = ({ label, icon, open, onToggle, count }) => (
    <button
        type="button"
        onClick={onToggle}
        className="group mt-3 w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-700"
    >
        <span className="w-4 flex items-center justify-center opacity-70">
            {open
                ? <ChevronDown  className="w-3.5 h-3.5" />
                : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
        <span className="shrink-0 opacity-70">{icon}</span>
        <span className="flex-1 text-left truncate">{label}</span>
        <span className="text-[10px] text-slate-400 tabular-nums">{count}</span>
    </button>
);

interface PoolRowProps {
    poolId: PoolId;
    label: string;
    count: number;
    icon?: React.ReactNode;
    selected: boolean;
    onSelect: (id: PoolId) => void;
    droppable: boolean;
    /** Tree depth: 0 = root (Inbox), 1 = leaves under a branch. Controls indent. */
    depth?: number;
}

const PoolRow: React.FC<PoolRowProps> = ({
    poolId,
    label,
    count,
    icon,
    selected,
    onSelect,
    droppable,
    depth = 0,
}) => {
    const dropId = `pool:${serializePoolId(poolId)}`;
    // Phase — register EVERY pool as droppable so we can render isOver
    // feedback, including the "blocked" red-ring state on root. The
    // drop handler in CasePhotosPanel reads `droppable` from data to
    // decide whether to accept or reject.
    const { isOver, setNodeRef } = useDroppable({
        id:   dropId,
        data: { kind: poolId.kind, refId: poolId.refId, label, droppable },
    });

    const base = "group flex items-center gap-2 w-full text-left py-2 text-sm transition-colors relative";
    // U-CAP §2 — tree indent. Depth 0 = 16px (root), depth 1 = 40px (leaves).
    const indent = depth >= 1 ? "pl-10 pr-4" : "pl-4 pr-4";
    const state = selected
        ? "bg-blue-50 text-blue-700 font-semibold"
        : "text-slate-700 hover:bg-slate-100";
    const dropState =
        isOver && droppable
            ? "ring-2 ring-inset ring-blue-400 bg-blue-50 cursor-copy"
            : isOver && !droppable
                ? "ring-2 ring-inset ring-rose-400 bg-rose-50 cursor-not-allowed"
                : "";

    return (
        <button
            ref={setNodeRef}
            type="button"
            className={`${base} ${indent} ${state} ${dropState}`}
            onClick={() => onSelect(poolId)}
        >
            {icon ? <span className="shrink-0 opacity-70">{icon}</span> : <span className="w-4 shrink-0" />}
            <span className="flex-1 truncate">{label}</span>
            <span
                className={`text-[11px] tabular-nums ${
                    selected ? "text-blue-600" : "text-slate-400"
                }`}
            >
                {count}
            </span>

            {/* Drag-over tooltip — link intent (allowed) vs blocked. */}
            {isOver && droppable && (
                <span className="absolute left-1/2 -translate-x-1/2 -bottom-1 translate-y-full z-10 whitespace-nowrap rounded-md bg-blue-600 text-white text-[10px] font-semibold px-2 py-1 shadow-md pointer-events-none">
                    + Link to {label}
                </span>
            )}
            {isOver && !droppable && (
                <span className="absolute left-1/2 -translate-x-1/2 -bottom-1 translate-y-full z-10 whitespace-nowrap rounded-md bg-rose-600 text-white text-[10px] font-semibold px-2 py-1 shadow-md pointer-events-none">
                    Cannot drop here
                </span>
            )}
        </button>
    );
};

export default PoolsSidebar;
