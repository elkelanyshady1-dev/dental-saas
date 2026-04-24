/**
 * AssetCard.tsx — unified case-asset card.
 *
 * Replaces the earlier PhotoCard. The outer frame owns drag handling,
 * selection ring, hover actions (View / Share / Download), type badge,
 * and multi-drag count. The BODY is delegated to the file-type renderer
 * via `getRenderer(photo.fileType)` — a single dispatcher, no branches.
 *
 * 🚨 INVARIANTS (DO NOT BREAK):
 *   - Render only `photo.signedUrl` (never storageKey).
 *   - `photo.fileType` is backend-authoritative; never infer here.
 *   - Drag = LINK, never move.
 *   - Hover action set is uniform across file types.
 */

import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { Eye, Share2, Download, Check, RotateCcw, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PhotoDTO } from "./types";
import { getRenderer } from "./renderers";
import { useRetryAssetProcessing } from "../../../hooks/usePhotos";

const TYPE_ACCENT: Record<string, string> = {
    intraoral: "bg-blue-100 text-blue-700",
    extraoral: "bg-emerald-100 text-emerald-700",
    xray:      "bg-amber-100 text-amber-700",
    scan:      "bg-violet-100 text-violet-700",
    document:  "bg-rose-100 text-rose-700",
    stl:       "bg-violet-100 text-violet-700",
    dicom:     "bg-emerald-100 text-emerald-700",
};

export interface AssetCardProps {
    photo: PhotoDTO;
    onView: (photo: PhotoDTO) => void;
    onShare: (photo: PhotoDTO) => void;
    /** Select / toggle / range — panel handles modifiers. */
    onSelect?: (photo: PhotoDTO, event: React.MouseEvent) => void;
    selected?: boolean;
    /** Count shown in the DragOverlay preview on multi-drag. */
    selectionCount?: number;
    /** Set true while a panel-level mutation is in flight. */
    dragDisabled?: boolean;
}

const AssetCard: React.FC<AssetCardProps> = ({
    photo,
    onView,
    onShare,
    onSelect,
    selected = false,
    selectionCount,
    dragDisabled = false,
}) => {
    // Hooks must fire on every render, so we call useDraggable first and
    // apply the defensive filter guard on the output.
    const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
        id:       `photo:${photo.id}`,
        data:     { photoId: photo.id, caseId: photo.caseId },
        disabled: dragDisabled,
    });

    // 🚨 CONTRACT LOCK — fileType is backend-authoritative. If the DTO
    // arrives without one, something upstream is broken (stale migration,
    // legacy row, DTO drift). Surface loudly — both in the console AND
    // in the UI. Silent `return null` hides bugs; a visible banner keeps
    // them obvious until the DTO is fixed.
    if (!photo.fileType) {
        if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.error("[AssetCard] Missing photo.fileType — invalid asset", photo);
        }
        return (
            <div
                ref={setNodeRef}
                className="relative rounded-2xl aspect-[4/3] bg-rose-50 border border-rose-200 flex items-center justify-center px-3 text-center"
            >
                <p className="text-xs font-semibold text-rose-600">
                    Invalid asset (missing fileType)
                </p>
            </div>
        );
    }

    // Filtering is the panel's job — CasePhotosPanel.strictlyFilteredAssets
    // is the single source of truth. The card no longer performs a secondary
    // activeFileType check (double-filter bug) nor returns null silently.
    // Unknown / unregistered fileTypes route through the FallbackCard
    // renderer below, so the grid always renders a visible cell.
    const renderer = getRenderer(photo.fileType);
    const CardBody = renderer.CardBody;

    // U-CAP enterprise hardening §7.3 — retry hook for a failed thumbnail /
    // DICOM job. Only mounted for this card's retry affordance; the rest of
    // the grid continues to render unchanged. React Query invalidates the
    // photos list onSuccess so the pending skeleton replaces the fail state.
    const retry = useRetryAssetProcessing(photo.caseId);
    const handleRetry = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (retry.isPending) return;
        retry.mutate(photo.id, {
            onSuccess: () => toast.success("Retry queued"),
            onError:   (err: any) => toast.error(
                err?.response?.data?.error?.message ?? "Could not retry processing",
            ),
        });
    };

    const style: React.CSSProperties = {
        transform: transform
            ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
            : undefined,
        opacity: isDragging ? 0.5 : 1,
    };

    const typeBadge = TYPE_ACCENT[photo.metadata.type] ?? "bg-slate-100 text-slate-700";
    const ringClass = selected ? "ring-2 ring-blue-500 ring-offset-1" : "";

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!photo.signedUrl) return;
        const a = document.createElement("a");
        a.href = photo.signedUrl;
        if (photo.fileName) a.download = photo.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`group relative rounded-2xl overflow-hidden bg-slate-100 shadow-sm hover:shadow-md transition-shadow aspect-[4/3] cursor-grab active:cursor-grabbing ${ringClass}`}
            onClick={(e) => onSelect?.(photo, e)}
            {...attributes}
            {...listeners}
        >
            <CardBody photo={photo} />

            {/* Clinical-type badge (top-left) — drawn from metadata.type. */}
            <span
                className={`absolute top-2 left-2 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${typeBadge}`}
            >
                {photo.metadata.type}
            </span>

            {/* Selection marker (top-right). */}
            <span
                className={`absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-white transition-all ${
                    selected
                        ? "bg-blue-600 shadow-md opacity-100 scale-100"
                        : "bg-slate-900/40 opacity-0 group-hover:opacity-100 scale-90"
                }`}
                aria-hidden={!selected}
            >
                <Check className="w-3 h-3" strokeWidth={3} />
            </span>

            {/* Multi-drag count badge (DragOverlay preview only). */}
            {typeof selectionCount === "number" && selectionCount > 1 && (
                <span className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shadow-lg ring-2 ring-white">
                    {selectionCount}
                </span>
            )}

            {/* Processing progress — thin animated bar at the bottom
                while the self-worker is generating a thumbnail / parsing
                DICOM. Replaced by the failed overlay below when the
                worker gives up. */}
            {photo.processingStatus === "processing" && (
                <div className="absolute inset-x-0 bottom-0 bg-slate-900/70 px-2 py-1.5 flex items-center gap-2 text-[11px] font-semibold text-white">
                    <div className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
                        <div
                            className="h-full bg-blue-400 transition-all duration-300"
                            style={{ width: `${Math.max(5, photo.processingProgress ?? 0)}%` }}
                        />
                    </div>
                    <span className="tabular-nums">{photo.processingProgress ?? 0}%</span>
                </div>
            )}

            {/* §7.3 — Failed-processing overlay. Renders a retry affordance
                when the self-worker gave up on this asset's thumbnail /
                DICOM parse. Drag + hover actions still work so the user
                can link or remove a broken-preview asset without retrying. */}
            {photo.processingStatus === "failed" && (
                <div className="absolute inset-x-0 bottom-0 bg-rose-600/95 text-white px-2 py-1.5 flex items-center gap-2 text-[11px] font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1 truncate">Preview failed</span>
                    <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={handleRetry}
                        disabled={retry.isPending}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 disabled:opacity-50 transition-colors"
                        title="Retry thumbnail / DICOM processing"
                    >
                        {retry.isPending
                            ? <Loader2  className="w-3 h-3 animate-spin" />
                            : <RotateCcw className="w-3 h-3" />}
                        Retry
                    </button>
                </div>
            )}

            {/* Uniform hover actions — View / Share / Download for ALL types. */}
            <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end gap-1.5 p-2 pointer-events-none">
                <button
                    type="button"
                    className="pointer-events-auto p-2 rounded-full bg-white/95 text-slate-700 hover:bg-white hover:text-blue-600 shadow-sm"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onView(photo);
                    }}
                    title="View details"
                >
                    <Eye className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    className="pointer-events-auto p-2 rounded-full bg-white/95 text-slate-700 hover:bg-white hover:text-blue-600 shadow-sm"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onShare(photo);
                    }}
                    title="Share"
                >
                    <Share2 className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    className="pointer-events-auto p-2 rounded-full bg-white/95 text-slate-700 hover:bg-white hover:text-blue-600 shadow-sm disabled:opacity-50"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={handleDownload}
                    disabled={!photo.signedUrl}
                    title="Download"
                >
                    <Download className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export default AssetCard;
