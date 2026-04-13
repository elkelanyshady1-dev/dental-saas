/**
 * StatCard.jsx — Governed Statistics Card
 *
 * Renders a metric tile with label + value, used in dashboard strips.
 * Replaces all raw inline-style stat card patterns (rgba(30,41,59,...)).
 *
 * Usage:
 *   <StatCard label="Total Versions" value={12} />
 *   <StatCard label="Active Version" value="1" accent />
 *   <StatCard label="Revenue" value="$4,200" loading />
 */
import React from "react";

export function StatCard({
    label,
    value,
    accent = false,
    loading = false,
    icon,
    className = "",
    style,
}) {
    return (
        <div
            className={[
                "rounded-xl p-4 backdrop-blur-md border",
                "flex flex-col gap-1",
                className,
            ].filter(Boolean).join(" ")}
            style={{
                background: "rgba(30,41,59,0.92)",
                border: "1px solid rgba(99,102,241,0.22)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                ...style,
            }}
        >
            {/* Label row */}
            <div style={{
                fontSize: "0.65rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#94a3b8",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
            }}>
                {icon && <span style={{ opacity: 0.7 }}>{icon}</span>}
                {label}
            </div>

            {/* Value */}
            <div style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                color: accent ? "#818cf8" : "#f1f5f9",
                lineHeight: 1.1,
            }}>
                {loading ? (
                    <span style={{ color: "#334155", fontWeight: 400 }}>…</span>
                ) : (
                    value ?? <span style={{ color: "#334155", fontWeight: 400 }}>—</span>
                )}
            </div>
        </div>
    );
}

export default StatCard;
