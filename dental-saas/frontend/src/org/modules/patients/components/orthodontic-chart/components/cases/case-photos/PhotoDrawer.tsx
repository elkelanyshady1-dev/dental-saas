/**
 * PhotoDrawer.tsx — right-side slide-in detail view for a single photo.
 *
 * Framer Motion handles ONLY the slide + fade animation.
 * Drag/drop is never wired here — this is a passive read-side surface.
 */

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    X, Calendar, User, Tag, FolderKanban, Stethoscope, Trash2, Share2,
} from "lucide-react";
import type { PhotoDTO } from "./types";
import { getRenderer } from "./renderers";

// Phase — drawer preview is delegated to the unified renderer registry.
// Each fileType supplies its own DrawerPreview component (image <img>,
// pdf <iframe>, 3d <LazySTLViewer>, dicom LazyDicomViewer). No inline
// branching lives here.

const TYPE_LABEL: Record<string, string> = {
    intraoral: "Intraoral",
    extraoral: "Extraoral",
    xray:      "X-Ray",
    scan:      "Scan",
};

export interface PhotoDrawerProps {
    photo: PhotoDTO | null;
    onClose: () => void;
    onShare: (photo: PhotoDTO) => void;
    onDelete: (photo: PhotoDTO) => void;
}

const PhotoDrawer: React.FC<PhotoDrawerProps> = ({ photo, onClose, onShare, onDelete }) => {
    const canDelete =
        !!photo &&
        photo.linkedRecordSetIds.length === 0 &&
        photo.linkedVisitIds.length === 0;

    return (
        <AnimatePresence>
            {photo && (
                <>
                    <motion.div
                        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                    <motion.aside
                        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col"
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 28, stiffness: 260 }}
                    >
                        {/* Header */}
                        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                            <div className="min-w-0">
                                <h3 className="text-lg font-bold text-slate-900 truncate">
                                    {photo.metadata.originalName ?? "Case photo"}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {TYPE_LABEL[photo.metadata.type] ?? photo.metadata.type}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-2 rounded-full hover:bg-slate-100"
                            >
                                <X className="w-5 h-5 text-slate-600" />
                            </button>
                        </div>

                        {/* Preview — Phase 2 fileType-aware */}
                        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-center">
                            <AssetPreview photo={photo} />
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                            <MetadataSection photo={photo} />
                            <UsedInSection photo={photo} />
                            <ProvenanceSection photo={photo} />
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-2">
                            <button
                                type="button"
                                onClick={() => onShare(photo)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                            >
                                <Share2 className="w-4 h-4" />
                                Share
                            </button>
                            <button
                                type="button"
                                disabled={!canDelete}
                                onClick={() => onDelete(photo)}
                                title={
                                    canDelete
                                        ? "Delete this photo"
                                        : "Photo is linked — unlink from all record sets and visits first."
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete
                            </button>
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
};

// ── Preview router ──────────────────────────────────────────────────────────
// Single dispatch — AssetRenderer.DrawerPreview handles everything.

const AssetPreview: React.FC<{ photo: PhotoDTO }> = ({ photo }) => {
    const renderer = getRenderer(photo.fileType);
    const DrawerPreview = renderer.DrawerPreview;
    return <DrawerPreview photo={photo} />;
};

// ── Sections ────────────────────────────────────────────────────────────────

const MetadataSection: React.FC<{ photo: PhotoDTO }> = ({ photo }) => (
    <section>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Details
        </h4>
        <dl className="space-y-1.5 text-sm">
            <Row icon={<Tag className="w-3.5 h-3.5" />} label="Type">
                {TYPE_LABEL[photo.metadata.type] ?? photo.metadata.type}
            </Row>
            <Row icon={<Calendar className="w-3.5 h-3.5" />} label="Uploaded">
                {photo.uploadedAt ? new Date(photo.uploadedAt).toLocaleString() : "—"}
            </Row>
            <Row icon={<User className="w-3.5 h-3.5" />} label="By">
                {photo.uploadedBy ?? "—"}
            </Row>
            {photo.metadata.tags && photo.metadata.tags.length > 0 && (
                <Row icon={<Tag className="w-3.5 h-3.5" />} label="Tags">
                    <div className="flex flex-wrap gap-1">
                        {photo.metadata.tags.map((t) => (
                            <span
                                key={t}
                                className="inline-block text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                            >
                                {t}
                            </span>
                        ))}
                    </div>
                </Row>
            )}
        </dl>
    </section>
);

const UsedInSection: React.FC<{ photo: PhotoDTO }> = ({ photo }) => (
    <section>
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            Used in
        </h4>
        <div className="space-y-1.5 text-sm">
            {photo.linkedRecordSetIds.length === 0 && photo.linkedVisitIds.length === 0 ? (
                <p className="text-xs text-slate-400 italic">
                    Not linked to any record set or visit yet.
                </p>
            ) : (
                <>
                    {photo.linkedRecordSetIds.map((id) => (
                        <div
                            key={`rs-${id}`}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-slate-50 text-slate-700"
                        >
                            <FolderKanban className="w-3.5 h-3.5 text-slate-500" />
                            <span className="text-xs truncate">RecordSet · {id.slice(-6)}</span>
                        </div>
                    ))}
                    {photo.linkedVisitIds.map((id) => (
                        <div
                            key={`v-${id}`}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-slate-50 text-slate-700"
                        >
                            <Stethoscope className="w-3.5 h-3.5 text-slate-500" />
                            <span className="text-xs truncate">Visit · {id.slice(-6)}</span>
                        </div>
                    ))}
                </>
            )}
        </div>
    </section>
);

const ProvenanceSection: React.FC<{ photo: PhotoDTO }> = ({ photo }) => {
    if (!photo.provenance || photo.provenance.length === 0) return null;
    return (
        <section>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                Provenance
            </h4>
            <ol className="space-y-1 text-xs text-slate-500">
                {photo.provenance.map((p, i) => (
                    <li key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                        <span>
                            Linked {p.linkedAt ? new Date(p.linkedAt).toLocaleDateString() : "—"}
                            {p.sourceRecordSetId
                                ? ` from ${p.sourceRecordSetId.slice(-6)}`
                                : ""}
                        </span>
                    </li>
                ))}
            </ol>
        </section>
    );
};

const Row: React.FC<{
    icon: React.ReactNode;
    label: string;
    children: React.ReactNode;
}> = ({ icon, label, children }) => (
    <div className="flex items-start gap-2">
        <dt className="flex items-center gap-1 text-xs font-semibold text-slate-500 w-20 shrink-0 pt-0.5">
            {icon}
            {label}
        </dt>
        <dd className="flex-1 text-slate-800">{children}</dd>
    </div>
);

export default PhotoDrawer;
