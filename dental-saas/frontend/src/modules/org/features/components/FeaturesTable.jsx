/**
 * FeaturesTable.jsx — Phase 24 System Intelligence Panel
 *
 * Enterprise-grade feature control table with columns:
 *   | Feature | Module | Status | Control Source | Risk | Action |
 *
 * Status:
 *   - Toggle ON → green dot
 *   - Toggle OFF → gray dot
 *   - Disabled by flag → red badge
 *   - Locked → disabled row
 *
 * Control Source badges:
 *   🟣 Plan | 🔵 Admin | 🟡 Flag | ⚙️ System
 *
 * Risk levels:
 *   🔴 Critical (security) | 🟡 Medium (operational) | 🟢 Low (cosmetic)
 *
 * SENTINEL RULE: capabilities.includes() — ENFORCED
 * PLANE: Org only
 */

/**
 * StatusCell — render status with dot
 */
function StatusCell({ status }) {
    const map = {
        on:     { dot: "fcc-status-dot--on",     label: "Enabled" },
        off:    { dot: "fcc-status-dot--off",     label: "Disabled" },
        flag:   { dot: "fcc-status-dot--flag",    label: "Flag Disabled" },
        locked: { dot: "fcc-status-dot--locked",  label: "Plan Locked" },
    };
    const s = map[status] || map.off;
    return (
        <span>
            <span className={`fcc-status-dot ${s.dot}`} />
            {s.label}
        </span>
    );
}

/**
 * SourceBadge
 */
function SourceBadge({ source }) {
    const icons = { plan: "🟣", admin: "🔵", flag: "🟡", system: "⚙️" };
    return (
        <span className={`fcc-source-badge fcc-source-badge--${source}`}>
            <span>{icons[source] || "⚙️"}</span>
            <span>{source}</span>
        </span>
    );
}

/**
 * RiskBadge
 */
function RiskBadge({ risk }) {
    const icons = { critical: "🔴", medium: "🟡", low: "🟢" };
    return (
        <span className={`fcc-risk-badge fcc-risk-badge--${risk}`}>
            <span>{icons[risk] || "🟢"}</span>
            <span>{risk}</span>
        </span>
    );
}

/**
 * FeaturesTable
 */
export default function FeaturesTable({ features = [], onInspect }) {
    return (
        <section className="fcc-section" id="fcc-features-section">
            <div className="fcc-section__header">
                <div>
                    <span className="fcc-section__title">Feature Control Layer</span>
                    <span className="fcc-section__subtitle">
                        {features.length} features registered
                    </span>
                </div>
            </div>

            <div className="fcc-table-wrap">
                <table className="fcc-table" id="fcc-features-table">
                    <thead>
                        <tr>
                            <th>Feature</th>
                            <th>Module</th>
                            <th>Status</th>
                            <th>Control Source</th>
                            <th>Risk</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {features.map((f) => (
                            <tr
                                key={f.key}
                                id={`fcc-feature-row-${f.key}`}
                                onClick={() => onInspect?.(f)}
                                style={f.status === "locked" ? { opacity: 0.5, pointerEvents: "none" } : {}}
                            >
                                <td>
                                    <span className="fcc-table__feature-name">
                                        {f.name}
                                    </span>
                                </td>
                                <td>{f.module}</td>
                                <td><StatusCell status={f.status} /></td>
                                <td><SourceBadge source={f.source} /></td>
                                <td><RiskBadge risk={f.risk} /></td>
                                <td>
                                    <button
                                        style={{
                                            background: "transparent",
                                            border: "1px solid rgba(148,163,184,0.1)",
                                            padding: "4px 12px",
                                            borderRadius: "6px",
                                            color: "#60A5FA",
                                            fontSize: "11px",
                                            fontWeight: 600,
                                            cursor: "pointer",
                                            transition: "all 0.2s",
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onInspect?.(f);
                                        }}
                                    >
                                        Inspect →
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
