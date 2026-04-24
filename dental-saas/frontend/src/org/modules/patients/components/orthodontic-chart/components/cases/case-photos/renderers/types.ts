/**
 * renderers/types.ts — AssetRenderer contract.
 *
 * Every file type (image / pdf / 3d / dicom) is implemented as a single
 * module exporting a unified three-part object:
 *
 *   { CardBody, DrawerPreview, EmptyState }
 *
 * AssetCard consumes `CardBody`.
 * PhotoDrawer consumes `DrawerPreview`.
 * CasePhotosPanel's EmptyPane / PhotoGrid empty fallback may consume
 * `EmptyState` for icon + label.
 *
 * 🚨 RULE:
 *   `fileType` is backend-authoritative. Renderers read `photo.fileType`
 *   as truth — never infer on the frontend.
 */

import type React from "react";
import type { PhotoDTO } from "../types";

export interface AssetEmptyState {
    /** Short label shown in the empty card (e.g. "No documents uploaded"). */
    label: string;
    /** Lucide icon for the empty-state illustration. */
    icon:  React.ComponentType<{ className?: string }>;
}

export interface AssetRenderer {
    /** Card body content. Parent AssetCard provides the aspect-ratio box,
        drag handle, selection ring, hover actions, and type badge. */
    CardBody: React.FC<{ photo: PhotoDTO }>;
    /** Full-fidelity preview inside PhotoDrawer. */
    DrawerPreview: React.FC<{ photo: PhotoDTO }>;
    EmptyState: AssetEmptyState;
}
