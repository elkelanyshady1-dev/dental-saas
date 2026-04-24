/**
 * PhotoShareViewer.tsx — public read-only asset viewer for share links.
 *
 * Mounted at /share/photo/:token (public route).
 *
 * 🚨 CONTRACT LOCK (FINAL)
 *   Frontend NEVER guesses fileType. The backend MUST return
 *     { fileType, mimeType, signedUrl, fileName }
 *   on the /share-links/:token resolve. If `fileType` is missing we
 *   render a visible error card — silent fallbacks are banned.
 *
 *   The viewer delegates rendering to the same file-type renderer
 *   registry the org-plane AssetCard uses (`getRenderer(fileType)`).
 *
 * 🚨 SECURITY INVARIANTS
 *   - Token lives ONLY in the URL (useParams). Never copied to local
 *     storage / session storage / global cache.
 *   - signedUrl is held in React Query memory only with gcTime=0 so
 *     it is purged on unmount (no cross-page leakage).
 *   - storageKey / checksum are NEVER on the wire.
 */

import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, ShieldAlert, Clock, ImageOff, AlertTriangle } from "lucide-react";
import api from "@/services/api";
import { getRenderer } from "@/org/modules/patients/components/orthodontic-chart/components/cases/case-photos/renderers";
import type {
    PhotoDTO,
    FileType,
    PhotoType,
} from "@/org/modules/patients/components/orthodontic-chart/hooks/usePhotos";

type SharePermission = "view" | "download";
type ResourceType = "photo";

interface ResolvedShare {
    type: ResourceType;
    permission: SharePermission;
    signedUrl: string;
    /** Backend-authoritative rendering class. REQUIRED. */
    fileType: FileType;
    mimeType: string;
    fileName?: string | null;
    sizeBytes?: number | null;
    expiresAt?: string | null;
}

// ─── Resolver ────────────────────────────────────────────────────────────────

async function resolveShare(token: string): Promise<ResolvedShare> {
    const res = await api.get(`/share-links/${encodeURIComponent(token)}`);
    const payload = res.data?.data ?? res.data;
    if (!payload?.signedUrl) {
        throw new Error("PHOTO_NOT_FOUND");
    }
    return payload as ResolvedShare;
}

// Map backend error codes to UX states. Any other error falls through to
// a generic "unavailable" message — never leak provider details.
function readErrorCode(err: any): string | null {
    return err?.response?.data?.error?.code ?? null;
}

/**
 * Map a backend fileType to a sensible clinical `metadata.type` for the
 * renderer stub. Renderers only use this for badges (not rendered on the
 * share page) — neutral defaults are fine.
 */
function metadataTypeFor(fileType: FileType): PhotoType {
    switch (fileType) {
        case "pdf":   return "document";
        case "3d":    return "stl";
        case "dicom": return "dicom";
        default:      return "intraoral";
    }
}

// ─── View ────────────────────────────────────────────────────────────────────
//
// The route is mounted inside the root <QueryProvider> (App.jsx), so
// this component no longer self-wraps. Rule 11.5 — single shared client.

const PhotoShareViewer: React.FC = () => {
    const { token } = useParams<{ token: string }>();

    const { data, isLoading, isError, error, isFetching } = useQuery<ResolvedShare>({
        queryKey: ["share-link", token],
        queryFn:  () => resolveShare(token as string),
        enabled:  typeof token === "string" && token.length > 0,
        refetchInterval: 50_000,
        refetchOnWindowFocus: true,
        gcTime: 0,
        staleTime: 0,
        retry: (failureCount, e: any) => {
            const code = readErrorCode(e);
            if (code === "INVALID_LINK" || code === "LINK_EXPIRED" || code === "PHOTO_NOT_FOUND") {
                return false;
            }
            return failureCount < 1;
        },
    });

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            <header className="px-6 py-4 bg-white border-b border-slate-200">
                <h1 className="text-base font-bold text-slate-900">Shared Asset</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                    {data?.expiresAt
                        ? `Link expires ${new Date(data.expiresAt).toLocaleString()}`
                        : "Read-only view"}
                </p>
            </header>

            <main className="flex-1 flex items-center justify-center p-6">
                {isLoading ? (
                    <LoadingState />
                ) : isError ? (
                    <ErrorState code={readErrorCode(error)} />
                ) : data ? (
                    <AssetPanel data={data} refreshing={isFetching} />
                ) : (
                    <ErrorState code="PHOTO_NOT_FOUND" />
                )}
            </main>

            <footer className="px-6 py-3 text-center text-[11px] text-slate-400">
                This link is short-lived. Refresh the page if the asset stops loading.
            </footer>
        </div>
    );
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const LoadingState: React.FC = () => (
    <div className="flex flex-col items-center text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="mt-3 text-sm">Resolving link…</p>
    </div>
);

const AssetPanel: React.FC<{ data: ResolvedShare; refreshing: boolean }> = ({
    data,
    refreshing,
}) => {
    const canDownload = data.permission === "download";

    // 🚨 CONTRACT LOCK — frontend NEVER infers fileType. If the backend
    //    didn't stamp it, that's an ASSET_CONTRACT_VIOLATION. Render a
    //    visible error card so the failure is not silent.
    if (!data.fileType || !data.mimeType) {
        return <ContractViolation data={data} />;
    }

    // Synthesize a minimal PhotoDTO so the org-plane renderer registry
    // can be reused verbatim. Fields that only make sense in-plane
    // (caseId, linkedRecordSetIds, provenance) are stubbed.
    const syntheticPhoto = useMemo<PhotoDTO>(() => {
        return {
            id:        "share",
            caseId:    "",
            signedUrl: data.signedUrl,
            fileType:  data.fileType,
            mimeType:  data.mimeType,
            fileName:  data.fileName ?? null,
            metadata: {
                type:         metadataTypeFor(data.fileType),
                fileType:     data.fileType,
                orientation:  null,
                tags:         [],
                originalName: data.fileName ?? null,
                mimeType:     data.mimeType,
                sizeBytes:    data.sizeBytes ?? null,
            },
            uploadedAt:         null,
            uploadedBy:         null,
            linkedRecordSetIds: [],
            linkedVisitIds:     [],
            provenance:         [],
        };
    }, [data]);

    const renderer = getRenderer(syntheticPhoto.fileType);
    const DrawerPreview = renderer.DrawerPreview;

    const handleDownload = async () => {
        if (!canDownload) return;
        try {
            const res = await fetch(data.signedUrl, { credentials: "omit" });
            if (!res.ok) throw new Error("Download failed");
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = objectUrl;
            a.download = data.fileName ?? "shared-asset";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(objectUrl);
        } catch {
            // Silent — UX-wise the user can right-click + Save instead.
        }
    };

    return (
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="relative bg-slate-50 flex items-center justify-center min-h-[320px] px-4 py-6">
                {data.signedUrl ? (
                    <DrawerPreview photo={syntheticPhoto} />
                ) : (
                    <div className="py-20 text-slate-400 flex flex-col items-center gap-2">
                        <ImageOff className="w-8 h-8" />
                        <span className="text-sm">Asset unavailable</span>
                    </div>
                )}
                {refreshing && (
                    <div className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 text-[10px] font-semibold text-slate-500 shadow-sm">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Refreshing
                    </div>
                )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500 truncate">
                    {data.fileName ?? "Shared asset"}
                </p>
                <button
                    type="button"
                    onClick={handleDownload}
                    disabled={!canDownload}
                    title={
                        canDownload
                            ? "Download a copy"
                            : "This link is view-only"
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    <Download className="w-4 h-4" />
                    Download
                </button>
            </div>
        </div>
    );
};

/**
 * ContractViolation — visible error surface for missing fileType/mimeType.
 * Replaces the legacy silent fallback. Downstream tooling can key on the
 * "ASSET_CONTRACT_VIOLATION" label in a screenshot.
 */
const ContractViolation: React.FC<{ data: ResolvedShare }> = ({ data }) => (
    <div className="max-w-md text-center bg-white rounded-2xl shadow-sm border border-rose-200 px-8 py-10 text-slate-600">
        <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">ASSET_CONTRACT_VIOLATION</h2>
        <p className="mt-2 text-sm text-slate-500">
            This share link is missing its <code className="font-mono text-xs">fileType</code> /{" "}
            <code className="font-mono text-xs">mimeType</code>. The backend must stamp both fields
            before the viewer can render safely. No guessing happens here by design.
        </p>
        {data.signedUrl && (
            <a
                href={data.signedUrl}
                download={data.fileName ?? undefined}
                className="mt-5 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
            >
                <Download className="w-3.5 h-3.5" />
                Download file
            </a>
        )}
    </div>
);

const ErrorState: React.FC<{ code: string | null }> = ({ code }) => {
    const { icon, title, hint } = (() => {
        switch (code) {
            case "INVALID_LINK":
                return {
                    icon: <ShieldAlert className="w-8 h-8" />,
                    title: "Invalid link",
                    hint:  "This link is malformed or has been revoked.",
                };
            case "LINK_EXPIRED":
                return {
                    icon: <Clock className="w-8 h-8" />,
                    title: "Link expired",
                    hint:  "Ask the sender for a new link.",
                };
            case "PHOTO_NOT_FOUND":
                return {
                    icon: <ImageOff className="w-8 h-8" />,
                    title: "File unavailable",
                    hint:  "The shared file is no longer accessible.",
                };
            default:
                return {
                    icon: <ShieldAlert className="w-8 h-8" />,
                    title: "Could not load",
                    hint:  "Please try again in a moment.",
                };
        }
    })();

    return (
        <div className="max-w-sm text-center bg-white rounded-2xl shadow-sm border border-slate-200 px-8 py-10 text-slate-600">
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mb-4">
                {icon}
            </div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm text-slate-500">{hint}</p>
        </div>
    );
};

export default PhotoShareViewer;
