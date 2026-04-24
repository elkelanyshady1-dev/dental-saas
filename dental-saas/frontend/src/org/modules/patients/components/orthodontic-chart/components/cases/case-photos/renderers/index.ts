/**
 * renderers/index.ts — file-type → AssetRenderer registry.
 *
 * Single source of truth for how each fileType is rendered in BOTH the
 * card body and the drawer preview. AssetCard and PhotoDrawer call
 * `getRenderer(photo.fileType)` and delegate to the returned module.
 *
 * To add a new asset type:
 *   1. Add the literal to the `FileType` union in hooks/usePhotos.ts.
 *   2. Add an enum value to the backend Photo model + validator.
 *   3. Create a new `<Type>Renderer.tsx` implementing AssetRenderer.
 *   4. Register it in REGISTRY below.
 */

import type { FileType } from "../types";
import type { AssetRenderer } from "./types";

import ImageRenderer    from "./ImageRenderer";
import DocumentRenderer from "./DocumentRenderer";
import STLRenderer      from "./STLRenderer";
import DicomRenderer    from "./DicomRenderer";
import FallbackRenderer from "./FallbackRenderer";

const REGISTRY: Record<FileType, AssetRenderer> = {
    image: ImageRenderer,
    pdf:   DocumentRenderer,
    "3d":  STLRenderer,
    dicom: DicomRenderer,
};

/**
 * Returns the renderer for a fileType. NEVER returns undefined.
 *
 * Known registry keys → matching renderer.
 * Unknown / missing / null → FallbackRenderer, which paints a visible
 * "Unsupported asset" card (not a broken image placeholder, not null).
 *
 * This is the single place that decides how an asset is rendered; AssetCard
 * consumes the result without any additional branching.
 */
export function getRenderer(fileType: FileType | string | null | undefined): AssetRenderer {
    if (fileType && (fileType in REGISTRY)) {
        return REGISTRY[fileType as FileType];
    }
    return FallbackRenderer;
}

export type { AssetRenderer, AssetEmptyState } from "./types";
export { default as ImageRenderer }    from "./ImageRenderer";
export { default as DocumentRenderer } from "./DocumentRenderer";
export { default as STLRenderer }      from "./STLRenderer";
export { default as DicomRenderer }    from "./DicomRenderer";
export { default as FallbackRenderer } from "./FallbackRenderer";
