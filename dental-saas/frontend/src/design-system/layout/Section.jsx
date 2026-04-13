/**
 * Section.jsx — Page Section Primitive
 *
 * A semantic content section with consistent vertical spacing.
 * Replaces raw <div className="mb-8"> / <div className="mt-6"> patterns.
 *
 * Usage:
 *   <Section>...</Section>
 *   <Section title="Version History" subtitle="Newest first">
 *     <DataTable ... />
 *   </Section>
 *   <Section spacing="lg" divider>...</Section>
 */
import React from "react";

const SPACING = {
    none: "",
    sm: "mb-4",
    md: "mb-6",    // default
    lg: "mb-10",
    xl: "mb-14",
};

export function Section({
    children,
    title,
    subtitle,
    spacing = "md",
    divider = false,
    action,
    className = "",
}) {
    const gapClass = SPACING[spacing] ?? SPACING.md;

    return (
        <section className={[gapClass, className].filter(Boolean).join(" ")}>
            {/* Optional section header */}
            {(title || action) && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "1rem",
                        paddingBottom: divider ? "0.75rem" : 0,
                        borderBottom: divider ? "1px solid rgba(51,65,85,0.4)" : "none",
                    }}
                >
                    <div>
                        {title && (
                            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#e2e8f0" }}>
                                {title}
                            </h2>
                        )}
                        {subtitle && (
                            <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                                {subtitle}
                            </p>
                        )}
                    </div>
                    {action && <div style={{ flexShrink: 0 }}>{action}</div>}
                </div>
            )}
            {children}
        </section>
    );
}

export default Section;
