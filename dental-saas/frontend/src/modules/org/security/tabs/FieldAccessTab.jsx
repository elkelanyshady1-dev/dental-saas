/**
 * FieldAccessTab.jsx — Field-Level RBAC Viewer (Connected)
 *
 * Shows field access registry from backend.
 * Displays which fields each role can see per resource type.
 */
import React, { useState, useMemo } from "react";
import {
    Database,
    Check,
    X,
    ShieldCheck,
    Search,
    Info,
    AlertCircle,
} from "lucide-react";
import { useFieldAccess } from "../hooks/useSecurity";

export default function FieldAccessTab() {
    const { data, isLoading, error } = useFieldAccess();
    const [selectedResource, setSelectedResource] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");

    // Set initial selection when data loads
    const resourceTypes = data?.resourceTypes || [];
    const activeResource = selectedResource || resourceTypes[0] || null;

    // Build field × role matrix
    const matrix = useMemo(() => {
        if (!data?.resources || !activeResource) return { fields: [], roles: [] };

        const resource = data.resources[activeResource];
        if (!resource) return { fields: [], roles: [] };

        const roles = Object.keys(resource);

        // Collect all unique fields across roles
        const allFields = new Set();
        for (const role of roles) {
            const roleData = resource[role];
            if (roleData.fullAccess) {
                // Mark as "all fields" — we can't enumerate
                allFields.add("*");
            } else {
                roleData.fields.forEach((f) => allFields.add(f));
            }
        }

        // If any role has wildcard, we need all fields
        // For display, list all fields from the roles that have explicit lists
        const explicitFields = new Set();
        for (const role of roles) {
            const roleData = resource[role];
            if (!roleData.fullAccess) {
                roleData.fields.forEach((f) => explicitFields.add(f));
            }
        }

        // If we have wildcard roles but also explicit lists, show explicit + note
        const fieldList = [...explicitFields].sort();

        // Filter by search
        const filtered = fieldList.filter((f) =>
            f.toLowerCase().includes(searchQuery.toLowerCase())
        );

        return {
            fields: filtered,
            allFields: fieldList,
            roles,
            resource,
        };
    }, [data, activeResource, searchQuery]);

    if (isLoading) return <LoadingSkeleton />;
    if (error) return <ErrorState message="Failed to load field access data" />;
    if (!data) return null;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, height: "100%" }}>
            {/* Resource Selector */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#fff",
                    padding: 16,
                    borderRadius: 24,
                    border: "1px solid #E2E8F0",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div
                            style={{
                                width: 40,
                                height: 40,
                                background: "#EEF2FF",
                                borderRadius: 12,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#4F46E5",
                            }}
                        >
                            <Database size={20} />
                        </div>
                        <div>
                            <span
                                style={{
                                    fontSize: 10,
                                    fontWeight: 800,
                                    color: "#94A3B8",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                    display: "block",
                                }}
                            >
                                Resource
                            </span>
                            <select
                                value={activeResource}
                                onChange={(e) => setSelectedResource(e.target.value)}
                                style={{
                                    fontSize: 14,
                                    fontWeight: 900,
                                    color: "#1E293B",
                                    background: "transparent",
                                    border: "none",
                                    cursor: "pointer",
                                    outline: "none",
                                    textTransform: "capitalize",
                                }}
                            >
                                {resourceTypes.map((r) => (
                                    <option key={r} value={r}>
                                        {r}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div style={{ width: 1, height: 32, background: "#E2E8F0" }} />
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
                            placeholder="Search fields..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                background: "#F8FAFC",
                                border: "1px solid #E2E8F0",
                                borderRadius: 12,
                                padding: "8px 16px 8px 36px",
                                fontSize: 12,
                                width: 260,
                                outline: "none",
                            }}
                        />
                    </div>
                </div>
                <span
                    style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#64748B",
                        background: "#F8FAFC",
                        padding: "6px 12px",
                        borderRadius: 8,
                    }}
                >
                    {matrix.fields.length} fields
                </span>
            </div>

            {/* Field Matrix Table */}
            <div
                style={{
                    flex: 1,
                    background: "#fff",
                    borderRadius: 24,
                    border: "1px solid #E2E8F0",
                    overflow: "auto",
                }}
            >
                <table
                    style={{
                        width: "100%",
                        textAlign: "left",
                        borderCollapse: "collapse",
                    }}
                >
                    <thead>
                        <tr
                            style={{
                                background: "#F8FAFC",
                                borderBottom: "1px solid #E2E8F0",
                            }}
                        >
                            <th style={thStyle}>Field</th>
                            {matrix.roles.map((role) => (
                                <th
                                    key={role}
                                    style={{ ...thStyle, textAlign: "center" }}
                                >
                                    {role.replace("_", " ")}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {matrix.fields.map((field) => (
                            <tr
                                key={field}
                                style={{
                                    borderBottom: "1px solid #F1F5F9",
                                    transition: "background 0.15s",
                                }}
                                onMouseEnter={(e) =>
                                    (e.currentTarget.style.background = "#FAFBFC")
                                }
                                onMouseLeave={(e) =>
                                    (e.currentTarget.style.background = "transparent")
                                }
                            >
                                <td style={tdStyle}>
                                    <code
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: "#4F46E5",
                                            background: "#EEF2FF",
                                            padding: "2px 8px",
                                            borderRadius: 6,
                                        }}
                                    >
                                        {field}
                                    </code>
                                </td>
                                {matrix.roles.map((role) => {
                                    const roleData = matrix.resource[role];
                                    const hasAccess =
                                        roleData?.fullAccess ||
                                        roleData?.fields?.includes(field);
                                    return (
                                        <td
                                            key={role}
                                            style={{ ...tdStyle, textAlign: "center" }}
                                        >
                                            <AccessBadge active={hasAccess} />
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Legend */}
            <div
                style={{
                    background: "#312E81",
                    borderRadius: 24,
                    padding: 24,
                    color: "#fff",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div
                            style={{
                                width: 40,
                                height: 40,
                                background: "rgba(255,255,255,0.1)",
                                borderRadius: 12,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                border: "1px solid rgba(255,255,255,0.2)",
                            }}
                        >
                            <ShieldCheck size={20} style={{ color: "#34D399" }} />
                        </div>
                        <div>
                            <h4
                                style={{
                                    fontSize: 12,
                                    fontWeight: 900,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                    margin: 0,
                                }}
                            >
                                Field-Level RBAC
                            </h4>
                            <p
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: "#C7D2FE",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                    margin: "2px 0 0",
                                }}
                            >
                                Whitelist-based filtering
                            </p>
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <LegendDot color="#34D399" label="Visible" />
                        <LegendDot color="#FB7185" label="Hidden" />
                    </div>
                </div>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#C7D2FE",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        background: "rgba(255,255,255,0.05)",
                        padding: "8px 16px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.1)",
                    }}
                >
                    <Info size={14} />
                    Applied to all API responses automatically
                </div>
            </div>
        </div>
    );
}

function AccessBadge({ active }) {
    return (
        <div
            style={{
                display: "inline-flex",
                width: 28,
                height: 28,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                background: active ? "#ECFDF5" : "#FEF2F2",
                color: active ? "#10B981" : "#F87171",
            }}
        >
            {active ? <Check size={14} /> : <X size={14} />}
        </div>
    );
}

function LegendDot({ color, label }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
                style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: color,
                }}
            />
            <span
                style={{
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#E0E7FF",
                }}
            >
                {label}
            </span>
        </div>
    );
}

const thStyle = {
    padding: "20px 32px",
    fontSize: 10,
    fontWeight: 800,
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    whiteSpace: "nowrap",
};

const tdStyle = {
    padding: "16px 32px",
    whiteSpace: "nowrap",
};

function LoadingSkeleton() {
    return <div style={{ height: 500, background: "#F1F5F9", borderRadius: 24 }} />;
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
            <AlertCircle size={40} style={{ color: "#EF4444", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: "#991B1B" }}>{message}</p>
        </div>
    );
}
