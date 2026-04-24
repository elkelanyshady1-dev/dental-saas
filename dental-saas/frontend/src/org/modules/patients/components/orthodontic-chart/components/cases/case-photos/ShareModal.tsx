/**
 * ShareModal.tsx — Drive-style share dialog (live API).
 *
 * - POST /share-links → backend returns { url, expiresAt }
 * - URL is a one-time-resolved token URL (the SHARE link, not a signed
 *   storage URL). Re-opens to /share/photo/:token where the viewer
 *   re-resolves a fresh signedUrl on every fetch.
 * - storageKey / checksum are NEVER touched on the wire.
 */

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Link2, Copy, Check, Shield, Download, Loader2 } from "lucide-react";
import api from "@/services/api";
import type { PhotoDTO, SharePermission } from "./types";

const EXPIRES_IN_HOURS_DEFAULT = 24;

interface ShareCreateResponse {
    url: string;
    expiresAt: string;
}

async function createShareLink(
    photoId: string,
    permission: SharePermission
): Promise<ShareCreateResponse> {
    const res = await api.post("/share-links", {
        resourceId:     photoId,
        resourceType:   "photo",
        permission,
        expiresInHours: EXPIRES_IN_HOURS_DEFAULT,
    });
    const data = res.data?.data ?? res.data;
    if (!data?.url) {
        throw new Error("Share link response missing url");
    }
    return { url: data.url, expiresAt: data.expiresAt };
}

export interface ShareModalProps {
    photo: PhotoDTO | null;
    onClose: () => void;
}

const ShareModal: React.FC<ShareModalProps> = ({ photo, onClose }) => {
    const [permission, setPermission] = useState<SharePermission>("view");
    const [link, setLink] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const createMut = useMutation({
        mutationFn: (perm: SharePermission) => createShareLink(photo!.id, perm),
        onSuccess: (data) => {
            setLink(data.url);
            setExpiresAt(data.expiresAt);
            toast.success("Share link generated");
        },
        onError: (err: any) => {
            toast.error(err?.response?.data?.error?.message ?? "Failed to generate share link");
        },
    });

    // Reset when target photo changes (or modal opens for a different photo).
    useEffect(() => {
        setPermission("view");
        setLink(null);
        setExpiresAt(null);
        setCopied(false);
        createMut.reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [photo?.id]);

    const handleGenerate = () => {
        if (!photo) return;
        createMut.mutate(permission);
    };

    const handleCopy = async () => {
        if (!link) return;
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            toast.success("Link copied to clipboard");
            setTimeout(() => setCopied(false), 1400);
        } catch {
            toast.error("Could not copy — select and copy manually");
        }
    };

    const expiryLabel = expiresAt
        ? new Date(expiresAt).toLocaleString()
        : `${EXPIRES_IN_HOURS_DEFAULT}h`;

    return (
        <AnimatePresence>
            {photo && (
                <motion.div
                    className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div
                        className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
                        initial={{ scale: 0.94, opacity: 0 }}
                        animate={{ scale: 1,    opacity: 1 }}
                        exit={{    scale: 0.94, opacity: 0 }}
                        transition={{ type: "spring", damping: 24, stiffness: 280 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Link2 className="w-4 h-4 text-blue-600" />
                                <h3 className="text-base font-bold text-slate-900">
                                    Share photo
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-1.5 rounded-full hover:bg-slate-100"
                            >
                                <X className="w-4 h-4 text-slate-600" />
                            </button>
                        </div>

                        {/* Target summary */}
                        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
                            {photo.signedUrl ? (
                                <img
                                    src={photo.signedUrl}
                                    alt={photo.metadata.originalName ?? ""}
                                    className="w-12 h-12 rounded-lg object-cover"
                                />
                            ) : (
                                <div className="w-12 h-12 rounded-lg bg-slate-200" />
                            )}
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-800 truncate">
                                    {photo.metadata.originalName ?? "Case photo"}
                                </p>
                                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                                    {photo.metadata.type}
                                </p>
                            </div>
                        </div>

                        {/* Permission picker */}
                        <div className="px-5 py-4 space-y-3">
                            <label className="block text-xs font-semibold text-slate-600">
                                Access level
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <PermissionButton
                                    active={permission === "view"}
                                    disabled={createMut.isPending || !!link}
                                    onClick={() => setPermission("view")}
                                    icon={<Shield className="w-4 h-4" />}
                                    label="View only"
                                    hint="Recipient can open the photo"
                                />
                                <PermissionButton
                                    active={permission === "download"}
                                    disabled={createMut.isPending || !!link}
                                    onClick={() => setPermission("download")}
                                    icon={<Download className="w-4 h-4" />}
                                    label="View + download"
                                    hint="Recipient can save a copy"
                                />
                            </div>
                        </div>

                        {/* Link output */}
                        <div className="px-5 pb-5">
                            {link ? (
                                <>
                                    <div className="flex items-center gap-2">
                                        <input
                                            readOnly
                                            value={link}
                                            className="flex-1 text-xs font-mono bg-slate-100 text-slate-700 px-3 py-2 rounded-lg border border-slate-200 truncate"
                                            onFocus={(e) => e.currentTarget.select()}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleCopy}
                                            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                                        >
                                            {copied ? (
                                                <>
                                                    <Check className="w-3.5 h-3.5" />
                                                    Copied
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="w-3.5 h-3.5" />
                                                    Copy
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <p className="mt-2 text-[11px] text-slate-400">
                                        Expires {expiryLabel}. Image URL is re-signed on every view.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        disabled={createMut.isPending}
                                        onClick={handleGenerate}
                                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
                                    >
                                        {createMut.isPending ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Generating…
                                            </>
                                        ) : (
                                            "Generate link"
                                        )}
                                    </button>
                                    {createMut.isError && (
                                        <p className="mt-2 text-[11px] text-rose-600">
                                            {(createMut.error as any)?.response?.data?.error?.message ??
                                                "Could not generate link. Try again."}
                                        </p>
                                    )}
                                    <p className="mt-2 text-[11px] text-slate-400">
                                        Links are short-lived ({EXPIRES_IN_HOURS_DEFAULT}h) and audited.
                                    </p>
                                </>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const PermissionButton: React.FC<{
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    hint: string;
}> = ({ active, disabled, onClick, icon, label, hint }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex flex-col items-start text-left gap-1 px-3 py-2.5 rounded-lg border text-xs transition-colors ${
            active
                ? "border-blue-400 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    >
        <span className={`inline-flex items-center gap-1.5 font-semibold ${active ? "text-blue-700" : "text-slate-700"}`}>
            {icon}
            {label}
        </span>
        <span className="text-[11px] text-slate-500">{hint}</span>
    </button>
);

export default ShareModal;
