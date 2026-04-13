/**
 * BillingPage.jsx — Settings Hub: Billing & Subscription Overview
 *
 * Screens:
 *   1. Current Plan card
 *   2. Usage quotas (progress bars)
 *   3. Invoice history table
 *
 * Architecture:
 *   Uses useSubscription, useInvoiceHistory, useUsageQuotas hooks
 *   Permission: billing.read
 *   Data source: DTO only
 *
 * @module modules/org/settings/pages/BillingPage
 */

import { useState } from "react";
import {
    CreditCardIcon,
    ArrowPathIcon,
    ArrowDownTrayIcon,
    ChartBarIcon,
    SparklesIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import SettingsBreadcrumb from "@/components/settings/SettingsBreadcrumb";

import { useCapability } from "@/hooks/useCapability";
import { P } from "@/generated/permissionKeys";
import { useSubscription, useInvoiceHistory, useUsageQuotas } from "../hooks/useSettingsBilling";
import StatusBadge from "../components/StatusBadge";

// ─── Formatting ──────────────────────────────────────────────────────────────
function formatCurrency(minorUnits, currency = "USD") {
    const major = (minorUnits || 0) / 100;
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(major);
}

function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Progress Bar ────────────────────────────────────────────────────────────
function UsageBar({ label, used, limit, unit, color = "blue" }) {
    const isUnlimited = limit === -1;
    const pct = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);
    const isHigh = pct > 80;

    const colorMap = {
        blue:    { bar: "bg-blue-500", track: "bg-blue-500/15" },
        emerald: { bar: "bg-emerald-500", track: "bg-emerald-500/15" },
        purple:  { bar: "bg-purple-500", track: "bg-purple-500/15" },
        amber:   { bar: "bg-amber-500", track: "bg-amber-500/15" },
    };
    const c = isHigh
        ? { bar: "bg-red-500", track: "bg-red-500/15" }
        : (colorMap[color] || colorMap.blue);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300 font-medium">{label}</span>
                <span className="text-xs text-slate-500">
                    {used} / {isUnlimited ? "∞" : limit} {unit}
                </span>
            </div>
            <div className={`h-2 rounded-full ${c.track} overflow-hidden`}>
                <div
                    className={`h-full rounded-full ${c.bar} transition-all duration-500`}
                    style={{ width: isUnlimited ? "0%" : `${pct}%` }}
                />
            </div>
        </div>
    );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function CardSkeleton({ lines = 3 }) {
    return (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-4 animate-pulse">
            <div className="h-5 w-32 bg-slate-800 rounded-md" />
            {Array.from({ length: lines }).map((_, i) => (
                <div key={i} className="h-4 bg-slate-800/60 rounded-md" style={{ width: `${80 - i * 15}%` }} />
            ))}
        </div>
    );
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export default function BillingPage() {
    const canRead = useCapability(P.BILLING_READ);
    const { data: subscription, isLoading: subLoading } = useSubscription();
    const { data: quotas = [], isLoading: quotaLoading } = useUsageQuotas();

    // Invoice pagination
    const [invoicePage, setInvoicePage] = useState(0);
    const LIMIT = 10;
    const { data: invoices = [], isLoading: invLoading } = useInvoiceHistory({
        limit: LIMIT,
        skip: invoicePage * LIMIT,
    });

    // Invoice search/filter
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");

    const filteredInvoices = invoices.filter(inv => {
        if (statusFilter !== "all" && inv.status !== statusFilter) return false;
        if (search && !inv.invoiceNo?.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    if (!canRead) {
        return (
            <div className="p-8">
                <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-6 text-center">
                    <p className="text-sm text-red-400 font-medium">You don't have permission to view billing information.</p>
                </div>
            </div>
        );
    }

    const quotaColors = ["blue", "emerald", "purple", "amber"];

    return (
        <div className="p-6 lg:p-8 max-w-5xl space-y-6">
            <SettingsBreadcrumb current="Billing & Subscription" />
            {/* Header */}
            <header>
                <h1 className="text-2xl font-bold text-white">Billing & Subscription</h1>
                <p className="text-sm text-slate-400 mt-1">Manage your plan, view invoices, and monitor usage.</p>
            </header>

            {/* ── Top Row: Plan + Payment ──────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Current Plan */}
                {subLoading ? <CardSkeleton lines={4} /> : (
                    <div className="lg:col-span-2 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                                    <SparklesIcon className="w-5 h-5 text-blue-400" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-white">Current Plan</h2>
                                    <p className="text-xs text-slate-500">Billing overview</p>
                                </div>
                            </div>
                            {subscription && <StatusBadge status={subscription.status} />}
                        </div>

                        {subscription ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Plan</p>
                                        <p className="text-lg font-bold text-white">{subscription.planName}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Price</p>
                                        <p className="text-lg font-bold text-white">
                                            {formatCurrency(subscription.amountMinor, subscription.currency)}
                                            <span className="text-xs text-slate-500 font-normal ml-1">
                                                /{subscription.billingInterval}
                                            </span>
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800/60">
                                    <div>
                                        <p className="text-xs text-slate-500">Current Period</p>
                                        <p className="text-sm text-slate-300">
                                            {formatDate(subscription.currentPeriodStart)} → {formatDate(subscription.currentPeriodEnd)}
                                        </p>
                                    </div>
                                    {subscription.trialEnd && (
                                        <div>
                                            <p className="text-xs text-slate-500">Trial Ends</p>
                                            <p className="text-sm text-amber-400">{formatDate(subscription.trialEnd)}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-3 pt-3">
                                    <button className="px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-500/25">
                                        Upgrade Plan
                                    </button>
                                    <button className="px-5 py-2.5 rounded-xl border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white text-sm font-medium transition-all">
                                        <ArrowPathIcon className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                                        Manage Billing
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="py-6 text-center">
                                <p className="text-sm text-slate-400">No active subscription found.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Payment Method */}
                <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                            <CreditCardIcon className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white">Payment</h2>
                            <p className="text-xs text-slate-500">Card on file</p>
                        </div>
                    </div>

                    <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-800/40 border border-slate-700/50 p-4 mb-4">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex gap-1">
                                {[1,2,3,4].map(i => (
                                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                ))}
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Visa</span>
                        </div>
                        <p className="text-sm text-slate-300 font-mono tracking-widest mb-2">•••• •••• •••• 4242</p>
                        <p className="text-[11px] text-slate-500">Expires 12/27</p>
                    </div>

                    <button className="w-full py-2.5 rounded-xl border border-slate-700 hover:border-blue-500/30 text-sm text-slate-300 hover:text-white font-medium transition-all">
                        Update Card
                    </button>
                </div>
            </div>

            {/* ── Usage Quotas ─────────────────────────────────────────────────── */}
            {quotaLoading ? <CardSkeleton lines={3} /> : quotas.length > 0 && (
                <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                            <ChartBarIcon className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white">Usage</h2>
                            <p className="text-xs text-slate-500">Current resource consumption</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        {quotas.map((q, i) => (
                            <UsageBar
                                key={q.feature}
                                label={q.displayName}
                                used={q.used}
                                limit={q.limit}
                                unit={q.unit}
                                color={quotaColors[i % quotaColors.length]}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Invoice History ──────────────────────────────────────────────── */}
            <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
                    <h2 className="text-base font-bold text-white">Invoice History</h2>

                    <div className="flex items-center gap-3">
                        {/* Search */}
                        <div className="relative">
                            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search invoice"
                                className="pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-44"
                            />
                        </div>

                        {/* Status filter */}
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 appearance-none"
                        >
                            <option value="all">All Status</option>
                            <option value="paid">Paid</option>
                            <option value="open">Open</option>
                            <option value="draft">Draft</option>
                            <option value="void">Void</option>
                        </select>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-800/60">
                                <th className="text-left px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Invoice</th>
                                <th className="text-left px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                                <th className="text-left px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                                <th className="text-left px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="text-right px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {invLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        {Array.from({ length: 5 }).map((_, j) => (
                                            <td key={j} className="px-6 py-3.5">
                                                <div className="h-4 bg-slate-800 rounded-md w-20" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : filteredInvoices.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">
                                        No invoices found.
                                    </td>
                                </tr>
                            ) : (
                                filteredInvoices.map(inv => (
                                    <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-6 py-3.5 text-sm text-white font-medium">
                                            {inv.invoiceNo || `#${inv.id?.slice(-6)}`}
                                        </td>
                                        <td className="px-6 py-3.5 text-sm text-slate-400">
                                            {formatDate(inv.createdAt)}
                                        </td>
                                        <td className="px-6 py-3.5 text-sm text-white font-medium">
                                            {formatCurrency(inv.amount, inv.currency)}
                                        </td>
                                        <td className="px-6 py-3.5">
                                            <StatusBadge status={inv.status} />
                                        </td>
                                        <td className="px-6 py-3.5 text-right">
                                            {inv.pdfUrl ? (
                                                <a
                                                    href={inv.pdfUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
                                                >
                                                    <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                                                    Download
                                                </a>
                                            ) : (
                                                <span className="text-xs text-slate-600">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-3 border-t border-slate-800/60 flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                        Showing {filteredInvoices.length} invoices
                    </p>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setInvoicePage(p => Math.max(0, p - 1))}
                            disabled={invoicePage === 0}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeftIcon className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-slate-400 px-2">Page {invoicePage + 1}</span>
                        <button
                            onClick={() => setInvoicePage(p => p + 1)}
                            disabled={invoices.length < LIMIT}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRightIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
