/**
 * PhotoCard.tsx — DEPRECATED re-export shim.
 *
 * The component was renamed to AssetCard (Phase — unified renderer
 * architecture). This file is kept ONLY so any stray direct imports
 * (tests, dev tooling, incomplete searches) continue to resolve.
 *
 * Delete this file once `rg PhotoCard` across the repo comes back clean.
 */

export { default } from "./AssetCard";
export type { AssetCardProps as PhotoCardProps } from "./AssetCard";
