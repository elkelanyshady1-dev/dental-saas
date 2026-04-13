/**
 * SectionHeader.jsx — Governed Section Title Component
 *
 * Renders a section heading with optional subtitle and action slot.
 *
 * Usage:
 *   <SectionHeader title="Version History" />
 *   <SectionHeader
 *     title="Plan Templates"
 *     subtitle="Newest first · Only draft versions can be edited"
 *     action={<Button size="sm">+ Create</Button>}
 *   />
 */
import React from "react";

export function SectionHeader({ title, subtitle, action, className = "" }) {
    return (
        <div
            className={["flex items-center justify-between gap-4", className].filter(Boolean).join(" ")}
            style={{ marginBottom: "1rem" }}
        >
            <div>
                <h2 style={{
                    margin: 0,
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: "#e2e8f0",
                    lineHeight: 1.4,
                }}>
                    {title}
                </h2>
                {subtitle && (
                    <p style={{
                        margin: "0.2rem 0 0",
                        fontSize: "0.8rem",
                        color: "#64748b",
                    }}>
                        {subtitle}
                    </p>
                )}
            </div>
            {action && (
                <div style={{ flexShrink: 0 }}>
                    {action}
                </div>
            )}
        </div>
    );
}

export default SectionHeader;
