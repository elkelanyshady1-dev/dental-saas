/**
 * LabDirectory.jsx — Verified Lab Partners Directory
 *
 * Matches design: searchable table with specialty pills, rating stars,
 * turnaround, status badge, View Profile / Send Case CTAs.
 */

import React, { useState } from "react";
import { useNavigate }      from "react-router-dom";
import { useLabPartners }   from "../hooks/useLab";

const SPECIALTY_FILTERS = ["All Labs", "Clear Aligners", "3D Printing", "Fixed"];

function StarRating({ value, count }) {
    const full = Math.floor(value);
    return (
        <span className="lab-stars">
            {"★".repeat(full)}{"☆".repeat(5 - full)}
            <span className="lab-rating-num">{value?.toFixed(1)} ({count})</span>
        </span>
    );
}

function StatusPill({ status }) {
    const map = {
        active:      { label: "ACTIVE",      color: "#10B981", bg: "#D1FAE5" },
        inactive:    { label: "INACTIVE",     color: "#EF4444", bg: "#FEE2E2" },
        maintenance: { label: "MAINTENANCE",  color: "#F59E0B", bg: "#FEF3C7" },
    };
    const s = map[status] || map.active;
    return (
        <span className="lab-status-pill" style={{ color: s.color, background: s.bg }}>
            {s.label}
        </span>
    );
}

function LabAvatar({ name, avatar }) {
    if (avatar) return <img src={avatar} alt={name} className="lab-avatar-img" />;
    const initials = name?.split(" ").map(w => w[0]).slice(0, 2).join("") || "LB";
    const colors = ["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EF4444"];
    const color = colors[name?.charCodeAt(0) % colors.length] || "#3B82F6";
    return <div className="lab-avatar-placeholder" style={{ background: color }}>{initials}</div>;
}

export default function LabDirectory() {
    const navigate = useNavigate();
    const [activeFilter, setActiveFilter] = useState("All Labs");
    const [search, setSearch] = useState("");

    const { data, isLoading } = useLabPartners({ status: "active", search: search || undefined });
    const labs = data?.data || [];

    return (
        <div className="lab-directory">
            {/* ─── Breadcrumb ─── */}
            <div className="lab-breadcrumb">Network / <span>Lab Directory</span></div>

            {/* ─── Header ─── */}
            <div className="lab-dir-header">
                <div>
                    <h1 className="lab-page-title">Verified Lab Partners</h1>
                    <p className="lab-dir-desc">
                        Connect with premier orthodontic laboratories across the country.
                        Filter by clinical specialty and compare performance metrics.
                    </p>
                </div>
                <div className="lab-dir-actions">
                    <button className="lab-btn-outline">⚙ Specialty Filters</button>
                    <button className="lab-btn-outline">↓ Export List</button>
                </div>
            </div>

            {/* ─── Quick Filters + Stats ─── */}
            <div className="lab-filter-bar">
                <div className="lab-filter-chips">
                    <span className="lab-filter-label">Quick Filter:</span>
                    {SPECIALTY_FILTERS.map(f => (
                        <button
                            key={f}
                            className={`lab-chip ${activeFilter === f ? "active" : ""}`}
                            onClick={() => setActiveFilter(f)}
                        >{f}</button>
                    ))}
                </div>
                <div className="lab-dir-stats">
                    <div className="lab-dir-stat"><span>🌐</span><div><small>ACTIVE PARTNERSHIPS</small><strong>{labs.length || 24} Labs</strong></div></div>
                    <div className="lab-dir-stat"><span>⏱</span><div><small>AVERAGE TURNAROUND</small><strong>4.2 Days</strong></div></div>
                </div>
            </div>

            {/* ─── Table ─── */}
            <div className="lab-dir-table-wrap">
                <table className="lab-table">
                    <thead>
                        <tr>
                            <th>LAB NAME & LOCATION</th>
                            <th>SPECIALTIES</th>
                            <th>TURNAROUND</th>
                            <th>RATING</th>
                            <th>STATUS</th>
                            <th>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan="6" className="lab-loading">Loading partners…</td></tr>
                        ) : labs.length === 0 ? (
                            <tr><td colSpan="6" className="lab-empty">No labs found</td></tr>
                        ) : (
                            labs.map(lab => (
                                <tr key={lab._id} className="lab-table-row">
                                    <td>
                                        <div className="lab-name-cell">
                                            <LabAvatar name={lab.name} avatar={lab.avatar} />
                                            <div>
                                                <strong>{lab.name}</strong>
                                                <p className="lab-location">📍 {lab.location || "—"}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="lab-specialty-pills">
                                            {(lab.specialties || []).slice(0, 3).map(s => (
                                                <span key={s} className="lab-specialty-pill">{s.toUpperCase()}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td>
                                        {lab.turnaroundDays
                                            ? `${lab.turnaroundDays} Days`
                                            : "—"}
                                    </td>
                                    <td><StarRating value={lab.rating} count={lab.ratingCount} /></td>
                                    <td><StatusPill status={lab.status} /></td>
                                    <td>
                                        <div className="lab-table-actions">
                                            <button
                                                className="lab-btn-ghost"
                                                onClick={() => navigate(`/org/labs/${lab._id}`)}
                                            >View Profile</button>
                                            <button
                                                className={`lab-btn-primary ${lab.status !== "active" ? "disabled" : ""}`}
                                                disabled={lab.status !== "active"}
                                                onClick={() => navigate("/org/lab-cases/new", { state: { labId: lab._id, labName: lab.name } })}
                                            >Send Case</button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* ─── Footer CTAs ─── */}
            <div className="lab-dir-footer">
                <div className="lab-dir-invite-card">
                    <h4>Can't find your lab?</h4>
                    <p>Invite your current laboratory partners to OrthoFlow to centralize your clinical management and case tracking.</p>
                    <button className="lab-btn-outline-white">Invite a Lab Partner</button>
                </div>
                <div className="lab-dir-standards-card">
                    <div className="lab-standards-icon">🛡</div>
                    <h4>Verified Lab Standards</h4>
                    <p>All labs in our directory undergo a rigorous 12-point clinical verification process covering equipment calibration, material safety, and turnaround reliability.</p>
                    <button className="lab-link-btn">Learn about our standards →</button>
                </div>
            </div>
        </div>
    );
}
