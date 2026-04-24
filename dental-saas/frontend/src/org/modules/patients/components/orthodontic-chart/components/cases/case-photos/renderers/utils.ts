/**
 * renderers/utils.ts — tiny shared helpers for asset renderers.
 */

import type { PhotoDTO } from "../types";

export function formatBytes(n: number | null | undefined): string | null {
    if (n == null || !Number.isFinite(n) || n <= 0) return null;
    if (n < 1024)          return `${n} B`;
    if (n < 1024 * 1024)   return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 ** 3)     return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function assetName(photo: PhotoDTO): string {
    return photo.fileName ?? photo.metadata.originalName ?? "Unnamed asset";
}
