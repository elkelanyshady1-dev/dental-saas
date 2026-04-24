/**
 * filterTabs.tsx — shared file-type filter definitions.
 *
 * Owned by OrthoCasesTab (header) and referenced by CasePhotosPanel only
 * for the `FileTypeFilter` type + default labels. Kept outside both files
 * to avoid a circular import and to centralise the tab definitions.
 */

import React from "react";
import { Images, FileText, Box, Activity } from "lucide-react";
import type { FileTypeFilter } from "./types";

export interface FilterTab {
    key:  FileTypeFilter;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
}

export const FILTER_TABS: FilterTab[] = [
    { key: "all",   label: "All" },
    { key: "image", label: "Photos",    icon: Images },
    { key: "pdf",   label: "Documents", icon: FileText },
    { key: "3d",    label: "3D Models", icon: Box },
    { key: "dicom", label: "DICOM",     icon: Activity },
];
