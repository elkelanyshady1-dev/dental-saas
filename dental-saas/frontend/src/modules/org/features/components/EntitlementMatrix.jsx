/**
 * EntitlementMatrix.jsx — Phase 24 System Intelligence Panel
 *
 * Enhanced role × permission matrix with:
 *   - Sticky header + first column
 *   - Hover: highlight column + row
 *   - Cell states: granted (✔), denied (—), inherited (⬡)
 *   - Click cell → edit/inspect interaction
 *
 * SENTINEL RULE: capabilities.includes() — ENFORCED
 * SENTINEL RULE: role === "admin" — FORBIDDEN
 * PLANE: Org only
 */

import { useState, useCallback } from "react";

/**
 * MatrixCell — individual permission cell
 */
function MatrixCell({ granted, inherited, onClick }) {
    let cls = "fcc-matrix__cell ";
    let icon;

    if (granted) {
        cls += "fcc-matrix__cell--granted";
        icon = "✔";
    } else if (inherited) {
        cls += "fcc-matrix__cell--inherited";
        icon = "⬡";
    } else {
        cls += "fcc-matrix__cell--denied";
        icon = "—";
    }

    return (
        <span className={cls} onClick={onClick} title={granted ? "Granted" : inherited ? "Inherited" : "Denied"}>
            {icon}
        </span>
    );
}

export default function EntitlementMatrix({ roles = [], permissions = [], matrix = {}, onCellClick }) {
    const [hoverCol, setHoverCol] = useState(null);
    const [hoverRow, setHoverRow] = useState(null);

    const handleCellClick = useCallback((roleKey, permKey) => {
        onCellClick?.({
            role: roleKey,
            permission: permKey,
            currentState: matrix?.[roleKey]?.[permKey],
        });
    }, [matrix, onCellClick]);

    if (!roles.length || !permissions.length) {
        return (
            <section className="fcc-section" id="fcc-matrix-section">
                <div className="fcc-section__header">
                    <span className="fcc-section__title">Entitlement Matrix</span>
                </div>
                <div style={{
                    padding: "40px",
                    textAlign: "center",
                    color: "#64748B",
                    fontSize: "13px",
                    background: "rgba(30,41,59,0.6)",
                    borderRadius: "16px",
                    border: "1px solid rgba(148,163,184,0.08)",
                }}>
                    No matrix data available. Role and permission data is loaded from the backend.
                </div>
            </section>
        );
    }

    return (
        <section className="fcc-section" id="fcc-matrix-section">
            <div className="fcc-section__header">
                <div>
                    <span className="fcc-section__title">Entitlement Matrix</span>
                    <span className="fcc-section__subtitle">
                        {roles.length} roles × {permissions.length} permissions
                    </span>
                </div>
            </div>

            <div className="fcc-matrix-wrap">
                <table className="fcc-matrix" id="fcc-entitlement-matrix">
                    <thead>
                        <tr>
                            <th>Permission</th>
                            {roles.map((role, ci) => (
                                <th
                                    key={role.key}
                                    className={hoverCol === ci ? "fcc-matrix--col-highlight" : ""}
                                    onMouseEnter={() => setHoverCol(ci)}
                                    onMouseLeave={() => setHoverCol(null)}
                                >
                                    {role.name}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {permissions.map((perm, ri) => (
                            <tr
                                key={perm.key}
                                className={hoverRow === ri ? "fcc-matrix--row-highlight" : ""}
                                onMouseEnter={() => setHoverRow(ri)}
                                onMouseLeave={() => setHoverRow(null)}
                            >
                                <td>{perm.label}</td>
                                {roles.map((role, ci) => {
                                    const cell = matrix?.[role.key]?.[perm.key];
                                    return (
                                        <td
                                            key={role.key}
                                            className={hoverCol === ci ? "fcc-matrix--col-highlight" : ""}
                                            onMouseEnter={() => setHoverCol(ci)}
                                            onMouseLeave={() => setHoverCol(null)}
                                        >
                                            <MatrixCell
                                                granted={cell === "granted" || cell === true}
                                                inherited={cell === "inherited"}
                                                onClick={() => handleCellClick(role.key, perm.key)}
                                            />
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
