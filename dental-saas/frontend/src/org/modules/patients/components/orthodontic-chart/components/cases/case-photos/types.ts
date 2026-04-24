/**
 * case-photos/types.ts — shared types for the Case Photo Pool UI.
 *
 * Re-exports the canonical PhotoDTO from the photo SSOT hook and adds
 * local types used by the pools sidebar.
 */

export type {
    PhotoDTO,
    PhotoType,
    PhotoProvenance,
    FileType,
} from "../../../hooks/usePhotos";

import type { FileType } from "../../../hooks/usePhotos";

// Phase — file-type filter used by OrthoCasesTab (owner) and
// CasePhotosPanel (controlled consumer). "all" means show every fileType.
export type FileTypeFilter = "all" | FileType;

export type PoolKind = "all" | "recordSet" | "visit";

export interface PoolId {
    kind: PoolKind;
    /** RecordSet or Visit ObjectId. Omitted when kind === "all". */
    refId?: string;
}

export function serializePoolId(id: PoolId): string {
    return id.kind === "all" ? "all" : `${id.kind}:${id.refId ?? ""}`;
}

export function parsePoolId(s: string): PoolId {
    if (s === "all") return { kind: "all" };
    const [kind, refId] = s.split(":");
    return { kind: kind as PoolKind, refId };
}

export interface PoolDescriptor {
    id: PoolId;
    label: string;
    count: number;
    /** UI badge colour hint; not enforced. */
    accent?: "blue" | "slate" | "amber" | "emerald";
}

export type SharePermission = "view" | "download";
