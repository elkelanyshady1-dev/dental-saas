/**
 * SystemWarningBanner.jsx — Phase 24 System Intelligence Panel
 *
 * Global warning strip showing configuration conflicts:
 *   - Flag overrides
 *   - Missing dependencies
 *   - Permission conflicts
 *
 * SENTINEL RULE: capabilities.includes() — ENFORCED
 * PLANE: Org only
 */

import { useState } from "react";

export default function SystemWarningBanner({ warnings = [] }) {
    const [expanded, setExpanded] = useState(false);

    if (!warnings.length) return null;

    const count = warnings.length;

    return (
        <div id="fcc-warning-banner">
            <div
                className="fcc-warning-banner"
                onClick={() => setExpanded(!expanded)}
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
            >
                <span className="fcc-warning-banner__icon">⚠️</span>
                <span className="fcc-warning-banner__text">
                    {count} configuration conflict{count > 1 ? "s" : ""} detected
                </span>
                <span className="fcc-warning-banner__action">
                    {expanded ? "Hide ▲" : "Review ▼"}
                </span>
            </div>

            {expanded && (
                <div style={{
                    padding: "12px 20px",
                    marginBlockStart: "-1px",
                    marginBlockEnd: "16px",
                    borderRadius: "0 0 12px 12px",
                    background: "rgba(245, 158, 11, 0.04)",
                    border: "1px solid rgba(245, 158, 11, 0.12)",
                    borderBlockStart: "none",
                }}>
                    {warnings.map((w, i) => (
                        <div key={i} style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "8px 0",
                            borderBlockEnd: i < count - 1 ? "1px solid rgba(148,163,184,0.06)" : "none",
                            fontSize: "13px",
                            color: "#94A3B8",
                        }}>
                            <span style={{ fontSize: "14px" }}>{w.icon}</span>
                            <span style={{ flex: 1 }}>{w.message}</span>
                            <span className={`fcc-source-badge fcc-source-badge--${w.source}`}>
                                {w.source}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
