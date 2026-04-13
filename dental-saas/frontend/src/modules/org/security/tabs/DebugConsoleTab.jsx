/**
 * DebugConsoleTab.jsx — Access Simulation Console (Connected)
 *
 * Runs real access simulations via POST /security/simulate.
 * HARDENED: Simulation uses the CURRENT USER's identity (req.user).
 * Body only sends: { permission, resource }
 *
 * No user identity override is possible from the frontend.
 */
import React, { useState } from "react";
import {
    Terminal,
    Play,
    RefreshCw,
    ShieldCheck,
    ShieldAlert,
    Code,
    Info,
    Database,
    Shield,
    AlertCircle,
    Zap,
    List,
} from "lucide-react";
import { usePermissions, useSimulateAccess } from "../hooks/useSecurity";

export default function DebugConsoleTab() {
    const { data: permData } = usePermissions();
    const simulation = useSimulateAccess();

    const [permission, setPermission] = useState("patients.read");
    const [resourceJson, setResourceJson] = useState(
        JSON.stringify(
            {
                id: "pat_789",
                owner: "doc_123",
                branch: "branch_main",
                status: "active",
            },
            null,
            2
        )
    );

    const permissions = permData?.permissions?.map((p) => p.value) || [];

    // Group permissions by module for easier navigation
    const permissionsByModule = {};
    (permData?.permissions || []).forEach((p) => {
        if (!permissionsByModule[p.module]) permissionsByModule[p.module] = [];
        permissionsByModule[p.module].push(p.value);
    });

    const handleSimulate = () => {
        let resource = null;
        try {
            resource = JSON.parse(resourceJson);
        } catch (e) {
            // Invalid JSON — send null
        }

        simulation.mutate({ permission, resource });
    };

    const handleReset = () => {
        simulation.reset();
    };

    const result = simulation.data;

    return (
        <div style={{ display: "flex", gap: 32, height: "100%" }}>
            {/* Left Panel: Simulation Input */}
            <div
                style={{
                    width: 450,
                    display: "flex",
                    flexDirection: "column",
                    gap: 24,
                    flexShrink: 0,
                }}
            >
                <div
                    style={{
                        background: "#fff",
                        borderRadius: 24,
                        border: "1px solid #E2E8F0",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <div
                        style={{
                            padding: 24,
                            borderBottom: "1px solid #F1F5F9",
                            background: "#FAFBFC",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <div>
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
                                Simulation Input
                            </h3>
                            <p
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: "#94A3B8",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                    margin: "4px 0 0",
                                }}
                            >
                                Testing as current user
                            </p>
                        </div>
                        <button
                            onClick={handleReset}
                            style={{
                                padding: 8,
                                borderRadius: 12,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                color: "#94A3B8",
                            }}
                        >
                            <RefreshCw size={16} />
                        </button>
                    </div>

                    <div
                        style={{
                            flex: 1,
                            overflow: "auto",
                            padding: 24,
                            display: "flex",
                            flexDirection: "column",
                            gap: 24,
                        }}
                    >
                        {/* Security Notice */}
                        <div
                            style={{
                                background: "#EEF2FF",
                                border: "1px solid #C7D2FE",
                                borderRadius: 16,
                                padding: 16,
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 12,
                            }}
                        >
                            <Info size={16} style={{ color: "#4F46E5", flexShrink: 0, marginTop: 2 }} />
                            <div>
                                <p
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: "#3730A3",
                                        margin: 0,
                                    }}
                                >
                                    Simulation uses YOUR current identity (JWT).
                                </p>
                                <p
                                    style={{
                                        fontSize: 10,
                                        fontWeight: 600,
                                        color: "#6366F1",
                                        margin: "4px 0 0",
                                    }}
                                >
                                    You can only test permissions for your own role and branch context. User
                                    identity cannot be overridden.
                                </p>
                            </div>
                        </div>

                        {/* Permission Selector */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <SectionHeader icon={<Shield size={14} />} label="Permission to Test" />
                            <FormField label="Select Permission">
                                <select
                                    value={permission}
                                    onChange={(e) => setPermission(e.target.value)}
                                    style={inputStyle}
                                >
                                    {Object.entries(permissionsByModule).map(([mod, perms]) => (
                                        <optgroup key={mod} label={mod.toUpperCase()}>
                                            {perms.map((p) => (
                                                <option key={p} value={p}>
                                                    {p}
                                                </option>
                                            ))}
                                        </optgroup>
                                    ))}
                                    {permissions.length === 0 && (
                                        <>
                                            {[
                                                "patients.read",
                                                "patients.create",
                                                "patients.update",
                                                "patients.delete",
                                                "appointments.read",
                                                "appointments.create",
                                                "invoices.create",
                                                "invoices.update",
                                                "orthodontics.create",
                                            ].map((p) => (
                                                <option key={p} value={p}>
                                                    {p}
                                                </option>
                                            ))}
                                        </>
                                    )}
                                </select>
                            </FormField>
                        </div>

                        {/* Resource JSON */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <SectionHeader icon={<Database size={14} />} label="Simulated Resource" />
                            <p
                                style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: "#94A3B8",
                                    margin: 0,
                                }}
                            >
                                Optional: provide a resource object to test ownership/branch policies
                            </p>
                            <textarea
                                value={resourceJson}
                                onChange={(e) => setResourceJson(e.target.value)}
                                style={{
                                    width: "100%",
                                    height: 160,
                                    background: "#0F172A",
                                    color: "#818CF8",
                                    fontFamily: "monospace",
                                    fontSize: 11,
                                    padding: 24,
                                    borderRadius: 16,
                                    border: "none",
                                    resize: "none",
                                    outline: "none",
                                    boxSizing: "border-box",
                                }}
                            />
                        </div>
                    </div>

                    {/* Run Button */}
                    <div
                        style={{
                            padding: 24,
                            borderTop: "1px solid #F1F5F9",
                            background: "#FAFBFC",
                        }}
                    >
                        <button
                            onClick={handleSimulate}
                            disabled={simulation.isPending}
                            style={{
                                width: "100%",
                                padding: 16,
                                background: "#4F46E5",
                                color: "#fff",
                                borderRadius: 16,
                                border: "none",
                                fontSize: 12,
                                fontWeight: 900,
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                cursor: simulation.isPending ? "not-allowed" : "pointer",
                                opacity: simulation.isPending ? 0.6 : 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 8,
                                boxShadow: "0 4px 12px rgba(79, 70, 229, 0.25)",
                            }}
                        >
                            {simulation.isPending ? (
                                <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} />
                            ) : (
                                <Play size={16} />
                            )}
                            Run Simulation
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Panel: Result */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
                <div
                    style={{
                        flex: 1,
                        background: "#fff",
                        borderRadius: 24,
                        border: "1px solid #E2E8F0",
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            padding: 24,
                            borderBottom: "1px solid #F1F5F9",
                            background: "#FAFBFC",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <div>
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
                                Simulation Result
                            </h3>
                            <p
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: "#94A3B8",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                    margin: "4px 0 0",
                                }}
                            >
                                Policy Engine Output
                            </p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Code size={16} style={{ color: "#94A3B8" }} />
                            <span
                                style={{
                                    fontSize: 10,
                                    fontWeight: 800,
                                    color: "#94A3B8",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                }}
                            >
                                JSON Output
                            </span>
                        </div>
                    </div>

                    <div
                        style={{
                            flex: 1,
                            padding: 32,
                            display: "flex",
                            flexDirection: "column",
                            overflow: "auto",
                        }}
                    >
                        {simulation.error ? (
                            <div
                                style={{
                                    background: "#FEF2F2",
                                    border: "1px solid #FECACA",
                                    borderRadius: 16,
                                    padding: 24,
                                    textAlign: "center",
                                }}
                            >
                                <AlertCircle size={32} style={{ color: "#EF4444", margin: "0 auto 12px" }} />
                                <p style={{ fontSize: 13, fontWeight: 700, color: "#991B1B" }}>
                                    Simulation failed. Check server logs.
                                </p>
                            </div>
                        ) : result ? (
                            <div
                                style={{
                                    flex: 1,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 24,
                                }}
                            >
                                {/* Decision Badge */}
                                <div
                                    style={{
                                        padding: 32,
                                        borderRadius: 24,
                                        border: `1px solid ${result.allowed ? "#A7F3D0" : "#FECACA"}`,
                                        background: result.allowed ? "#ECFDF5" : "#FEF2F2",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        textAlign: "center",
                                        gap: 12,
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 64,
                                            height: 64,
                                            borderRadius: 20,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            background: result.allowed ? "#10B981" : "#EF4444",
                                            color: "#fff",
                                            boxShadow: `0 8px 20px ${
                                                result.allowed
                                                    ? "rgba(16, 185, 129, 0.3)"
                                                    : "rgba(239, 68, 68, 0.3)"
                                            }`,
                                        }}
                                    >
                                        {result.allowed ? (
                                            <ShieldCheck size={32} />
                                        ) : (
                                            <ShieldAlert size={32} />
                                        )}
                                    </div>
                                    <h2
                                        style={{
                                            fontSize: 22,
                                            fontWeight: 900,
                                            color: result.allowed ? "#059669" : "#DC2626",
                                            margin: 0,
                                        }}
                                    >
                                        Access {result.allowed ? "Granted" : "Denied"}
                                    </h2>
                                    <p
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: "#64748B",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.06em",
                                            margin: 0,
                                        }}
                                    >
                                        Effect:{" "}
                                        <span style={{ color: "#1E293B" }}>{result.effect}</span>
                                    </p>
                                </div>

                                {/* Meta Grid */}
                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr 1fr",
                                        gap: 16,
                                    }}
                                >
                                    <MetaCard label="Reason" value={result.reason || "—"} />
                                    <MetaCard label="Execution Time" value={result.executionTime || "—"} />
                                    <MetaCard label="Matched Rule" value={result.matchedRule || "No match"} />
                                    <MetaCard label="Role" value={result.context?.role || "—"} />
                                </div>

                                {/* Evaluated Rules Trace */}
                                {result.evaluatedRules && result.evaluatedRules.length > 0 && (
                                    <div
                                        style={{
                                            background: "#F8FAFC",
                                            borderRadius: 24,
                                            border: "1px solid #E2E8F0",
                                            padding: 24,
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                marginBottom: 16,
                                            }}
                                        >
                                            <List size={14} style={{ color: "#94A3B8" }} />
                                            <span
                                                style={{
                                                    fontSize: 10,
                                                    fontWeight: 800,
                                                    color: "#94A3B8",
                                                    textTransform: "uppercase",
                                                    letterSpacing: "0.08em",
                                                }}
                                            >
                                                Evaluated Rules ({result.evaluatedRules.length})
                                            </span>
                                        </div>
                                        {result.evaluatedRules.map((rule, idx) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
                                                    padding: "8px 12px",
                                                    borderRadius: 12,
                                                    background: "#fff",
                                                    border: "1px solid #F1F5F9",
                                                    marginBottom: 8,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        fontWeight: 600,
                                                        color: "#475569",
                                                    }}
                                                >
                                                    {rule.description}
                                                </span>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <span
                                                        style={{
                                                            fontSize: 9,
                                                            fontWeight: 800,
                                                            color: "#94A3B8",
                                                            textTransform: "uppercase",
                                                        }}
                                                    >
                                                        P{rule.priority}
                                                    </span>
                                                    <span
                                                        style={{
                                                            fontSize: 9,
                                                            fontWeight: 800,
                                                            padding: "2px 8px",
                                                            borderRadius: 6,
                                                            background:
                                                                rule.effect === "allow"
                                                                    ? "#ECFDF5"
                                                                    : "#FEF2F2",
                                                            color:
                                                                rule.effect === "allow"
                                                                    ? "#059669"
                                                                    : "#DC2626",
                                                            textTransform: "uppercase",
                                                        }}
                                                    >
                                                        {rule.effect}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Raw JSON */}
                                <div
                                    style={{
                                        background: "#0F172A",
                                        borderRadius: 24,
                                        padding: 32,
                                        overflow: "hidden",
                                        position: "relative",
                                    }}
                                >
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            height: 3,
                                            background:
                                                "linear-gradient(to right, #4F46E5, #A855F7, #10B981)",
                                        }}
                                    />
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            marginBottom: 16,
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: 10,
                                                fontWeight: 800,
                                                color: "#818CF8",
                                                textTransform: "uppercase",
                                                letterSpacing: "0.08em",
                                            }}
                                        >
                                            Raw Response
                                        </span>
                                        <button
                                            onClick={() =>
                                                navigator.clipboard.writeText(
                                                    JSON.stringify(result, null, 2)
                                                )
                                            }
                                            style={{
                                                fontSize: 9,
                                                fontWeight: 800,
                                                color: "#818CF8",
                                                textTransform: "uppercase",
                                                letterSpacing: "0.08em",
                                                background: "none",
                                                border: "none",
                                                cursor: "pointer",
                                            }}
                                        >
                                            Copy JSON
                                        </button>
                                    </div>
                                    <pre
                                        style={{
                                            color: "#C7D2FE",
                                            fontFamily: "monospace",
                                            fontSize: 11,
                                            lineHeight: 1.6,
                                            overflow: "auto",
                                            maxHeight: 200,
                                            margin: 0,
                                        }}
                                    >
                                        {JSON.stringify(result, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        ) : (
                            <div
                                style={{
                                    flex: 1,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    textAlign: "center",
                                    padding: 48,
                                }}
                            >
                                <div
                                    style={{
                                        width: 80,
                                        height: 80,
                                        background: "#F8FAFC",
                                        borderRadius: 32,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: "#CBD5E1",
                                        marginBottom: 24,
                                        border: "1px solid #F1F5F9",
                                    }}
                                >
                                    <Terminal size={40} />
                                </div>
                                <h3
                                    style={{
                                        fontSize: 16,
                                        fontWeight: 900,
                                        color: "#1E293B",
                                        margin: 0,
                                    }}
                                >
                                    Ready for Simulation
                                </h3>
                                <p
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: "#94A3B8",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.06em",
                                        marginTop: 8,
                                        maxWidth: 300,
                                    }}
                                >
                                    Select a permission and optionally provide a resource object to
                                    test your security policies.
                                </p>
                                <div
                                    style={{
                                        marginTop: 32,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        fontSize: 10,
                                        fontWeight: 800,
                                        color: "#4F46E5",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.08em",
                                        background: "#EEF2FF",
                                        padding: "8px 16px",
                                        borderRadius: 12,
                                        border: "1px solid #C7D2FE",
                                    }}
                                >
                                    <Zap size={14} />
                                    Simulations do not affect live data
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function SectionHeader({ icon, label }) {
    return (
        <h4
            style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 10,
                fontWeight: 800,
                color: "#94A3B8",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: 0,
            }}
        >
            {icon}
            {label}
        </h4>
    );
}

function FormField({ label, children }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
                style={{
                    fontSize: 9,
                    fontWeight: 800,
                    color: "#94A3B8",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginLeft: 4,
                }}
            >
                {label}
            </label>
            {children}
        </div>
    );
}

function MetaCard({ label, value }) {
    return (
        <div
            style={{
                background: "#F8FAFC",
                borderRadius: 20,
                padding: 20,
                border: "1px solid #F1F5F9",
            }}
        >
            <span
                style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: "#94A3B8",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    display: "block",
                    marginBottom: 8,
                }}
            >
                {label}
            </span>
            <span
                style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#334155",
                    wordBreak: "break-word",
                }}
            >
                {value}
            </span>
        </div>
    );
}

const inputStyle = {
    width: "100%",
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    padding: "8px 16px",
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
    outline: "none",
    boxSizing: "border-box",
};
