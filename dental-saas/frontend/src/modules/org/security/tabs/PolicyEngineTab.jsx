/**
 * PolicyEngineTab.jsx — Policy Engine Viewer (Connected)
 *
 * Shows all policy definitions loaded from the backend.
 * Read-only: policies are defined in code (policyRegistry.js).
 */
import React, { useState, useMemo } from "react";
import {
    Search,
    ShieldCheck,
    ShieldAlert,
    Settings2,
    Info,
    AlertCircle,
} from "lucide-react";
import { usePolicies } from "../hooks/useSecurity";

export default function PolicyEngineTab() {
    const { data, isLoading, error } = usePolicies();
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedPerm, setSelectedPerm] = useState(null);

    const permissions = useMemo(() => {
        if (!data?.policies) return [];
        return Object.entries(data.policies)
            .map(([permission, rules]) => ({
                permission,
                module: permission.split(".")[0],
                action: permission.split(".")[1],
                rules,
                ruleCount: rules.length,
            }))
            .filter(
                (p) =>
                    p.permission.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    p.module.toLowerCase().includes(searchQuery.toLowerCase())
            );
    }, [data, searchQuery]);

    const selected = selectedPerm || permissions[0] || null;

    if (isLoading) return <LoadingSkeleton />;
    if (error) return <ErrorState message="Failed to load policies" />;

    return (
        <div style={{ display: "flex", gap: 32, height: "100%" }}>
            {/* Left Panel: Permissions List */}
            <div
                style={{
                    width: 320,
                    background: "#fff",
                    borderRadius: 24,
                    border: "1px solid #E2E8F0",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    flexShrink: 0,
                }}
            >
                <div
                    style={{
                        padding: 24,
                        borderBottom: "1px solid #F1F5F9",
                    }}
                >
                    <h3
                        style={{
                            fontSize: 13,
                            fontWeight: 900,
                            color: "#1E293B",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            margin: 0,
                        }}
                    >
                        Permissions
                    </h3>
                    <p
                        style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#94A3B8",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            margin: "4px 0 16px",
                        }}
                    >
                        {data?.totalPolicies} policies defined
                    </p>
                    <div style={{ position: "relative" }}>
                        <Search
                            size={14}
                            style={{
                                position: "absolute",
                                left: 12,
                                top: "50%",
                                transform: "translateY(-50%)",
                                color: "#94A3B8",
                            }}
                        />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: "100%",
                                background: "#F8FAFC",
                                border: "1px solid #E2E8F0",
                                borderRadius: 12,
                                padding: "8px 16px 8px 36px",
                                fontSize: 12,
                                outline: "none",
                                boxSizing: "border-box",
                            }}
                        />
                    </div>
                </div>
                <div
                    style={{
                        flex: 1,
                        overflow: "auto",
                        padding: 8,
                    }}
                >
                    {permissions.map((p) => (
                        <button
                            key={p.permission}
                            onClick={() => setSelectedPerm(p)}
                            style={{
                                width: "100%",
                                textAlign: "left",
                                padding: 16,
                                borderRadius: 16,
                                border:
                                    selected?.permission === p.permission
                                        ? "1px solid #C7D2FE"
                                        : "1px solid transparent",
                                background:
                                    selected?.permission === p.permission
                                        ? "#EEF2FF"
                                        : "transparent",
                                cursor: "pointer",
                                marginBottom: 4,
                                display: "block",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color:
                                        selected?.permission === p.permission
                                            ? "#4F46E5"
                                            : "#334155",
                                }}
                            >
                                {p.permission}
                            </div>
                            <span
                                style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: "#94A3B8",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                }}
                            >
                                {p.ruleCount} rules
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Right Panel: Policy Rules */}
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 24,
                    overflow: "hidden",
                }}
            >
                {selected ? (
                    <>
                        {/* Permission Header */}
                        <div
                            style={{
                                background: "#fff",
                                borderRadius: 24,
                                border: "1px solid #E2E8F0",
                                padding: 24,
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 12,
                                }}
                            >
                                <Settings2 size={24} style={{ color: "#4F46E5" }} />
                                <div>
                                    <h2
                                        style={{
                                            fontSize: 20,
                                            fontWeight: 900,
                                            color: "#1E293B",
                                            margin: 0,
                                        }}
                                    >
                                        {selected.permission}
                                    </h2>
                                    <span
                                        style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            color: "#94A3B8",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.08em",
                                        }}
                                    >
                                        Module: {selected.module} • Action: {selected.action}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Rules */}
                        <div style={{ flex: 1, overflow: "auto" }}>
                            {selected.rules.length > 0 ? (
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 20,
                                    }}
                                >
                                    {selected.rules.map((rule, idx) => (
                                        <PolicyCard key={rule.id} rule={rule} index={idx} />
                                    ))}
                                </div>
                            ) : (
                                <EmptyRules />
                            )}
                        </div>
                    </>
                ) : (
                    <EmptyRules />
                )}
            </div>
        </div>
    );
}

function PolicyCard({ rule, index }) {
    const isAllow = rule.effect === "allow";

    return (
        <div
            style={{
                background: "#fff",
                borderRadius: 24,
                border: "1px solid #E2E8F0",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    padding: "16px 24px",
                    borderBottom: "1px solid #F1F5F9",
                    background: "#FAFBFC",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <span
                        style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: "#94A3B8",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                        }}
                    >
                        Effect:
                    </span>
                    <span
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "4px 12px",
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 800,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            background: isAllow ? "#ECFDF5" : "#FEF2F2",
                            color: isAllow ? "#059669" : "#DC2626",
                            border: `1px solid ${isAllow ? "#A7F3D0" : "#FECACA"}`,
                        }}
                    >
                        {isAllow ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                        {rule.effect}
                    </span>
                    <span
                        style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: "#94A3B8",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                        }}
                    >
                        Priority:
                    </span>
                    <span
                        style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: "#334155",
                            background: "#F1F5F9",
                            padding: "2px 10px",
                            borderRadius: 8,
                        }}
                    >
                        {rule.priority}
                    </span>
                </div>
            </div>
            <div style={{ padding: 24 }}>
                <p
                    style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#475569",
                        lineHeight: 1.6,
                        margin: 0,
                    }}
                >
                    {rule.description}
                </p>
            </div>
            <div
                style={{
                    padding: "12px 24px",
                    background: "#FAFBFC",
                    borderTop: "1px solid #F1F5F9",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                }}
            >
                <Info size={14} style={{ color: "#94A3B8" }} />
                <p
                    style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#64748B",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        margin: 0,
                    }}
                >
                    Rule: {rule.effect.toUpperCase()} if conditions match
                </p>
            </div>
        </div>
    );
}

function EmptyRules() {
    return (
        <div
            style={{
                background: "#fff",
                borderRadius: 24,
                border: "2px dashed #CBD5E1",
                padding: 48,
                textAlign: "center",
            }}
        >
            <ShieldAlert
                size={32}
                style={{ color: "#CBD5E1", margin: "0 auto 16px" }}
            />
            <h3
                style={{
                    fontSize: 14,
                    fontWeight: 900,
                    color: "#1E293B",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                }}
            >
                No Rules Defined
            </h3>
            <p
                style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#94A3B8",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginTop: 8,
                }}
            >
                This permission uses the default strict deny policy.
            </p>
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div style={{ display: "flex", gap: 32 }}>
            <div
                style={{
                    width: 320,
                    height: 500,
                    background: "#F1F5F9",
                    borderRadius: 24,
                }}
            />
            <div style={{ flex: 1, height: 500, background: "#F1F5F9", borderRadius: 24 }} />
        </div>
    );
}

function ErrorState({ message }) {
    return (
        <div
            style={{
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: 16,
                padding: 32,
                textAlign: "center",
            }}
        >
            <AlertCircle
                size={40}
                style={{ color: "#EF4444", margin: "0 auto 12px" }}
            />
            <p style={{ fontSize: 14, fontWeight: 700, color: "#991B1B" }}>{message}</p>
        </div>
    );
}
