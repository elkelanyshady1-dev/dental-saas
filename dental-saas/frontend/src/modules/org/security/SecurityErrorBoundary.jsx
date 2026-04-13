/**
 * SecurityErrorBoundary.jsx — Error Boundary for Security Control Center
 *
 * Catches rendering errors in any security tab and displays a graceful
 * error message instead of crashing the entire dashboard.
 *
 * MODULE: frontend/src/modules/org/security
 * PLANE: Org only.
 */
import React from "react";
import { ShieldAlert, RefreshCw } from "lucide-react";

export default class SecurityErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("[SecurityErrorBoundary]", error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 64,
                        gap: 20,
                        minHeight: 400,
                    }}
                >
                    <div
                        style={{
                            width: 72,
                            height: 72,
                            borderRadius: 24,
                            background: "#FEF2F2",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#EF4444",
                        }}
                    >
                        <ShieldAlert size={36} />
                    </div>
                    <h2
                        style={{
                            fontSize: 18,
                            fontWeight: 900,
                            color: "#1E293B",
                            letterSpacing: "-0.02em",
                            margin: 0,
                        }}
                    >
                        Security Module Error
                    </h2>
                    <p
                        style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#64748B",
                            margin: 0,
                            maxWidth: 400,
                            textAlign: "center",
                            lineHeight: 1.6,
                        }}
                    >
                        An unexpected error occurred in the Security Control Center.
                        This has been logged. Please try refreshing the module.
                    </p>
                    <button
                        onClick={this.handleRetry}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "10px 20px",
                            borderRadius: 12,
                            border: "1px solid #E2E8F0",
                            background: "#fff",
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 800,
                            color: "#4F46E5",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            transition: "all 0.2s",
                        }}
                        onMouseOver={(e) => {
                            e.target.style.background = "#F8FAFC";
                            e.target.style.borderColor = "#4F46E5";
                        }}
                        onMouseOut={(e) => {
                            e.target.style.background = "#fff";
                            e.target.style.borderColor = "#E2E8F0";
                        }}
                    >
                        <RefreshCw size={14} />
                        Retry
                    </button>
                    {process.env.NODE_ENV === "development" && this.state.error && (
                        <pre
                            style={{
                                marginTop: 16,
                                padding: 16,
                                background: "#F1F5F9",
                                borderRadius: 12,
                                fontSize: 11,
                                color: "#64748B",
                                maxWidth: "100%",
                                overflow: "auto",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                            }}
                        >
                            {this.state.error.toString()}
                        </pre>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
