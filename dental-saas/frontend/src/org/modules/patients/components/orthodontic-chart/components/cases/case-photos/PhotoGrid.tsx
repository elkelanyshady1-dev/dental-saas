/**
 * PhotoGrid.tsx — responsive grid of AssetCards.
 *
 * Prop `assets` is the STRICTLY FILTERED list from the panel. Consumers
 * must not pass an un-filtered list here; file-type isolation depends on
 * the panel pre-filtering before this grid renders.
 */

import React from "react";
import { ImagePlus } from "lucide-react";
import AssetCard from "./AssetCard";
import type { PhotoDTO } from "./types";

export interface PhotoGridProps {
    /** Strictly filtered asset list (post pool + fileType filter). */
    assets: PhotoDTO[];
    onView: (photo: PhotoDTO) => void;
    onShare: (photo: PhotoDTO) => void;
    /** Called with the clicked photo + native event — the panel resolves
        modifier keys (plain / ctrl / shift) into selection changes. */
    onSelect?: (photo: PhotoDTO, event: React.MouseEvent) => void;
    selectedIds?: Set<string>;
    /** Forwarded to every AssetCard — set true during in-flight mutations
        so accidental drag activations are blocked at the source. */
    dragDisabled?: boolean;
    emptyLabel?: string;
}

const PhotoGrid: React.FC<PhotoGridProps> = ({
    assets,
    onView,
    onShare,
    onSelect,
    selectedIds,
    dragDisabled,
    emptyLabel,
}) => {
    if (assets.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 px-8 py-16 text-center">
                <ImagePlus className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">{emptyLabel ?? "No assets in this pool"}</p>
                <p className="text-xs mt-1 opacity-75">
                    Drag assets from other pools to link them here.
                </p>
            </div>
        );
    }

    return (
        <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {assets.map((p) => (
                <AssetCard
                    key={p.id}
                    photo={p}
                    onView={onView}
                    onShare={onShare}
                    onSelect={onSelect}
                    selected={selectedIds?.has(p.id) ?? false}
                    dragDisabled={dragDisabled}
                />
            ))}
        </div>
    );
};

export default PhotoGrid;
