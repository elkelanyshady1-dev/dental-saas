/**
 * LabCaseDetail.jsx — Case Detail Page
 *
 * Matches design:
 *   Left panel:  Clinical Visualizations (STL viewer placeholder), Appliance Specs,
 *                Treatment Goals, Logistics & Tracking
 *   Right panel: Lab Chat, Lab Partner info card
 */

import React, { useRef, useState } from "react";
import { useParams, useNavigate }  from "react-router-dom";
import {
    useLabCase,
    useLabMessages,
    useUpdateCaseStatus,
    usePostMessage,
} from "../hooks/useLab";

const STATUS_CONFIG = [
    { key: "draft",         label: "Draft" },
    { key: "sent",          label: "Sent" },
    { key: "accepted",      label: "Accepted" },
    { key: "in_production", label: "In Production" },
    { key: "shipped",       label: "Shipped" },
    { key: "delivered",     label: "Delivered" },
    { key: "completed",     label: "Completed" },
];

function TrackingTimeline({ status }) {
    const reached = STATUS_CONFIG.findIndex(s => s.key === status);
    return (
        <div className="lab-timeline">
            {STATUS_CONFIG.filter(s => !["draft","completed"].includes(s.key)).map((s, i) => {
                const done    = i < reached;
                const current = STATUS_CONFIG[reached]?.key === s.key;
                return (
                    <div key={s.key} className="lab-timeline-item">
                        <div className={`lab-timeline-dot ${done ? "done" : current ? "current" : "pending"}`} />
                        <div className="lab-timeline-body">
                            <strong>{s.label}</strong>
                            <span>{done ? "Completed" : current ? "In Progress" : "Awaiting"}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function ChatMessage({ msg }) {
    const isLab = msg.senderType === "lab";
    const isSys = msg.isSystem;
    if (isSys) {
        return <div className="lab-chat-sys">{msg.message}</div>;
    }
    return (
        <div className={`lab-chat-msg ${isLab ? "lab" : "clinic"}`}>
            {isLab && <div className="lab-chat-avatar">{(msg.senderName || "L")[0]}</div>}
            <div className="lab-chat-bubble">
                {isLab && <p className="lab-chat-sender">{msg.senderName || "Lab Tech"}</p>}
                <p>{msg.message}</p>
                <span className="lab-chat-time">{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
        </div>
    );
}

export default function LabCaseDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [msgText, setMsgText] = useState("");
    const msgEndRef = useRef(null);

    const { data: caseData, isLoading } = useLabCase(id);
    const { data: msgData }             = useLabMessages(id);
    const updateStatus = useUpdateCaseStatus(id);
    const postMsg      = usePostMessage(id);

    const labCase  = caseData?.data;
    const messages = msgData?.data || [];

    if (isLoading) return <div className="lab-loading">Loading case…</div>;
    if (!labCase)  return <div className="lab-empty">Case not found.</div>;

    function handleSend() {
        if (!msgText.trim()) return;
        postMsg.mutate({ message: msgText, senderType: "clinic" });
        setMsgText("");
    }

    const statusLabel = labCase.status?.replace("_", " ").toUpperCase();

    return (
        <div className="lab-case-detail">
            {/* ─── Case Header ─── */}
            <div className="lab-case-header">
                <div className="lab-breadcrumb">Cases / <span>#{labCase.caseCode}</span></div>
                <div className="lab-case-meta">
                    <h1 className="lab-page-title">Case #{labCase.caseCode}</h1>
                    <div className="lab-case-info-row">
                        <span>👤 {labCase.patientName} <small>(Patient)</small></span>
                        <span className="lab-sep">|</span>
                        <span>🔬 {labCase.labName} <small>(Contractor)</small></span>
                    </div>
                </div>
                <div className="lab-case-header-actions">
                    <span className="lab-status-badge-lg"
                          style={{ background: "#F59E0B20", color: "#F59E0B" }}>
                        ● {statusLabel}
                    </span>
                    <button className="lab-btn-outline">Edit Details</button>
                </div>
            </div>

            <div className="lab-case-body">
                {/* ─── LEFT PANEL ─── */}
                <div className="lab-case-left">

                    {/* STL Viewer */}
                    <div className="lab-panel">
                        <div className="lab-panel-header">
                            <span>🦷 Clinical Visualizations</span>
                            <div className="lab-panel-actions">
                                <button className="lab-icon-btn">⛶</button>
                                <button className="lab-icon-btn">↓</button>
                            </div>
                        </div>
                        <div className="lab-stl-viewer">
                            <div className="lab-stl-overlay">
                                <div className="lab-stl-icon">⬡</div>
                                <p>Interact with 3D STL Model</p>
                                <div className="lab-stl-buttons">
                                    <button className="lab-btn-primary">Upper Arch</button>
                                    <button className="lab-btn-outline-white">Lower Arch</button>
                                </div>
                                <span className="lab-stl-meta">VER: 2.04.1 | POLY: 42,109</span>
                            </div>
                        </div>
                    </div>

                    {/* Appliance Specs + Treatment Goals */}
                    <div className="lab-case-specs-row">
                        <div className="lab-panel">
                            <h3 className="lab-panel-subtitle">Appliance Specs</h3>
                            <table className="lab-specs-table">
                                <tbody>
                                    {[
                                        ["Type",         labCase.prescription?.type         || "Hawley Retainer"],
                                        ["Material",     labCase.prescription?.material     || "Clear Acrylic (Hypo)"],
                                        ["Wire Gauge",   labCase.prescription?.wireGauge    || "0.028 Stainless"],
                                        ["Color Option", labCase.prescription?.colorOption  || "Cobalt Blue"],
                                    ].map(([k, v]) => (
                                        <tr key={k}><td className="lab-spec-key">{k}</td><td className="lab-spec-val">{v}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="lab-panel">
                            <h3 className="lab-panel-subtitle">Treatment Goals</h3>
                            <ul className="lab-goals-list">
                                {(labCase.prescription?.goals || [
                                    "Maintain incisor alignment",
                                    "0.5mm Labial expansion requested",
                                    "Distalize molar #3 slightly",
                                ]).map((g, i) => (
                                    <li key={i}><span className="lab-goal-check">✓</span>{g}</li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* Logistics & Tracking */}
                    <div className="lab-panel">
                        <div className="lab-panel-header">
                            <span>🚚 Logistics & Tracking</span>
                        </div>
                        <div className="lab-logistics">
                            <div className="lab-eta-card">
                                <p className="lab-eta-label">ESTIMATED ARRIVAL</p>
                                <p className="lab-eta-date">
                                    {labCase.expectedDelivery
                                        ? new Date(labCase.expectedDelivery).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                        : "TBD"}
                                </p>
                                <p className="lab-eta-time">By 4:00 PM (EDT)</p>
                                {labCase.trackingNumber && (
                                    <div className="lab-tracking-num">
                                        <small>{labCase.trackingCarrier || "FedEx Priority"}</small>
                                        <strong>{labCase.trackingNumber}</strong>
                                    </div>
                                )}
                            </div>
                            <TrackingTimeline status={labCase.status} />
                        </div>
                    </div>
                </div>

                {/* ─── RIGHT PANEL ─── */}
                <div className="lab-case-right">

                    {/* Lab Chat */}
                    <div className="lab-panel lab-chat-panel">
                        <div className="lab-panel-header">
                            <span>💬 Lab Chat</span>
                            <span className="lab-online-dot">● ONLINE</span>
                        </div>
                        <div className="lab-chat-messages">
                            {messages.length === 0
                                ? <p className="lab-empty">No messages yet</p>
                                : messages.map((m, i) => <ChatMessage key={i} msg={m} />)
                            }
                            <div ref={msgEndRef} />
                        </div>
                        <div className="lab-chat-input-row">
                            <input
                                value={msgText}
                                onChange={e => setMsgText(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleSend()}
                                placeholder="Type message to technician…"
                            />
                            <button className="lab-attach-btn" title="Attach file">📎</button>
                            <button className="lab-send-btn" onClick={handleSend}>▶</button>
                        </div>
                    </div>

                    {/* Lab Partner Card */}
                    <div className="lab-panel lab-partner-card">
                        <p className="lab-partner-label">LAB PARTNER</p>
                        <div className="lab-partner-info">
                            <div className="lab-partner-avatar">{(labCase.labName || "L")[0]}</div>
                            <div>
                                <strong>{labCase.labName || "—"}</strong>
                                <p className="lab-partner-rating">★★★★⋆ 4.8</p>
                            </div>
                        </div>
                        <div className="lab-partner-links">
                            <button className="lab-partner-link">📞 Call Support ↗</button>
                            <button className="lab-partner-link">🌐 Lab Portal ↗</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
