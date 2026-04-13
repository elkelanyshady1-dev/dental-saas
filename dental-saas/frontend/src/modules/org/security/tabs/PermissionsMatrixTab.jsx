/**
 * PermissionsMatrixTab.jsx — Route → Permission Matrix Audit (Connected)
 *
 * Shows the canonical route→permission matrix from permissionMatrix.js.
 * Each row displays: module, method, route, expected permission, policy status.
 * This is a REAL audit of the system's actual security posture.
 *
 * Data from: useSecurityMatrix() + usePermissions() hooks.
 */
import React, { useState, useMemo } from "react";
import {
    Search,
    CheckCircle2,
    XCircle,
    ShieldCheck,
    AlertCircle,
    Filter,
    Activity,
} from "lucide-react";
import { useSecurityMatrix, usePermissions } from "../hooks/useSecurity";

export default function PermissionsMatrixTab() {
    const { data: matrixData, isLoading: matrixLoading, error: matrixErr } = useSecurityMatrix();
    const { data: permData, isLoading: permLoading } = usePermissions();
    const [searchQuery, setSearchQuery] = useState("");
    const [moduleFilter, setModuleFilter] = useState("All");
    const [statusFilter, setStatusFilter] = useState("All");
    const [viewMode, setViewMode] = useState("routes"); // "routes" | "roles"

    // ── Module list ──
    const modules = useMemo(() => {
        if (!matrixData?.matrix) return [];
        const mods = [...new Set(matrixData.matrix.map((r) => r.module))];
        return ["All", ...mods.sort()];
    }, [matrixData]);

    // ── Filtered route matrix ──
    const filteredRoutes = useMemo(() => {
        if (!matrixData?.matrix) return [];
        return matrixData.matrix.filter((r) => {
            const matchSearch =
                r.route.toLowerCase().includes(searchQuery.toLowerCase()) ||
                r.expectedPermission.toLowerCase().includes(searchQuery.toLowerCase()) ||
                r.module.toLowerCase().includes(searchQuery.toLowerCase());
            const matchModule = moduleFilter === "All" || r.module === moduleFilter;
            const matchStatus =
                statusFilter === "All" || r.status === statusFilter;
            return matchSearch && matchModule && matchStatus;
        });
    }, [matrixData, searchQuery, moduleFilter, statusFilter]);

    // ── Role matrix from permissions ──
    const filteredPerms = useMemo(() => {
        if (!permData?.permissions) return [];
        return permData.permissions.filter((p) => {
            const matchSearch = p.value.toLowerCase().includes(searchQuery.toLowerCase());
            const matchModule = moduleFilter === "All" || p.module === moduleFilter;
            return matchSearch && matchModule;
        });
    }, [permData, searchQuery, moduleFilter]);

    const isLoading = matrixLoading || permLoading;
    const error = matrixErr;

    if (isLoading) return <LoadingSkeleton />;
    if (error) return <ErrorState message="Failed to load permission data" />;

    const roles = permData?.roles || [];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, height: "100%" }}>
            {/* Stats Bar */}
            {matrixData?.stats && (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: 16,
                    }}
                >
                    <MiniStat
                        label="Total Routes"
                        value={matrixData.stats.totalRoutes}
                        color="#4F46E5"
                    />
                    <MiniStat
                        label="Modules"
                        value={matrixData.stats.moduleCount}
                        color="#3B82F6"
                    />
                    <MiniStat
                        label="Unique Permissions"
                        value={matrixData.stats.uniquePermissions}
                        color="#10B981"
                    />
                    <MiniStat
                        label="Protected (PBAC)"
                        value={filteredRoutes.filter((r) => r.hasPolicy).length}
                        color="#F59E0B"
                    />
                </div>
            )}

            {/* Filters */}
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
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
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
                            placeholder="Search routes, permissions..."
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

                    <FilterSelect
                        label="Module"
                        value={moduleFilter}
                        onChange={setModuleFilter}
                        options={modules}
                    />

                    {viewMode === "routes" && (
                        <FilterSelect
                            label="Status"
                            value={statusFilter}
                            onChange={setStatusFilter}
                            options={["All", "protected", "base_rbac"]}
                        />
                    )}

                    {/* View Mode Toggle */}
                    <div
                        style={{
                            display: "flex",
                            background: "#F1F5F9",
                            borderRadius: 12,
                            padding: 2,
                        }}
                    >
                        <ViewToggle
                            label="Routes"
                            active={viewMode === "routes"}
                            onClick={() => setViewMode("routes")}
                        />
                        <ViewToggle
                            label="Roles"
                            active={viewMode === "roles"}
                            onClick={() => setViewMode("roles")}
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
                    {viewMode === "routes"
                        ? `${filteredRoutes.length} routes`
                        : `${filteredPerms.length} permissions`}
                </span>
            </div>

            {/* Table */}
            <div
                style={{
                    flex: 1,
                    background: "#fff",
                    borderRadius: 24,
                    border: "1px solid #E2E8F0",
                    overflow: "auto",
                }}
            >
                {viewMode === "routes" ? (
                    <RouteMatrixTable routes={filteredRoutes} />
                ) : (
                    <RoleMatrixTable perms={filteredPerms} roles={roles} rolePerms={permData?.rolePermissions} />
                )}
            </div>
        </div>
    );
}

// ─── Route Matrix View ──────────────────────────────────────────────────────

function RouteMatrixTable({ routes }) {
    return (
        <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
            <thead>
                <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                    <th style={thStyle}>Module</th>
                    <th style={thStyle}>Method</th>
                    <th style={thStyle}>Route</th>
                    <th style={thStyle}>Expected Permission</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Policy</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
                </tr>
            </thead>
            <tbody>
                {routes.map((row, idx) => (
                    <tr
                        key={`${row.module}_${row.method}_${row.route}_${idx}`}
                        style={{
                            borderBottom: "1px solid #F1F5F9",
                            transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFC")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                        <td style={tdStyle}>
                            <span
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: "#4F46E5",
                                    background: "#EEF2FF",
                                    padding: "2px 8px",
                                    borderRadius: 6,
                                    textTransform: "capitalize",
                                }}
                            >
                                {row.module}
                            </span>
                        </td>
                        <td style={tdStyle}>
                            <MethodBadge method={row.method} />
                        </td>
                        <td style={tdStyle}>
                            <code
                                style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: "#334155",
                                    background: "#F1F5F9",
                                    padding: "2px 8px",
                                    borderRadius: 6,
                                    letterSpacing: "0.03em",
                                }}
                            >
                                {row.route}
                            </code>
                        </td>
                        <td style={tdStyle}>
                            <code
                                style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: "#475569",
                                    letterSpacing: "0.02em",
                                }}
                            >
                                {row.expectedPermission}
                            </code>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                            {row.hasPolicy ? (
                                <CheckCircle2 size={16} style={{ color: "#10B981" }} />
                            ) : (
                                <XCircle size={16} style={{ color: "#E2E8F0" }} />
                            )}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                            <StatusBadge status={row.status} />
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// ─── Role Matrix View ───────────────────────────────────────────────────────

function RoleMatrixTable({ perms, roles, rolePerms }) {
    return (
        <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
            <thead>
                <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                    <th style={thStyle}>Permission</th>
                    <th style={thStyle}>Module</th>
                    {roles.map((role) => (
                        <th key={role} style={{ ...thStyle, textAlign: "center" }}>
                            {role.replace("_", " ")}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {perms.map((perm) => (
                    <tr
                        key={perm.key}
                        style={{
                            borderBottom: "1px solid #F1F5F9",
                            transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFBFC")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                        <td style={tdStyle}>
                            <code
                                style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: "#334155",
                                    background: "#F1F5F9",
                                    padding: "2px 8px",
                                    borderRadius: 6,
                                    letterSpacing: "0.03em",
                                }}
                            >
                                {perm.value}
                            </code>
                        </td>
                        <td style={tdStyle}>
                            <span
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: "#4F46E5",
                                    background: "#EEF2FF",
                                    padding: "2px 8px",
                                    borderRadius: 6,
                                    textTransform: "capitalize",
                                }}
                            >
                                {perm.module}
                            </span>
                        </td>
                        {roles.map((role) => {
                            const has = rolePerms?.[role]?.includes(perm.value);
                            return (
                                <td key={role} style={{ ...tdStyle, textAlign: "center" }}>
                                    {has ? (
                                        <CheckCircle2 size={16} style={{ color: "#10B981" }} />
                                    ) : (
                                        <XCircle size={16} style={{ color: "#E2E8F0" }} />
                                    )}
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function MethodBadge({ method }) {
    const colors = {
        GET: { bg: "#ECFDF5", color: "#059669", border: "#A7F3D0" },
        POST: { bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE" },
        PUT: { bg: "#FEF3C7", color: "#D97706", border: "#FDE68A" },
        PATCH: { bg: "#FFF7ED", color: "#EA580C", border: "#FED7AA" },
        DELETE: { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" },
    };
    const s = colors[method] || colors.GET;
    return (
        <span
            style={{
                fontSize: 9,
                fontWeight: 900,
                padding: "3px 8px",
                borderRadius: 6,
                background: s.bg,
                color: s.color,
                border: `1px solid ${s.border}`,
                letterSpacing: "0.08em",
            }}
        >
            {method}
        </span>
    );
}

function StatusBadge({ status }) {
    const isProtected = status === "protected";
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 10px",
                borderRadius: 999,
                fontSize: 9,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                background: isProtected ? "#ECFDF5" : "#F8FAFC",
                color: isProtected ? "#059669" : "#94A3B8",
                border: `1px solid ${isProtected ? "#A7F3D0" : "#E2E8F0"}`,
            }}
        >
            {isProtected ? <ShieldCheck size={10} /> : <Activity size={10} />}
            {isProtected ? "PBAC" : "Base RBAC"}
        </span>
    );
}

function MiniStat({ label, value, color }) {
    return (
        <div
            style={{
                background: "#fff",
                borderRadius: 20,
                border: "1px solid #E2E8F0",
                padding: "16px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
            }}
        >
            <span
                style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: "#94A3B8",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                }}
            >
                {label}
            </span>
            <span style={{ fontSize: 20, fontWeight: 900, color }}>{value}</span>
        </div>
    );
}

function FilterSelect({ label, value, onChange, options }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
                style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: "#94A3B8",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                }}
            >
                {label}:
            </span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                style={{
                    background: "#F8FAFC",
                    border: "1px solid #E2E8F0",
                    borderRadius: 12,
                    padding: "8px 16px",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#475569",
                    cursor: "pointer",
                    outline: "none",
                    textTransform: "capitalize",
                }}
            >
                {options.map((opt) => (
                    <option key={opt} value={opt}>
                        {opt.replace("_", " ")}
                    </option>
                ))}
            </select>
        </div>
    );
}

function ViewToggle({ label, active, onClick }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: "6px 14px",
                borderRadius: 10,
                border: "none",
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                cursor: "pointer",
                background: active ? "#fff" : "transparent",
                color: active ? "#4F46E5" : "#94A3B8",
                boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.2s",
            }}
        >
            {label}
        </button>
    );
}

const thStyle = {
    padding: "16px 20px",
    fontSize: 10,
    fontWeight: 800,
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    whiteSpace: "nowrap",
};

const tdStyle = {
    padding: "12px 20px",
    whiteSpace: "nowrap",
};

function LoadingSkeleton() {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} style={{ height: 60, background: "#F1F5F9", borderRadius: 20 }} />
                ))}
            </div>
            <div style={{ height: 500, background: "#F1F5F9", borderRadius: 24 }} />
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
            <AlertCircle size={40} style={{ color: "#EF4444", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: "#991B1B" }}>{message}</p>
        </div>
    );
}
