/**
 * case-photos/index.ts — barrel export for the Case Photo Pool UI.
 */

export { default as CasePhotosPanel } from "./CasePhotosPanel";
export { default as PoolsSidebar }    from "./PoolsSidebar";
export { default as PhotoGrid }       from "./PhotoGrid";
export { default as AssetCard }       from "./AssetCard";
export { default as PhotoDrawer }     from "./PhotoDrawer";
export { default as ShareModal }      from "./ShareModal";
export { default as LazyDicomViewer } from "./LazyDicomViewer";

export { getRenderer }                from "./renderers";
export type { AssetRenderer }         from "./renderers";

export type {
    PhotoDTO,
    PhotoType,
    PhotoProvenance,
    FileType,
    FileTypeFilter,
    PoolKind,
    PoolId,
    PoolDescriptor,
    SharePermission,
} from "./types";

export { FILTER_TABS, type FilterTab } from "./filterTabs";
