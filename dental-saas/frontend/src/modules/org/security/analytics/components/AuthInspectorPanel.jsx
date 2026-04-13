/**
 * AuthInspectorPanel.jsx — Auth Trace Inspector (DEV Panel)
 *
 * Visual timeline showing the full auth decision chain:
 * RBAC → ENTITLEMENT → PBAC → FIELD_WRITE → FIELD_READ
 *
 * Each layer shows status, duration, and expandable JSON details.
 *
 * MODULE: frontend/src/modules/org/security/analytics
 * PLANE: Org only.
 */
import React, { useState } from "react";
import {
    Terminal,
    ChevronDown,
    ChevronRight,
    CheckCircle2,
    XCircle,
    SkipForward,
    Clock,
    Hash,
    User,
    FileCode,
} from "lucide-react";

const STATUS_CONFIG = {
    ALLOW: { color: "#10B981", bg: "#ECFDF5", icon: CheckCircle2, label: "ALLOW" },
    DENY: { color: "#EF4444", bg: "#FEF2F2", icon: XCircle, label: "DENY" },
    SKIP: { color: "#94A3B8", bg: "#F8FAFC", icon: SkipForward, label: "SKIP" },
};

const LAYER_ICONS = {
    RBAC: "🛡️",
    ENTITLEMENT: "📋",
    PBAC: "🔒",
    FIELD_WRITE: "✏️",
    FIELD_READ: "👁️",
};

function LayerStep({ layer, index, isLast }) {
    const [expanded, setExpanded] = useState(layer.status === "DENY");
    const status = STATUS_CONFIG[layer.status] || STATUS_CONFIG.SKIP;
    const StatusIcon = status.icon;

    return (
        <div style={{ display: "flex", gap: 16 }}>
            {/* Timeline connector */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: 32,
                    flexShrink: 0,
                }}
            >
                {/* Node */}
                <div
                    style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        background: status.bg,
                        border: `2px solid ${status.color}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        zIndex: 1,
                    }}
                >
                    <StatusIcon size={14} style={{ color: status.color }} />
                </div>

                {/* Line */}
                {!isLast && (
                    <div
                        style={{
                            width: 2,
                            flex: 1,
                            background:
                                layer.status === "DENY"
                                    ? "#FECACA"
                                    : layer.status === "ALLOW"
                                    ? "#BBF7D0"
                                    : "#E2E8F0",
                            minHeight: 20,
                        }}
                    />
                )}
            </div>

            {/* Content */}
            <div
                style={{
                    flex: 1,
                    paddingBottom: isLast ? 0 : 16,
                    minWidth: 0,
                }}
            >
                {/* Step header */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        padding: "8px 14px",
                        borderRadius: 12,
                        background: expanded ? "#F8FAFC" : "transparent",
                        transition: "background 0.15s",
                    }}
                    onClick={() => setExpanded(!expanded)}
                    onMouseEnter={(e) => {
                        if (!expanded)
                            e.currentTarget.style.background = "#FAFBFC";
                    }}
                    onMouseLeave={(e) => {
                        if (!expanded)
                            e.currentTarget.style.background = "transparent";
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                        }}
                    >
                        <span style={{ fontSize: 16 }}>
                            {LAYER_ICONS[layer.layer] || "⚙️"}
                        </span>
                        <span
                            style={{
                                fontSize: 12,
                                fontWeight: 800,
                                color: "#0F172A",
                                fontFamily: "'JetBrains Mono', monospace",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                            }}
                        >
                            {layer.layer}
                        </span>
                        <span
                            style={{
                                fontSize: 10,
                                fontWeight: 800,
                                padding: "3px 10px",
                                borderRadius: 8,
                                background: status.bg,
                                color: status.color,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                            }}
                        >
                            {status.label}
                        </span>
                    </div>

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                        }}
                    >
                        {layer.duration > 0 && (
                            <span
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: "#94A3B8",
                                }}
                            >
                                <Clock size={11} />
                                {layer.duration}ms
                            </span>
                        )}
                        {expanded ? (
                            <ChevronDown size={14} style={{ color: "#94A3B8" }} />
                        ) : (
                            <ChevronRight size={14} style={{ color: "#94A3B8" }} />
                        )}
                    </div>
                </div>

                {/* Expanded details */}
                {expanded && (
                    <div
                        style={{
                            marginTop: 8,
                            marginInlineStart: 14,
                            padding: "14px 16px",
                            background: "#0F172A",
                            borderRadius: 12,
                            border: "1px solid #1E293B",
                            overflow: "auto",
                            maxHeight: 200,
                        }}
                    >
                        <pre
                            style={{
                                fontSize: 11,
                                fontFamily: "'JetBrains Mono', monospace",
                                color: "#E2E8F0",
                                margin: 0,
                                lineHeight: 1.6,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-all",
                            }}
                        >
                            {JSON.stringify(layer.details, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function AuthInspectorPanel({ trace = null }) {
    if (!trace) return null;

    const resultConfig = STATUS_CONFIG[trace.result] || STATUS_CONFIG.DENY;

    return (
        <div
            style={{
                background: "#fff",
                borderRadius: 20,
                border: "1px solid #E2E8F0",
                overflow: "hidden",
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: "20px 24px",
                    borderBottom: "1px solid #F1F5F9",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                    }}
                >
                    <div
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: "#0F172A",
                            color: "#10B981",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Terminal size={18} />
                    </div>
                    <div>
                        <h3
                            style={{
                                fontSize: 14,
                                fontWeight: 800,
                                color: "#0F172A",
                                margin: 0,
                            }}
                        >
                            Auth Inspector
                        </h3>
                        <p
                            style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: "#94A3B8",
                                margin: "2px 0 0",
                            }}
                        >
                            Full authorization decision trace
                        </p>
                    </div>
                </div>
                <span
                    style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "5px 14px",
                        borderRadius: 10,
                        background: resultConfig.bg,
                        color: resultConfig.color,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                    }}
                >
                    Final: {trace.result}
                </span>
            </div>

            {/* Trace metadata */}
            <div
                style={{
                    padding: "16px 24px",
                    borderBottom: "1px solid #F1F5F9",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 20,
                }}
            >
                <MetaItem
                    icon={<Hash size={12} />}
                    label="Request ID"
                    value={trace.requestId}
                />
                <MetaItem
                    icon={<User size={12} />}
                    label="User"
                    value={trace.userId}
                />
                <MetaItem
                    icon={<FileCode size={12} />}
                    label="Action"
                    value={trace.action}
                />
                <MetaItem
                    icon={<Clock size={12} />}
                    label="Total Duration"
                    value={`${trace.totalDuration}ms`}
                />
            </div>

            {/* Timeline */}
            <div style={{ padding: "24px 24px 20px" }}>
                {trace.layers?.map((layer, idx) => (
                    <LayerStep
                        key={idx}
                        layer={layer}
                        index={idx}
                        isLast={idx === trace.layers.length - 1}
                    />
                ))}
            </div>
        </div>
    );
}

function MetaItem({ icon, label, value }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
            }}
        >
            <span style={{ color: "#94A3B8" }}>{icon}</span>
            <span
                style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#94A3B8",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                }}
            >
                {label}:
            </span>
            <span
                style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#0F172A",
                    fontFamily: "'JetBrains Mono', monospace",
                }}
            >
                {value}
            </span>
        </div>
    );
}
