/**
 * LabKanban.jsx — Case Tracking Kanban Board
 *
 * Matches design: multi-column Kanban with case cards.
 * Drag-and-drop via native HTML5 (no extra deps required).
 * Columns: draft | sent | accepted | in_production | shipped | delivered
 */

import React, { useState } from "react";
import { useNavigate }      from "react-router-dom";
import { useLabKanban, useUpdateCaseStatus } from "../hooks/useLab";

const COLUMNS = [
    { key: "draft",         label: "DRAFT",       dot: "#9CA3AF" },
    { key: "sent",          label: "SENT",         dot: "#3B82F6" },
    { key: "accepted",      label: "ACCEPTED",     dot: "#3B82F6" },
    { key: "in_production", label: "IN PRODUCTION",dot: "#F59E0B" },
    { key: "shipped",       label: "SHIPPED",      dot: "#06B6D4" },
    { key: "delivered",     label: "DELIVERED",    dot: "#10B981" },
];

function CaseCard({ c, onDragStart, onClick }) {
    return (
        <div
            className="lab-kanban-card"
            draggable
            onDragStart={onDragStart}
            onClick={onClick}
        >
            <div className="lab-kanban-card-header">
                <span className="lab-case-code">#{c.caseCode}</span>
                <button className="lab-icon-btn" onClick={e => e.stopPropagation()}>⋮</button>
            </div>
            <strong className="lab-kanban-patient">{c.patientName || "Unknown Patient"}</strong>
            <p className="lab-kanban-appliance">{c.applianceType}</p>
            <div className="lab-kanban-lab">
                <span className="lab-lab-icon">🔬</span>
                <span className="lab-kanban-labname">{c.labName || "—"}</span>
            </div>
            {c.expectedDelivery && (
                <div className="lab-kanban-progress">
                    <div className="lab-kanban-progress-bar" style={{ width: "65%" }} />
                </div>
            )}
        </div>
    );
}

export default function LabKanban() {
    const navigate = useNavigate();
    const { data, isLoading } = useLabKanban();
    const updateStatus = useUpdateCaseStatus(null);

    const [dragging, setDragging] = useState(null);

    const board  = data?.data?.board  || {};
    const counts = {};
    for (const col of COLUMNS) counts[col.key] = (board[col.key] || []).length;

    function handleDragStart(caseId, fromCol) {
        setDragging({ caseId, fromCol });
    }

    function handleDrop(toCol) {
        if (!dragging || dragging.fromCol === toCol.key) return;
        updateStatus.mutate({ id: dragging.caseId, status: toCol.key });
        setDragging(null);
    }

    return (
        <div className="lab-kanban-page">
            {/* Header */}
            <div className="lab-kanban-header">
                <h1 className="lab-page-title" style={{ color: "#2563EB" }}>Case Tracking</h1>
                <input type="text" className="lab-search" placeholder="🔍 Search Case ID or Patient..." />
            </div>

            {/* Board */}
            <div className="lab-kanban-board">
                {COLUMNS.map(col => (
                    <div
                        key={col.key}
                        className="lab-kanban-column"
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => handleDrop(col)}
                    >
                        <div className="lab-kanban-col-header">
                            <span className="lab-kanban-col-dot" style={{ background: col.dot }} />
                            <span className="lab-kanban-col-label">{col.label}</span>
                            <span className="lab-kanban-col-count">{counts[col.key] || 0}</span>
                        </div>
                        <div className="lab-kanban-col-body">
                            {isLoading ? (
                                <div className="lab-loading">Loading…</div>
                            ) : (board[col.key] || []).map(c => (
                                <CaseCard
                                    key={c._id}
                                    c={c}
                                    onDragStart={() => handleDragStart(c._id, col.key)}
                                    onClick={() => navigate(`/org/lab-cases/${c._id}`)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Legend */}
            <div className="lab-kanban-footer">
                <span>🟡 4 Cases in Production</span>
                <span>🔵 2 Shipments in Transit</span>
                <span>🔴 1 Delayed Case</span>
            </div>

            {/* FAB */}
            <button
                className="lab-fab"
                onClick={() => navigate("/org/lab-cases/new")}
            >+</button>
        </div>
    );
}
