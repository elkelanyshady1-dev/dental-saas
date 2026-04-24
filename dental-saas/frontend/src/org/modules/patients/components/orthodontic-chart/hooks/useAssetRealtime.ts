/**
 * useAssetRealtime.ts — U-CAP live asset-job hook.
 *
 * Subscribes to the org-scoped `asset.job.v1` socket event and patches
 * the React Query cache surgically so the grid updates WITHOUT a full
 * refetch. This replaces the 50s polling interval as the primary
 * freshness mechanism; polling stays on (30 s) as a disconnect-safe
 * fallback so the UI still converges even if the socket drops.
 *
 * Invariants
 *   - Server state remains source of truth. The patch mirrors fields
 *     the backend already wrote (processingStatus / processingProgress
 *     / processingError / retryCount) — never invents data.
 *   - Events are filtered by `caseId` client-side so a noisy org
 *     doesn't invalidate the view for every other open case.
 *   - `done` and `failed` ALSO trigger `invalidateQueries` so the
 *     newly-resolved `thumbnailSignedUrl` makes it into the cache.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/context/SocketContext";
import { QK } from "@/lib/query/queryKeys";
import type { PhotoDTO, ProcessingStatus } from "./usePhotos";

/** Backend socket payload shape — mirrors eventSchemas.js "asset.job.v1". */
interface AssetJobEvent {
    photoId:    string;
    caseId:     string;
    phase:      "started" | "progress" | "done" | "failed" | "skipped";
    progress?:  number;
    jobType?:   string;
    error?:     string;
    retryCount?: number;
}

export function useAssetRealtime(caseId: string | undefined): void {
    const socket = useSocket();
    const qc     = useQueryClient();

    useEffect(() => {
        if (!socket || !caseId) return;

        const handler = (raw: AssetJobEvent) => {
            // Guard — only react to events for THIS case. Org room may
            // carry traffic for many open cases across sibling tabs.
            if (!raw || raw.caseId !== caseId) return;

            const key = QK.orthodontics.photos(caseId);
            const nextStatus: ProcessingStatus =
                raw.phase === "started"  ? "processing" :
                raw.phase === "progress" ? "processing" :
                raw.phase === "done"     ? "done"       :
                raw.phase === "failed"   ? "failed"     :
                raw.phase === "skipped"  ? "skipped"    :
                null;

            // Surgical cache patch — no refetch, no layout shift.
            qc.setQueryData<PhotoDTO[] | undefined>(key, (prev) => {
                if (!Array.isArray(prev)) return prev;
                let changed = false;
                const next = prev.map((p) => {
                    if (p.id !== raw.photoId) return p;
                    changed = true;
                    return {
                        ...p,
                        processingStatus:   nextStatus ?? p.processingStatus,
                        processingProgress:
                            typeof raw.progress === "number"
                                ? Math.max(0, Math.min(100, raw.progress))
                                : p.processingProgress,
                        processingError:
                            raw.phase === "failed"
                                ? (raw.error ?? p.processingError)
                                : raw.phase === "done"
                                    ? null
                                    : p.processingError,
                        retryCount:
                            typeof raw.retryCount === "number"
                                ? raw.retryCount
                                : p.retryCount,
                    };
                });
                return changed ? next : prev;
            });

            // On terminal states, also invalidate so thumbnailSignedUrl
            // (and any DICOM metadata) come through fresh from the DTO.
            if (raw.phase === "done" || raw.phase === "failed" || raw.phase === "skipped") {
                qc.invalidateQueries({ queryKey: key });
            }
        };

        socket.on("asset.job.v1", handler);
        return () => {
            socket.off("asset.job.v1", handler);
        };
    }, [socket, caseId, qc]);
}

export default useAssetRealtime;
