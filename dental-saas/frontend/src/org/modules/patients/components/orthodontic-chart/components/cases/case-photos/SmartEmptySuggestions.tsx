/**
 * SmartEmptySuggestions.tsx — contextual empty-state for the case asset pool.
 *
 * Replaces the generic "No photos yet" card with a clinical-workflow-aware
 * prompt that tells the user exactly what to upload in the active tab.
 *
 * INVARIANTS (per spec §3):
 *   ✅ Presentation only — never calls the upload API directly.
 *   ✅ Delegates to the panel's existing `onUpload` handler, which already
 *      enforces isRootPool + toasts on invalid destinations.
 *   ❌ Never infers fileType, auto-seeds data, or bypasses the strict filter.
 *
 * SHAPE:
 *   - Icon circle + title + tip list + CTA. Matches the surrounding
 *     EmptyPane / ErrorPane visual language (rounded-2xl, shadow-sm border).
 *   - When the user is inside a record-set or visit pool (`isRootPool=false`),
 *     the upload CTA is suppressed — uploads only happen in Other Photos per
 *     panel-level policy. A helper note explains how to populate that pool.
 *
 * ICONS:
 *   lucide-react, consistent with every other asset icon in this module.
 *   The spec's §4 emoji suggestion was labeled OPTIONAL — we stick with
 *   the codebase convention (lucide) for visual consistency.
 */

import React from "react";
import {
    Camera,
    FileText,
    Box,
    Brain,
    Upload,
    Layers,
} from "lucide-react";
import type { FileTypeFilter } from "./types";

interface Config {
    title: string;
    tips:  string[];
    cta:   string;
    Icon:  React.ComponentType<{ className?: string }>;
    accent: string;  // tailwind bg class for the icon circle
}

const CONFIG: Record<FileTypeFilter, Config> = {
    image: {
        title: "Upload your first clinical photo",
        tips: [
            "Intraoral photos (front, left, right occlusion)",
            "Extraoral profile and frontal portraits",
            "Smile views and retracted close-ups",
        ],
        cta:   "Upload photos",
        Icon:  Camera,
        accent: "bg-blue-50 text-blue-600",
    },
    pdf: {
        title: "Add clinical documents",
        tips: [
            "Treatment plans & progress reports (PDF, .docx)",
            "Presentation slides for case review (.pptx)",
            "Consent forms, referral letters, specialist notes",
        ],
        cta:   "Upload documents",
        Icon:  FileText,
        accent: "bg-rose-50 text-rose-600",
    },
    "3d": {
        title: "Upload 3D models",
        tips: [
            "STL scans from intraoral scanners",
            "Lab-generated study models",
            "Aligner setup previews",
        ],
        cta:   "Upload 3D model",
        Icon:  Box,
        accent: "bg-violet-50 text-violet-600",
    },
    dicom: {
        title: "Upload radiographic scans",
        tips: [
            "CBCT series (.dcm files)",
            "Panoramic and periapical X-rays",
            "Cephalometric tracings",
        ],
        cta:   "Upload DICOM",
        Icon:  Brain,
        accent: "bg-emerald-50 text-emerald-600",
    },
    all: {
        title: "Start building this case",
        tips: [
            "Upload photos, documents, scans, or 3D models",
            "Organise them into Record Sets (Pre / Mid / Post)",
            "Link them to visits for timeline tracking",
        ],
        cta:   "Upload files",
        Icon:  Layers,
        accent: "bg-slate-100 text-slate-600",
    },
};

export interface SmartEmptySuggestionsProps {
    fileType:    FileTypeFilter;
    onUpload:    () => void;
    /** Uploads are only permitted in the root "Other Photos" pool. When
     *  false, the CTA is suppressed and a link-instead hint is shown. */
    isRootPool?: boolean;
}

const SmartEmptySuggestions: React.FC<SmartEmptySuggestionsProps> = ({
    fileType,
    onUpload,
    isRootPool = true,
}) => {
    const current = CONFIG[fileType] ?? CONFIG.all;
    const { Icon } = current;

    return (
        <div className="max-w-md mx-auto text-center bg-white rounded-2xl shadow-sm border border-slate-200 px-8 py-10 text-slate-600">
            <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${current.accent}`}>
                <Icon className="w-6 h-6" />
            </div>

            <h2 className="text-base font-bold text-slate-900">{current.title}</h2>

            <ul className="mt-4 space-y-1.5 text-sm text-slate-500">
                {current.tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-left">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-slate-400 shrink-0" />
                        <span>{tip}</span>
                    </li>
                ))}
            </ul>

            {isRootPool ? (
                <button
                    type="button"
                    onClick={onUpload}
                    className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                >
                    <Upload className="w-3.5 h-3.5" />
                    {current.cta}
                </button>
            ) : (
                <p className="mt-6 text-xs text-slate-500">
                    Uploads happen in the <span className="font-semibold">Inbox</span>.
                    Drag assets from there to link them into this folder.
                </p>
            )}
        </div>
    );
};

export default SmartEmptySuggestions;
