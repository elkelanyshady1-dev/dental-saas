/**
 * BatchLinkModal.tsx — modal for linking N selected assets to a folder.
 *
 * Opened by BatchActionBar's "Link to…" button. Presents two columns:
 * Record Sets + Visits, each listing droppable targets available on the
 * current case. Clicking a target fires N parallel link mutations via
 * Promise.allSettled so partial failures are reported, never swallowed.
 *
 * INVARIANTS:
 *   ✅ Link semantics identical to drag-to-link (same mutations).
 *   ✅ Does NOT duplicate the asset — links only add the recordSet/visit
 *      id to the asset's linkedRecordSetIds / linkedVisitIds array.
 *   ❌ Never closes before the mutations resolve (ok + fail counts shown).
 */

import React, { useState } from "react";
import { toast } from "sonner";
import { X, Link2, FolderKanban, Stethoscope, Loader2 } from "lucide-react";
import type { PoolDescriptor } from "./types";

export interface BatchLinkModalProps {
    open:       boolean;
    photoIds:   string[];
    recordSets: PoolDescriptor[];
    visits:     PoolDescriptor[];
    onClose:    () => void;
    onLinkRecordSet: (photoId: string, recordSetId: string) => Promise<unknown>;
    onLinkVisit:     (photoId: string, visitId: string)     => Promise<unknown>;
}

type Target = { kind: "recordSet" | "visit"; refId: string; label: string };

const BatchLinkModal: React.FC<BatchLinkModalProps> = ({
    open,
    photoIds,
    recordSets,
    visits,
    onClose,
    onLinkRecordSet,
    onLinkVisit,
}) => {
    const [pending, setPending] = useState<Target | null>(null);
    if (!open) return null;

    const handlePick = async (target: Target) => {
        if (pending) return;
        setPending(target);
        try {
            const run =
                target.kind === "recordSet"
                    ? (id: string) => onLinkRecordSet(id, target.refId)
                    : (id: string) => onLinkVisit(id, target.refId);

            const results = await Promise.allSettled(photoIds.map(run));
            const ok     = results.filter((r) => r.status === "fulfilled").length;
            const failed = results.length - ok;

            if (ok > 0 && failed === 0) {
                toast.success(`${ok} asset${ok === 1 ? "" : "s"} linked to ${target.label}`);
            } else if (ok > 0 && failed > 0) {
                toast.warning(`${ok} linked to ${target.label} (${failed} failed)`);
            } else {
                const first = results[0] as PromiseRejectedResult | undefined;
                const msg =
                    (first?.reason as any)?.response?.data?.error?.message ??
                    (first?.reason as any)?.message ??
                    "Could not link assets. Please retry.";
                toast.error(msg);
            }
            onClose();
        } finally {
            setPending(null);
        }
    };

    const disabled = pending !== null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div
                onClick={disabled ? undefined : onClose}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                <header className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Link2 className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900">Link {photoIds.length} asset{photoIds.length === 1 ? "" : "s"} to…</h3>
                            <p className="text-[11px] text-slate-500">Linking never moves the file — assets stay in the Inbox.</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={disabled}
                        className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </header>

                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-6 max-h-96 overflow-y-auto">
                    <Column
                        title="Record Sets"
                        icon={<FolderKanban className="w-3.5 h-3.5" />}
                        items={recordSets}
                        pending={pending}
                        kind="recordSet"
                        onPick={handlePick}
                    />
                    <Column
                        title="Visits"
                        icon={<Stethoscope className="w-3.5 h-3.5" />}
                        items={visits}
                        pending={pending}
                        kind="visit"
                        onPick={handlePick}
                    />
                </div>
            </div>
        </div>
    );
};

const Column: React.FC<{
    title: string;
    icon: React.ReactNode;
    items: PoolDescriptor[];
    pending: Target | null;
    kind: "recordSet" | "visit";
    onPick: (target: Target) => void;
}> = ({ title, icon, items, pending, kind, onPick }) => (
    <section>
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            {icon}
            <span>{title}</span>
        </div>
        {items.length === 0 ? (
            <p className="text-xs text-slate-400 italic">None available.</p>
        ) : (
            <ul className="space-y-1">
                {items.map((p) => {
                    const target: Target = { kind, refId: String(p.id.refId), label: p.label };
                    const isPending =
                        pending !== null &&
                        pending.kind === target.kind &&
                        pending.refId === target.refId;
                    return (
                        <li key={`${kind}:${target.refId}`}>
                            <button
                                type="button"
                                disabled={pending !== null}
                                onClick={() => onPick(target)}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="truncate text-left">{p.label}</span>
                                {isPending ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                ) : (
                                    <span className="text-[11px] text-slate-400 tabular-nums">{p.count}</span>
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>
        )}
    </section>
);

export default BatchLinkModal;
