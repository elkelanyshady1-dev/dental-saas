/**
 * BatchActionBar.tsx — floating action bar for multi-selected assets.
 *
 * Appears at the bottom of the panel when selectedIds.size > 0. Hosts the
 * batch-level operations allowed on the current selection:
 *   - Link to…    (opens BatchLinkModal → batch linkPhotoToRecordSet / ToVisit)
 *   - Share       (currently single-asset; falls back to the first selected)
 *   - Delete      (Promise.allSettled; skips linked assets + toasts partial)
 *   - Clear       (reset selection; no backend call)
 *
 * INVARIANTS:
 *   ✅ All actions delegate to mutations already defined in usePhotos.
 *   ✅ No server-state mutation; invalidation happens in the hooks.
 *   ❌ Drag remains LINK — this bar has no "move" semantics.
 */

import React from "react";
import { Link2, Share2, Trash2, XCircle } from "lucide-react";

export interface BatchActionBarProps {
    count:      number;
    disabled?:  boolean;
    onLink:     () => void;
    onShare:    () => void;
    onDelete:   () => void;
    onClear:    () => void;
}

const BatchActionBar: React.FC<BatchActionBarProps> = ({
    count,
    disabled = false,
    onLink,
    onShare,
    onDelete,
    onClear,
}) => {
    if (count <= 0) return null;
    return (
        <div className="sticky bottom-4 z-20 mx-auto w-fit">
            <div className="flex items-center gap-2 rounded-full bg-slate-900/95 text-white shadow-xl pl-4 pr-2 py-2 backdrop-blur">
                <span className="text-xs font-bold tracking-wide">
                    {count} selected
                </span>

                <span className="w-px h-5 bg-white/20 mx-1" />

                <ActionButton
                    icon={<Link2 className="w-3.5 h-3.5" />}
                    label="Link to…"
                    onClick={onLink}
                    disabled={disabled}
                />
                <ActionButton
                    icon={<Share2 className="w-3.5 h-3.5" />}
                    label="Share"
                    onClick={onShare}
                    disabled={disabled}
                />
                <ActionButton
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                    label="Delete"
                    onClick={onDelete}
                    danger
                    disabled={disabled}
                />

                <span className="w-px h-5 bg-white/20 mx-1" />

                <button
                    type="button"
                    onClick={onClear}
                    disabled={disabled}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                    title="Clear selection"
                >
                    <XCircle className="w-3.5 h-3.5" />
                    Clear
                </button>
            </div>
        </div>
    );
};

// ── Subcomponent ────────────────────────────────────────────────────────────

const ActionButton: React.FC<{
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
}> = ({ icon, label, onClick, disabled, danger }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-50 ${
            danger
                ? "bg-rose-500/90 hover:bg-rose-500 text-white"
                : "bg-white/10 hover:bg-white/20 text-white"
        }`}
    >
        {icon}
        {label}
    </button>
);

export default BatchActionBar;
