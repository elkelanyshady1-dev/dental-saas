/**
 * CasePhotosPanel.tsx — root orchestrator for the Case Photo Pool UI.
 *
 * Google-Drive-style interactions:
 *   - Click       → single select
 *   - Ctrl/Cmd    → toggle in selection
 *   - Shift       → range select (anchor-based)
 *   - Drag selected → drag ALL selected to a pool (batch link)
 *   - Grid / Timeline view toggle
 *   - Upload button
 *
 * 🚨 SYSTEM INVARIANTS (DO NOT BREAK)
 *   - UI renders ONLY signedUrl (never storageKey, never raw url)
 *   - Drag & Drop = LINKING, not moving.
 *   - No manual refetch() — React Query invalidation only.
 *   - No local mutation of the photo list; server is authoritative.
 *   - Framer Motion handles animation. @dnd-kit handles drag logic.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    type DragStartEvent,
    type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import {
    LayoutGrid,
    CalendarClock,
    Upload,
    Loader2,
    AlertCircle,
    ShieldAlert,
    RefreshCw,
    Images,
    Archive,
} from "lucide-react";

import {
    useCasePhotos,
    useLinkPhotoToRecordSet,
    useLinkPhotoToVisit,
    useDeletePhoto,
    useUploadPhoto,
    useCaseExport,
    type PhotoDTO,
    type PhotoType,
} from "../../../hooks/usePhotos";
import { useAssetRealtime } from "../../../hooks/useAssetRealtime";
import { useCaseRecordSets } from "../../../hooks/useCaseRecordSets";
import { useCaseVisits }     from "../../../hooks/useCaseVisits";

import PoolsSidebar from "./PoolsSidebar";
import PhotoGrid from "./PhotoGrid";
import AssetCard from "./AssetCard";
import PhotoDrawer from "./PhotoDrawer";
import ShareModal from "./ShareModal";
import SmartEmptySuggestions from "./SmartEmptySuggestions";
import BatchActionBar from "./BatchActionBar";
import BatchLinkModal from "./BatchLinkModal";
import Breadcrumbs from "./Breadcrumbs";
import type { PoolDescriptor, PoolId, FileTypeFilter } from "./types";

// Dev-time dependency guard.
if (process.env.NODE_ENV !== "production") {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require.resolve("@dnd-kit/core");
    } catch {
        // eslint-disable-next-line no-console
        console.error(
            "Missing dependency: @dnd-kit/core — run `npm install @dnd-kit/core`"
        );
    }
}

// 24-char ObjectId guard — drop targets must resolve to a real
// CaseRecordSet / VisitRecord _id.
const isValidObjectId = (id: string | undefined | null): id is string =>
    typeof id === "string" && /^[a-f\d]{24}$/i.test(id);

type ViewMode = "grid" | "timeline";

// Clinical-tag inference for `metadata.type` at upload time.
// NOTE: this is NOT fileType inference — fileType is backend-authoritative
// (server infers from MIME and stamps it on the Photo document). This
// helper only picks a starting metadata.type value; the user can
// reclassify later through a future edit flow.
function detectType(file: File): PhotoType {
    const m = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    if (m.includes("pdf")              || name.endsWith(".pdf"))  return "document";
    if (m.includes("msword")           || m.includes("wordprocessingml")) return "document";
    if (m.includes("ms-powerpoint")    || m.includes("presentationml"))   return "document";
    if (name.endsWith(".doc")  || name.endsWith(".docx")) return "document";
    if (name.endsWith(".ppt")  || name.endsWith(".pptx")) return "document";
    if (m.includes("dicom") || name.endsWith(".dcm")) return "dicom";
    if (m.includes("stl")   || m.includes("model/") || name.endsWith(".stl")) return "stl";
    return "intraoral";
}

export interface CasePhotosPanelProps {
    caseId: string;
    /** Controlled file-type filter owned by the parent header. Defaults
        to "all" for standalone usage (tests, direct mounts). */
    fileTypeFilter?: FileTypeFilter;
}

const CasePhotosPanel: React.FC<CasePhotosPanelProps> = ({
    caseId,
    fileTypeFilter = "all",
}) => {
    // ── Server state ────────────────────────────────────────────────────────
    const {
        data: photos = [],
        isLoading,
        isError,
        error,
        refetch,
    } = useCasePhotos(caseId);
    const { data: recordSets = [] } = useCaseRecordSets(caseId);
    const { data: visits = [] }     = useCaseVisits(caseId);

    const linkToRecordSet = useLinkPhotoToRecordSet(caseId);
    const linkToVisit     = useLinkPhotoToVisit(caseId);
    const deletePhoto     = useDeletePhoto(caseId);
    const uploadPhoto     = useUploadPhoto(caseId);
    const caseExport      = useCaseExport(caseId);

    // U-CAP Part 1 — realtime job progress from the org socket room.
    // Surgically patches the photos cache in place; polling
    // (useCasePhotos.refetchInterval: 50s) remains as disconnect
    // fallback so the UI still converges if sockets drop.
    useAssetRealtime(caseId);

    // ── Local UI state ──────────────────────────────────────────────────────
    const [selectedPoolId, setSelectedPoolId] = useState<PoolId>({ kind: "all" });
    const [viewMode, setViewMode]             = useState<ViewMode>("grid");
    // Phase — file-type filter is now CONTROLLED by the parent (OrthoCasesTab
    // renders the segmented tabs in its header). The prop is consumed directly
    // — no internal state to keep in sync.

    // Selection state — multi-select with Ctrl/Cmd + Shift support.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
    const [anchorId, setAnchorId]       = useState<string | null>(null);
    // IDs being dragged in the current drag gesture (may be >1 via multi-select).
    const [draggingIds, setDraggingIds] = useState<string[]>([]);

    const [viewingPhoto,  setViewingPhoto]  = useState<PhotoDTO | null>(null);
    const [sharingPhoto,  setSharingPhoto]  = useState<PhotoDTO | null>(null);
    const [draggingPhoto, setDraggingPhoto] = useState<PhotoDTO | null>(null);

    // U-CAP §4 — batch ops. The link modal opens from the floating action
    // bar that appears when selectedIds.size > 0. `batchBusy` covers the
    // delete-batch path so the bar can visually disable.
    const [batchLinkOpen, setBatchLinkOpen] = useState(false);
    const [batchBusy,     setBatchBusy]     = useState(false);

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Batch upload guard — `uploadPhoto.isPending` flips between files in a
    // sequential loop, so a user could briefly re-trigger the picker mid-batch.
    // This flag covers the entire batch.
    const [isBatchUploading, setIsBatchUploading] = useState(false);
    // Upload progress view — drives the blue bar in the header during
    // single-file uploads. Keyed by file index so consecutive uploads
    // overwrite cleanly.
    const [uploadProgress, setUploadProgress] = useState<{
        file: string;
        pct:  number;
        index: number;
        total: number;
    } | null>(null);

    // Selection hygiene — photos refetched after delete / link / unlink may
    // no longer contain every id in `selectedIds`. Drop the stale entries and
    // reset the anchor if it vanished. Skip the setter when nothing changed
    // so we don't trigger an empty re-render loop.
    useEffect(() => {
        const valid = new Set(photos.map((p) => p.id));
        setSelectedIds((prev) => {
            let changed = false;
            const next = new Set<string>();
            for (const id of prev) {
                if (valid.has(id)) next.add(id);
                else changed = true;
            }
            return changed ? next : prev;
        });
        setAnchorId((prev) => (prev && valid.has(prev) ? prev : null));
    }, [photos]);

    // ── Pool descriptors (logical views) ────────────────────────────────────
    const recordSetPools = useMemo<PoolDescriptor[]>(() => {
        return (recordSets ?? [])
            .filter((rs) => isValidObjectId(rs.id))
            .map((rs) => {
                const refId = rs.id;
                const count = photos.filter((p) => p.linkedRecordSetIds.includes(refId)).length;
                return {
                    id:     { kind: "recordSet", refId },
                    label:  rs.label,
                    count,
                    accent: "blue",
                };
            });
    }, [recordSets, photos]);

    const visitPools = useMemo<PoolDescriptor[]>(() => {
        const byVisit = new Map<string, number>();
        for (const p of photos) {
            for (const vid of p.linkedVisitIds) {
                byVisit.set(vid, (byVisit.get(vid) ?? 0) + 1);
            }
        }
        return (visits ?? [])
            .filter((v) => isValidObjectId(v.id))
            .map((v) => ({
                id:     { kind: "visit", refId: v.id },
                label:  v.label,
                count:  byVisit.get(v.id) ?? 0,
                accent: "amber",
            }));
    }, [visits, photos]);

    // ── Active pool filter ──────────────────────────────────────────────────
    const poolScopedPhotos = useMemo(() => {
        if (selectedPoolId.kind === "all") return photos;
        if (selectedPoolId.kind === "recordSet") {
            return photos.filter((p) =>
                p.linkedRecordSetIds.includes(selectedPoolId.refId ?? "")
            );
        }
        if (selectedPoolId.kind === "visit") {
            return photos.filter((p) =>
                p.linkedVisitIds.includes(selectedPoolId.refId ?? "")
            );
        }
        return photos;
    }, [photos, selectedPoolId]);

    // 🚨 PRODUCTION LOCK — strict file-type isolation.
    //   `fileType` is backend-authoritative (Photo.model requires it).
    //
    //   U-CAP §9 — legacy / broken-DTO assets (missing fileType) are NOT
    //   silently filtered. On the "all" tab they surface so AssetCard's
    //   visible "Invalid asset (missing fileType)" banner fires; on a
    //   type-specific tab they're naturally excluded because
    //   `undefined === "image"` is false. This preserves the rule:
    //     "Legacy data → Appears as invalid asset, not misclassified."
    const strictlyFilteredAssets = useMemo(() => {
        if (!fileTypeFilter || fileTypeFilter === "all") return poolScopedPhotos;
        return poolScopedPhotos.filter((asset) => asset.fileType === fileTypeFilter);
    }, [poolScopedPhotos, fileTypeFilter]);

    // Dev-only invariant & observability. console.table makes the filter
    // visible to the inspector; the breach log fires if any asset slipped
    // past the strict filter (should never happen — belt + suspenders).
    if (process.env.NODE_ENV !== "production") {
        const breach = strictlyFilteredAssets.filter(
            (a) =>
                !a.fileType ||
                (fileTypeFilter && fileTypeFilter !== "all" && a.fileType !== fileTypeFilter)
        );
        if (breach.length > 0) {
            // eslint-disable-next-line no-console
            console.error("[CasePhotosPanel] FILTER BREACH", breach);
        }
        // U-CAP §10 — unified observability sink. Lightweight single-line
        // log replaces the earlier console.table noise; inspectors can read
        // exactly what the panel sees on every render.
        // eslint-disable-next-line no-console
        console.log("[ASSET_SYSTEM]", {
            total:    photos.length,
            filtered: strictlyFilteredAssets.length,
            selected: selectedIds.size,
            folder:   selectedPoolId,
            filter:   fileTypeFilter,
        });
    }

    // Hardening §1 — one-shot CASE_ASSETS_DEBUG summary. Fires whenever the
    // source set, the filtered subset, or the active filter changes so a
    // developer watching the console can confirm SmartEmptySuggestions only
    // appears when it should (filtered subset is genuinely empty), NOT when
    // real data was silently dropped. This is belt-and-suspenders on top of
    // the strict-filter breach log above.
    useEffect(() => {
        if (process.env.NODE_ENV !== "production") {
            // eslint-disable-next-line no-console
            console.log("CASE_ASSETS_DEBUG", {
                caseId,
                totalPhotos: photos.length,
                filtered:    strictlyFilteredAssets.length,
                filter:      fileTypeFilter,
                sample: photos.slice(0, 5).map((p) => ({
                    id:       p.id,
                    fileType: p.fileType,
                    mime:     p.mimeType,
                })),
            });
        }
    }, [caseId, photos, strictlyFilteredAssets, fileTypeFilter]);

    // Stable visible ordering — used as the anchor/target index space for
    // range-select. Same ordering the grid renders, so Shift+click is
    // positionally intuitive.
    const visibleOrdered = strictlyFilteredAssets;

    // ── Selection handler ───────────────────────────────────────────────────
    const handleSelect = (photo: PhotoDTO, event: React.MouseEvent) => {
        const id = photo.id;
        if (event.shiftKey && anchorId) {
            // Range select from anchor → id across the VISIBLE ordered list.
            const idx = visibleOrdered.findIndex((p) => p.id === id);
            const anchorIdx = visibleOrdered.findIndex((p) => p.id === anchorId);
            if (idx === -1 || anchorIdx === -1) {
                // Anchor not in current filter — fall back to single select.
                setSelectedIds(new Set([id]));
                setAnchorId(id);
                return;
            }
            const [lo, hi] = idx < anchorIdx ? [idx, anchorIdx] : [anchorIdx, idx];
            const next = new Set<string>();
            for (let i = lo; i <= hi; i++) next.add(visibleOrdered[i].id);
            setSelectedIds(next);
            // Anchor stays put on shift-click.
            return;
        }
        if (event.metaKey || event.ctrlKey) {
            setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            });
            setAnchorId(id);
            return;
        }
        // Plain click → single select.
        setSelectedIds(new Set([id]));
        setAnchorId(id);
    };

    // ── DnD sensors ─────────────────────────────────────────────────────────
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
    );

    const handleDragStart = (event: DragStartEvent) => {
        const photoId = String(event.active.data.current?.photoId ?? "");
        const photo = photos.find((p) => p.id === photoId) ?? null;
        setDraggingPhoto(photo);

        // Multi-drag rule:
        //   - If the dragged photo IS in the current selection → drag all selected.
        //   - If it is NOT selected → drag just that one (and do NOT disturb selection).
        const ids = selectedIds.has(photoId)
            ? Array.from(selectedIds)
            : [photoId];
        setDraggingIds(ids);
    };

    const resetDragState = () => {
        setDraggingPhoto(null);
        setDraggingIds([]);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const over = event.over;
        const ids = draggingIds.length > 0
            ? draggingIds
            : [String(event.active.data.current?.photoId ?? "")];
        resetDragState();
        if (!over) return;

        const targetKind  = over.data.current?.kind  as string | undefined;
        const targetRefId = over.data.current?.refId as string | undefined;
        const targetLabel = (over.data.current?.label as string | undefined) ?? "pool";
        const targetAllowed = over.data.current?.droppable !== false;

        // Phase — explicit drop-into-root rejection with user feedback.
        // Root ("Other Photos") is registered droppable for isOver styling
        // but is NOT a valid link target. Show a toast, don't silently
        // no-op like the earlier ObjectId-invalid fallback would.
        if (targetKind === "all" || !targetAllowed) {
            toast.error("Cannot link to Inbox");
            return;
        }

        if (!targetKind || !isValidObjectId(targetRefId)) return;
        // De-dup + ObjectId filter + drop ids whose photo is no longer in
        // the dataset (delete-during-drag race). Prevents duplicate /
        // dangling link calls.
        const presentIds = new Set(photos.map((p) => p.id));
        const validIds = [...new Set(
            ids.filter((id) => isValidObjectId(id) && presentIds.has(id))
        )];
        if (validIds.length === 0) return;

        // allSettled so a single failure doesn't mask N-1 successes. We
        // report real counts back to the user instead of "all failed".
        let promises: Promise<unknown>[];
        if (targetKind === "recordSet") {
            promises = validIds.map((photoId) =>
                linkToRecordSet.mutateAsync({ photoId, recordSetId: targetRefId })
            );
        } else if (targetKind === "visit") {
            promises = validIds.map((photoId) =>
                linkToVisit.mutateAsync({ photoId, visitId: targetRefId })
            );
        } else {
            return;
        }

        const results = await Promise.allSettled(promises);
        const ok     = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.length - ok;

        if (ok > 0 && failed === 0) {
            toast.success(
                ok === 1
                    ? `Linked to ${targetLabel}`
                    : `${ok} photos linked to ${targetLabel}`
            );
        } else if (ok > 0 && failed > 0) {
            toast.warning(`${ok} linked to ${targetLabel} (${failed} failed)`);
        } else {
            // All failed — surface the first reason if we can.
            const firstReason =
                (results[0] as PromiseRejectedResult | undefined)?.reason;
            const msg =
                firstReason?.response?.data?.error?.message ??
                firstReason?.message ??
                "Could not link photos. Please retry.";
            toast.error(msg);
        }
    };

    // ── Drawer + modal callbacks ────────────────────────────────────────────
    const handleViewPhoto   = (p: PhotoDTO) => setViewingPhoto(p);
    const handleSharePhoto  = (p: PhotoDTO) => setSharingPhoto(p);

    // ── U-CAP §4 — batch actions ─────────────────────────────────────────────
    // handleBatchShare: single ShareModal flow is asset-scoped; for batch we
    // open the modal on the first selected and notify the user that batch
    // sharing is queued per asset. This keeps the existing ShareModal intact
    // while surfacing the feature at selection time.
    // handleExportCase: U-CAP §5 — download a ZIP bundle. Selection-aware:
    // selectedIds.size > 0 → export that subset; otherwise export the
    // whole case. The hook handles the blob → download dance.
    const handleExportCase = async () => {
        if (caseExport.isPending) return;
        const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
        try {
            const result = await caseExport.mutateAsync({ assetIds: ids });
            const count  = ids?.length ?? photos.length;
            const mb     = (result.bytes / (1024 * 1024)).toFixed(1);
            toast.success(
                `Exported ${count} asset${count === 1 ? "" : "s"} · ${mb} MB`,
            );
        } catch (err: any) {
            const code = err?.response?.data?.error?.code;
            if (code === "EXPORT_TOO_LARGE") {
                toast.error("Case exceeds 200 MB — export a subset instead.");
            } else {
                toast.error(
                    err?.response?.data?.error?.message ?? "Could not export case.",
                );
            }
        }
    };

    const handleBatchShare = () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        const first = photos.find((p) => p.id === ids[0]);
        if (!first) return;
        if (ids.length > 1) {
            toast.info(`Share one link at a time — starting with ${first.fileName ?? "the first asset"}.`);
        }
        setSharingPhoto(first);
    };

    // handleBatchDelete: Promise.allSettled so a single linked-asset failure
    // does not mask N-1 successes. Linked assets are pre-filtered so we never
    // fire the network call for an obvious violation.
    const handleBatchDelete = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0 || batchBusy) return;

        const { deletable, blocked } = ids.reduce(
            (acc, id) => {
                const p = photos.find((x) => x.id === id);
                if (!p) return acc;
                if (p.linkedRecordSetIds.length > 0 || p.linkedVisitIds.length > 0) {
                    acc.blocked.push(p);
                } else {
                    acc.deletable.push(p);
                }
                return acc;
            },
            { deletable: [] as PhotoDTO[], blocked: [] as PhotoDTO[] },
        );

        if (deletable.length === 0) {
            toast.error("Unlink assets from all record sets and visits before deleting.");
            return;
        }

        // eslint-disable-next-line no-alert
        const confirmed = window.confirm(
            `Delete ${deletable.length} asset${deletable.length === 1 ? "" : "s"}? This cannot be undone.` +
            (blocked.length > 0 ? `\n\n${blocked.length} linked asset${blocked.length === 1 ? " is" : "s are"} skipped — unlink first.` : ""),
        );
        if (!confirmed) return;

        setBatchBusy(true);
        try {
            const results = await Promise.allSettled(
                deletable.map((p) => deletePhoto.mutateAsync(p.id)),
            );
            const ok     = results.filter((r) => r.status === "fulfilled").length;
            const failed = results.length - ok;

            setSelectedIds((prev) => {
                const next = new Set(prev);
                deletable.forEach((p, i) => {
                    if (results[i].status === "fulfilled") next.delete(p.id);
                });
                return next;
            });

            if (ok > 0 && failed === 0) {
                toast.success(`${ok} asset${ok === 1 ? "" : "s"} deleted`);
            } else if (ok > 0 && failed > 0) {
                toast.warning(`${ok} deleted · ${failed} failed`);
            } else {
                const first = results[0] as PromiseRejectedResult | undefined;
                const msg =
                    (first?.reason as any)?.response?.data?.error?.message ??
                    (first?.reason as any)?.message ??
                    "Could not delete assets.";
                toast.error(msg);
            }
            if (blocked.length > 0) {
                toast.info(`${blocked.length} linked asset${blocked.length === 1 ? " was" : "s were"} skipped.`);
            }
        } finally {
            setBatchBusy(false);
        }
    };

    const handleDeletePhoto = (p: PhotoDTO) => {
        if (p.linkedRecordSetIds.length > 0 || p.linkedVisitIds.length > 0) {
            toast.error("Unlink this photo from all record sets and visits first.");
            return;
        }
        // eslint-disable-next-line no-alert
        if (!window.confirm("Delete this photo? This cannot be undone.")) return;
        deletePhoto.mutate(p.id, {
            onSuccess: () => {
                toast.success("Photo deleted");
                setViewingPhoto(null);
                setSelectedIds((prev) => {
                    if (!prev.has(p.id)) return prev;
                    const next = new Set(prev);
                    next.delete(p.id);
                    return next;
                });
            },
            onError: (err: any) => {
                toast.error(err?.response?.data?.error?.message ?? "Could not delete photo");
            },
        });
    };

    // ── Upload ──────────────────────────────────────────────────────────────
    // Phase 2 — metadata.type inferred from the file via detectType().
    // Photos → intraoral, PDFs → document, STL → stl, DICOM → dicom.
    // The backend infers `fileType` (image/pdf/3d/dicom) from the MIME.
    //
    // Phase (upload isolation) — uploads are ONLY permitted in the
    // "Other Photos" (kind === "all") pool. RecordSets and Visits are
    // link-only contexts. The UI hides the button when not in "all", but
    // both click-time and file-select time carry a defensive guard.
    const isRootPool = selectedPoolId.kind === "all";

    const handleUploadClick = () => {
        if (!isRootPool) {
            toast.error("Upload only allowed in the Inbox");
            return;
        }
        fileInputRef.current?.click();
    };

    const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        // Reset the input so uploading the same file twice in a row works.
        e.target.value = "";
        if (files.length === 0) return;

        // Defensive second guard — blocks uploads even if the button is
        // triggered programmatically from another pool (hotkey / tests).
        if (!isRootPool) {
            toast.error("Upload only allowed in the Inbox");
            return;
        }

        // Batch-level guard — keeps Upload disabled for the full loop.
        setIsBatchUploading(true);
        let okCount = 0;
        let failCount = 0;
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try {
                    setUploadProgress({ file: file.name, pct: 0, index: i + 1, total: files.length });
                    await uploadPhoto.mutateAsync({
                        file,
                        metadata: { type: detectType(file) },
                        onUploadProgress: (pct) => {
                            setUploadProgress({ file: file.name, pct, index: i + 1, total: files.length });
                        },
                    });
                    okCount++;
                } catch (err: any) {
                    failCount++;
                    toast.error(
                        `${file.name}: ${
                            err?.response?.data?.error?.message ?? "Upload failed"
                        }`
                    );
                }
            }
        } finally {
            setIsBatchUploading(false);
            setUploadProgress(null);
        }

        // Only report success when at least one file succeeded. The success
        // toast reflects the real count, not the input count.
        if (okCount > 0) {
            toast.success(
                okCount === 1
                    ? "Photo uploaded"
                    : `${okCount} photos uploaded${failCount > 0 ? ` (${failCount} failed)` : ""}`
            );
        }
    };

    // ── Error / loading classification ─────────────────────────────────────
    const httpStatus = (error as any)?.response?.status as number | undefined;
    const isAuthError = httpStatus === 401 || httpStatus === 403;

    // ── Timeline grouping ──────────────────────────────────────────────────
    // Single O(P × L) pass over photos to build a visitId → photos map,
    // then O(V) walk over visits. Replaces the prior O(V × P) nested
    // `strictlyFilteredAssets.filter(...)` per visit which scaled poorly past
    // ~100 photos × ~30 visits.
    const timelineGroups = useMemo(() => {
        const byVisit = new Map<string, PhotoDTO[]>();
        for (const p of strictlyFilteredAssets) {
            for (const vid of p.linkedVisitIds) {
                let bucket = byVisit.get(vid);
                if (!bucket) {
                    bucket = [];
                    byVisit.set(vid, bucket);
                }
                bucket.push(p);
            }
        }
        return (visits ?? [])
            .filter((v) => isValidObjectId(v.id))
            .map((v) => ({
                visit:  v,
                photos: byVisit.get(v.id) ?? [],
            }));
    }, [visits, strictlyFilteredAssets]);

    const unlinkedInTimeline = useMemo(() => {
        return strictlyFilteredAssets.filter((p) => p.linkedVisitIds.length === 0);
    }, [strictlyFilteredAssets]);

    // ── Mutation busy flag — drag is disabled while writes are in flight.
    // Drops are also short-circuited if any of these flip to pending mid-drag.
    const isBusy =
        uploadPhoto.isPending ||
        linkToRecordSet.isPending ||
        linkToVisit.isPending ||
        deletePhoto.isPending ||
        isBatchUploading;

    // ── Render ──────────────────────────────────────────────────────────────
    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={resetDragState}>
            <div className="flex h-full min-h-[640px] bg-gray-50 border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <PoolsSidebar
                    allPhotosCount={photos.length}
                    recordSets={recordSetPools}
                    visits={visitPools}
                    selectedPoolId={selectedPoolId}
                    onSelect={setSelectedPoolId}
                />

                <main className="flex-1 flex flex-col min-w-0">
                    {/* U-CAP §3 — Breadcrumb path sits ABOVE the toolbar,
                        always reflects selectedPoolId, navigates up the
                        folder hierarchy on click. */}
                    <div className="px-6 pt-3">
                        <Breadcrumbs
                            selectedPoolId={selectedPoolId}
                            recordSets={recordSetPools}
                            visits={visitPools}
                            onNavigate={setSelectedPoolId}
                        />
                    </div>

                    {/* Toolbar */}
                    <header className="px-6 py-3 border-b border-slate-200 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <h1 className="text-base font-bold text-slate-900 truncate">
                                {poolTitle(selectedPoolId, recordSetPools, visitPools)}
                            </h1>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {strictlyFilteredAssets.length} {strictlyFilteredAssets.length === 1 ? "file" : "files"}
                                {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
                                {isRootPool
                                    ? " · drag into a pool to link"
                                    : " · assets here are linked from Inbox"}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
                            {isRootPool && (
                                <button
                                    type="button"
                                    onClick={handleUploadClick}
                                    disabled={isBatchUploading || uploadPhoto.isPending}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
                                >
                                    {isBatchUploading || uploadPhoto.isPending ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Upload className="w-3.5 h-3.5" />
                                    )}
                                    Upload
                                </button>
                            )}

                            {/* U-CAP §5 — Export Case (ZIP). Selection-aware:
                                when anything is selected we export just that
                                subset; otherwise the full case ships. The
                                button is disabled while a download is in
                                flight (caseExport.isPending) OR when the
                                case has no assets to pack. */}
                            <button
                                type="button"
                                onClick={handleExportCase}
                                disabled={caseExport.isPending || photos.length === 0}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 disabled:opacity-60 transition-colors"
                                title={
                                    selectedIds.size > 0
                                        ? `Export ${selectedIds.size} selected asset${selectedIds.size === 1 ? "" : "s"} as ZIP`
                                        : "Export the entire case as a ZIP bundle"
                                }
                            >
                                {caseExport.isPending ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Archive className="w-3.5 h-3.5" />
                                )}
                                {selectedIds.size > 0
                                    ? `Export (${selectedIds.size})`
                                    : "Export Case"}
                            </button>

                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.stl,.dcm,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/dicom"
                                className="hidden"
                                onChange={handleFilesSelected}
                            />
                        </div>
                    </header>

                    {/* U-CAP Part 2.1 — Upload progress strip. Renders only
                        while a file is in flight; cleared when the batch
                        finishes. Per-file (current / total · filename · %). */}
                    {uploadProgress && (
                        <div className="px-6 py-2 border-b border-slate-200 bg-blue-50/60">
                            <div className="flex items-center gap-3 text-[11px] font-semibold text-blue-700">
                                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                <span className="truncate flex-1">
                                    Uploading {uploadProgress.file}
                                    {uploadProgress.total > 1
                                        ? ` (${uploadProgress.index} of ${uploadProgress.total})`
                                        : ""}
                                </span>
                                <span className="tabular-nums">{uploadProgress.pct}%</span>
                            </div>
                            <div className="mt-1 h-1 rounded-full bg-blue-100 overflow-hidden">
                                <div
                                    className="h-full bg-blue-600 transition-all duration-200"
                                    style={{ width: `${uploadProgress.pct}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Phase — file-type tabs moved to OrthoCasesTab header.
                        Panel is now the pure content surface. */}

                    <section className="flex-1 overflow-y-auto px-6 py-5">
                        {isLoading ? (
                            <LoadingPane />
                        ) : isError && isAuthError ? (
                            <AuthErrorPane />
                        ) : isError ? (
                            <GenericErrorPane onRetry={() => refetch()} />
                        ) : photos.length === 0 ? (
                            // Case has zero assets total — contextual prompt
                            // for the active tab, delegating upload to the
                            // panel's existing isRootPool-gated handler.
                            <SmartEmptySuggestions
                                fileType={fileTypeFilter}
                                onUpload={handleUploadClick}
                                isRootPool={isRootPool}
                            />
                        ) : viewMode === "timeline" ? (
                            <TimelineView
                                groups={timelineGroups}
                                unlinked={unlinkedInTimeline}
                                onView={handleViewPhoto}
                                onShare={handleSharePhoto}
                                onSelect={handleSelect}
                                selectedIds={selectedIds}
                                dragDisabled={isBusy}
                            />
                        ) : strictlyFilteredAssets.length === 0 ? (
                            // Case has assets, but none match the active
                            // filter / pool — guide the user to upload the
                            // specific type rather than showing a terse
                            // "No documents uploaded" fallback.
                            <SmartEmptySuggestions
                                fileType={fileTypeFilter}
                                onUpload={handleUploadClick}
                                isRootPool={isRootPool}
                            />
                        ) : (
                            <PhotoGrid
                                assets={strictlyFilteredAssets}
                                onView={handleViewPhoto}
                                onShare={handleSharePhoto}
                                onSelect={handleSelect}
                                selectedIds={selectedIds}
                                dragDisabled={isBusy}
                                emptyLabel={emptyLabel(selectedPoolId, fileTypeFilter)}
                            />
                        )}
                    </section>
                </main>
            </div>

            {/* Drag ghost — @dnd-kit's own overlay (NOT Framer Motion). */}
            <DragOverlay>
                {draggingPhoto ? (
                    <div className="w-40 rounded-2xl overflow-hidden shadow-2xl rotate-[-2deg] ring-2 ring-blue-400">
                        <AssetCard
                            photo={draggingPhoto}
                            onView={() => {}}
                            onShare={() => {}}
                            selectionCount={draggingIds.length}
                        />
                    </div>
                ) : null}
            </DragOverlay>

            <PhotoDrawer
                photo={viewingPhoto}
                onClose={() => setViewingPhoto(null)}
                onShare={handleSharePhoto}
                onDelete={handleDeletePhoto}
            />

            <ShareModal photo={sharingPhoto} onClose={() => setSharingPhoto(null)} />

            {/* U-CAP §4 — floating batch action bar. Sticky within the
                DndContext so it stays above the grid without blocking
                drag gestures. */}
            <BatchActionBar
                count={selectedIds.size}
                disabled={batchBusy || isBusy}
                onLink={() => setBatchLinkOpen(true)}
                onShare={handleBatchShare}
                onDelete={handleBatchDelete}
                onClear={() => setSelectedIds(new Set())}
            />

            <BatchLinkModal
                open={batchLinkOpen}
                photoIds={Array.from(selectedIds)}
                recordSets={recordSetPools}
                visits={visitPools}
                onClose={() => setBatchLinkOpen(false)}
                onLinkRecordSet={(photoId, recordSetId) =>
                    linkToRecordSet.mutateAsync({ photoId, recordSetId })
                }
                onLinkVisit={(photoId, visitId) =>
                    linkToVisit.mutateAsync({ photoId, visitId })
                }
            />
        </DndContext>
    );
};

// ─── Inline helpers ─────────────────────────────────────────────────────────

function poolTitle(
    id: PoolId,
    rs: PoolDescriptor[],
    v: PoolDescriptor[]
): string {
    if (id.kind === "all") return "Inbox";
    const pool =
        (id.kind === "recordSet" ? rs : v).find((p) => p.id.refId === id.refId) ?? null;
    return pool?.label ?? "Pool";
}

function emptyLabel(id: PoolId, filter: FileTypeFilter = "all"): string {
    // Phase — per-tab empty-state phrasing matches the flat asset tab bar
    // (Photos / Documents / 3D Models / DICOM). "yet" vs "uploaded" is a
    // deliberate tone choice — photos are the default, everything else
    // reads as a deliberate upload.
    const filterSuffix =
        filter === "pdf"   ? "No documents uploaded"   :
        filter === "3d"    ? "No 3D models uploaded"   :
        filter === "dicom" ? "No DICOM scans uploaded" :
        filter === "image" ? "No photos yet"                   :
        filter === "all"   ? "No assets yet"                   :
        null;
    if (filterSuffix) {
        // When inside a RecordSet / Visit pool, spell out the scope too.
        if (id.kind === "recordSet") return `${filterSuffix} in this record set`;
        if (id.kind === "visit")     return `${filterSuffix} in this visit`;
        return filterSuffix;
    }

    if (id.kind === "all")       return "No assets yet — upload to the Inbox";
    if (id.kind === "recordSet") return "No assets linked to this record set";
    return "No assets linked to this visit";
}

const ViewToggle: React.FC<{
    viewMode: ViewMode;
    setViewMode: (m: ViewMode) => void;
}> = ({ viewMode, setViewMode }) => (
    <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
        <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-md transition-colors ${
                viewMode === "grid"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
            }`}
            title="Grid"
        >
            <LayoutGrid className="w-3.5 h-3.5" />
            Grid
        </button>
        <button
            type="button"
            onClick={() => setViewMode("timeline")}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-md transition-colors ${
                viewMode === "timeline"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
            }`}
            title="Timeline"
        >
            <CalendarClock className="w-3.5 h-3.5" />
            Timeline
        </button>
    </div>
);

const LoadingPane: React.FC = () => (
    <div className="flex-1 flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
    </div>
);

const AuthErrorPane: React.FC = () => (
    <div className="max-w-sm mx-auto text-center bg-white rounded-2xl shadow-sm border border-slate-200 px-8 py-10 text-slate-600">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
            <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900">Sign in required</h2>
        <p className="mt-2 text-sm text-slate-500">
            Your session can't access this case's photos. Please sign in again.
        </p>
    </div>
);

const GenericErrorPane: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
    <div className="max-w-sm mx-auto text-center bg-white rounded-2xl shadow-sm border border-slate-200 px-8 py-10 text-slate-600">
        <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900">Could not load photos</h2>
        <p className="mt-2 text-sm text-slate-500">Please retry in a moment.</p>
        <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
        >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
        </button>
    </div>
);

const EmptyPane: React.FC<{ title: string; hint: string; onUpload: () => void }> = ({
    title,
    hint,
    onUpload,
}) => (
    <div className="max-w-sm mx-auto text-center bg-white rounded-2xl shadow-sm border border-slate-200 px-8 py-10 text-slate-600">
        <div className="mx-auto w-12 h-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center mb-4">
            <Images className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">{hint}</p>
        <button
            type="button"
            onClick={onUpload}
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
        >
            <Upload className="w-3.5 h-3.5" />
            Upload asset
        </button>
    </div>
);

const TimelineView: React.FC<{
    groups: Array<{ visit: { id: string; label: string; visitDate: string | null }; photos: PhotoDTO[] }>;
    unlinked: PhotoDTO[];
    onView: (p: PhotoDTO) => void;
    onShare: (p: PhotoDTO) => void;
    onSelect: (p: PhotoDTO, e: React.MouseEvent) => void;
    selectedIds: Set<string>;
    dragDisabled?: boolean;
}> = ({ groups, unlinked, onView, onShare, onSelect, selectedIds, dragDisabled }) => {
    const anyPhotos =
        groups.some((g) => g.photos.length > 0) || unlinked.length > 0;
    if (!anyPhotos) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 px-8 py-16 text-center">
                <CalendarClock className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">Nothing to show on the timeline yet</p>
                <p className="text-xs mt-1 opacity-75">
                    Link photos to visits to see them here, grouped by visit.
                </p>
            </div>
        );
    }
    return (
        <div className="space-y-8">
            {groups.map((g) => (
                g.photos.length === 0 ? null : (
                    <section key={g.visit.id}>
                        <header className="mb-3 flex items-baseline gap-2">
                            <h3 className="text-sm font-bold text-slate-900">
                                {g.visit.label}
                            </h3>
                            <span className="text-[11px] text-slate-400">
                                {g.photos.length} photo{g.photos.length === 1 ? "" : "s"}
                            </span>
                        </header>
                        <PhotoGrid
                            assets={g.photos}
                            onView={onView}
                            onShare={onShare}
                            onSelect={onSelect}
                            selectedIds={selectedIds}
                            dragDisabled={dragDisabled}
                        />
                    </section>
                )
            ))}
            {unlinked.length > 0 && (
                <section>
                    <header className="mb-3 flex items-baseline gap-2">
                        <h3 className="text-sm font-bold text-slate-900">
                            Unassigned
                        </h3>
                        <span className="text-[11px] text-slate-400">
                            {unlinked.length} photo{unlinked.length === 1 ? "" : "s"} not linked to any visit
                        </span>
                    </header>
                    <PhotoGrid
                        assets={unlinked}
                        onView={onView}
                        onShare={onShare}
                        onSelect={onSelect}
                        selectedIds={selectedIds}
                        dragDisabled={dragDisabled}
                    />
                </section>
            )}
        </div>
    );
};

export default CasePhotosPanel;
