/**
 * LabClaims.jsx — Claims & Billing Page
 *
 * Matches design: KPI summary cards, Active Claims table with approve/reject actions,
 * Lab Performance accordion, Import Bulk Statement panel.
 */

import React, { useState } from "react";
import { useLabClaims, useApproveClaim, useMarkClaimPaid } from "../hooks/useLab";

const STATUS_STYLES = {
    pending:  { label: "Pending",  color: "#F59E0B", bg: "#FEF3C7" },
    approved: { label: "Approved", color: "#3B82F6", bg: "#EFF6FF" },
    paid:     { label: "Paid",     color: "#10B981", bg: "#D1FAE5" },
};

function ClaimStatusBadge({ status }) {
    const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
    return (
        <span className="lab-claim-badge" style={{ color: s.color, background: s.bg }}>
            ● {s.label}
        </span>
    );
}

function SummaryCard({ label, value, sub, dark }) {
    return (
        <div className={`lab-claims-summary-card ${dark ? "dark" : ""}`}>
            {sub && <span className="lab-claims-card-sub">{sub}</span>}
            <p className="lab-claims-card-label">{label}</p>
            <h2 className="lab-claims-card-value">{value}</h2>
        </div>
    );
}

export default function LabClaims() {
    const [page, setPage] = useState(1);
    const { data, isLoading } = useLabClaims({ page });
    const approve = useApproveClaim();
    const markPaid = useMarkClaimPaid();

    const claims  = data?.data   || [];
    const summary = data?.summary || {};
    const total   = data?.pagination?.total || 0;

    return (
        <div className="lab-claims-page">
            {/* ─── Header ─── */}
            <div className="lab-claims-header">
                <div>
                    <h1 className="lab-page-title">Claims & Billing</h1>
                    <p className="lab-dir-desc">Manage external lab reconciliation and approval workflows for orthodontic appliances and diagnostic services.</p>
                </div>
                <button className="lab-btn-primary">↓ Export Statement</button>
            </div>

            {/* ─── Summary Cards ─── */}
            <div className="lab-claims-summary">
                <SummaryCard
                    label="Total Lab Expenses"
                    value={`$${(summary.totalExpenses || 42850).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                    sub="+12% vs last month"
                />
                <SummaryCard
                    label="Pending Payments"
                    value={`$${(summary.pendingPayments || 8240.5).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                />
                <SummaryCard
                    label="Approved for Payout"
                    value={`$${(summary.approved || 12180).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                    dark
                />
            </div>

            {/* ─── Active Claims Table ─── */}
            <div className="lab-panel">
                <div className="lab-panel-header">
                    <h3 className="lab-section-title">Active Claims</h3>
                    <div className="lab-panel-actions">
                        <button className="lab-btn-outline">Filter</button>
                        <button className="lab-btn-outline">Sort by Date</button>
                    </div>
                </div>
                <table className="lab-table">
                    <thead>
                        <tr>
                            <th>CASE ID</th>
                            <th>LABORATORY</th>
                            <th>APPLIANCE TYPE</th>
                            <th>SERVICE DATE</th>
                            <th>COST</th>
                            <th>STATUS</th>
                            <th>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan="7" className="lab-loading">Loading claims…</td></tr>
                        ) : claims.length === 0 ? (
                            <tr><td colSpan="7" className="lab-empty">No claims found</td></tr>
                        ) : (
                            claims.map(c => (
                                <tr key={c._id} className="lab-table-row">
                                    <td><span className="lab-case-link">#{c.caseCode}</span></td>
                                    <td>
                                        <div className="lab-name-cell">
                                            <div className="lab-avatar-placeholder" style={{ background: "#3B82F6", width: 28, height: 28, fontSize: 12 }}>
                                                {(c.labName || "L")[0]}
                                            </div>
                                            {c.labName || "—"}
                                        </div>
                                    </td>
                                    <td>{c.applianceType || "—"}</td>
                                    <td>{c.serviceDate ? new Date(c.serviceDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
                                    <td><strong>${(c.cost || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></td>
                                    <td><ClaimStatusBadge status={c.status} /></td>
                                    <td>
                                        <div className="lab-claim-actions">
                                            {c.status === "pending" && (
                                                <>
                                                    <button
                                                        className="lab-action-approve"
                                                        title="Approve"
                                                        onClick={() => approve.mutate(c._id)}
                                                        disabled={approve.isPending}
                                                    >✓</button>
                                                    <button className="lab-action-reject" title="Reject">✗</button>
                                                </>
                                            )}
                                            {c.status === "approved" && (
                                                <button
                                                    className="lab-action-approve"
                                                    title="Mark Paid"
                                                    onClick={() => markPaid.mutate(c._id)}
                                                    disabled={markPaid.isPending}
                                                >💾</button>
                                            )}
                                            {c.status === "paid" && (
                                                <span className="lab-action-done">📄</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
                <div className="lab-table-footer">
                    <span>Showing {claims.length} of {total} claims</span>
                    <div className="lab-pagination">
                        {[1,2,3].map(p => (
                            <button
                                key={p}
                                className={`lab-page-btn ${page === p ? "active" : ""}`}
                                onClick={() => setPage(p)}
                            >{p}</button>
                        ))}
                        <span>…</span>
                    </div>
                    <button className="lab-fab-sm">+</button>
                </div>
            </div>

            {/* ─── Bottom Row ─── */}
            <div className="lab-claims-bottom">
                {/* Lab Performance */}
                <div className="lab-panel">
                    <h3 className="lab-section-title">Laboratory Performance</h3>
                    <p className="lab-section-sub">Analyze lab turnaround times vs. cost efficiency for the last quarter.</p>
                    {[
                        { name: "Precision Ortho Lab", label: "Excellent Efficiency", pct: 85, color: "#3B82F6" },
                        { name: "Apex Biocentrics",    label: "Average Turnaround",   pct: 45, color: "#EF4444" },
                    ].map(l => (
                        <div key={l.name} className="lab-perf-item">
                            <div className="lab-perf-header">
                                <span>{l.name}</span>
                                <span style={{ color: l.pct > 60 ? "#10B981" : "#F59E0B" }}>{l.label}</span>
                            </div>
                            <div className="lab-perf-bar-track">
                                <div className="lab-perf-bar" style={{ width: l.pct + "%", background: l.color }} />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Import Bulk Statement */}
                <div className="lab-panel lab-import-panel">
                    <div className="lab-import-icon">↑</div>
                    <h4>Import Bulk Statement</h4>
                    <p>Upload your monthly CSV or XML statement directly from lab partners.</p>
                    <button className="lab-link-btn">Select files to upload</button>
                </div>
            </div>
        </div>
    );
}
