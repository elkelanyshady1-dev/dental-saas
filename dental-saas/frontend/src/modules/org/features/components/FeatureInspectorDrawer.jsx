/**
 * FeatureInspectorDrawer.jsx — Phase 24 System Intelligence Panel
 *
 * Right-side slide-in panel showing complete auth trace for a feature:
 *   - Feature metadata (name, module, status)
 *   - Decision Chain:
 *       ✔ Plan: allowed
 *       ✔ Feature Flag: enabled
 *       ✔ RBAC: allowed
 *       ❌ Policy: restricted (field-level)
 *   - Final Decision: FULL ACCESS / PARTIAL / DENIED
 *   - JSON debug preview
 *
 * Aligned with backend Auth Trace concept (Phase 22)
 *
 * SENTINEL RULE: capabilities.includes() — ENFORCED
 * PLANE: Org only
 */

import { useEffect, useCallback } from "react";

/**
 * DecisionStep — single step in the decision chain
 */
function DecisionStep({ label, passed, detail }) {
    return (
        <div className={`fcc-decision-step fcc-decision-step--${passed ? "pass" : "fail"}`}>
            <div className="fcc-decision-step__icon">
                {passed ? "✔" : "✘"}
            </div>
            <span className="fcc-decision-step__label">{label}</span>
            <span className="fcc-decision-step__result">{detail}</span>
        </div>
    );
}

/**
 * JSON with syntax coloring
 */
function JsonPreview({ data }) {
    const highlight = (json) => {
        return json
            .replace(/"([^"]+)":/g, '<span class="fcc-json-key">"$1"</span>:')
            .replace(/: "(.*?)"/g, ': <span class="fcc-json-string">"$1"</span>')
            .replace(/: true/g, ': <span class="fcc-json-bool-true">true</span>')
            .replace(/: false/g, ': <span class="fcc-json-bool-false">false</span>');
    };

    const formatted = JSON.stringify(data, null, 2);
    return (
        <div
            className="fcc-json-preview"
            dangerouslySetInnerHTML={{ __html: highlight(formatted) }}
        />
    );
}

export default function FeatureInspectorDrawer({ feature, onClose }) {
    // Close on Escape
    const handleKeyDown = useCallback((e) => {
        if (e.key === "Escape") onClose?.();
    }, [onClose]);

    useEffect(() => {
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    if (!feature) return null;

    const {
        name,
        module: moduleName,
        key,
        status,
        source,
        risk,
        decisionChain = [],
    } = feature;

    // Determine final decision
    const allPass = decisionChain.every(d => d.passed);
    const anyFail = decisionChain.some(d => !d.passed);
    const partialFail = anyFail && !decisionChain.every(d => !d.passed);

    let finalDecision, finalLabel, finalClass;
    if (allPass) {
        finalDecision = "allowed";
        finalLabel = "FULL ACCESS";
        finalClass = "fcc-final-decision--allowed";
    } else if (partialFail) {
        finalDecision = "partial";
        finalLabel = "PARTIAL ACCESS";
        finalClass = "fcc-final-decision--partial";
    } else {
        finalDecision = "denied";
        finalLabel = "ACCESS DENIED";
        finalClass = "fcc-final-decision--denied";
    }

    const jsonData = {
        feature: name,
        module: moduleName,
        key,
        enabled: status === "on",
        controlSource: source,
        risk,
        decisionChain: decisionChain.map(d => ({
            layer: d.label,
            allowed: d.passed,
            detail: d.detail,
        })),
        finalDecision,
    };

    return (
        <>
            {/* Overlay */}
            <div
                className="fcc-drawer-overlay"
                onClick={onClose}
                id="fcc-drawer-overlay"
            />

            {/* Drawer */}
            <div className="fcc-drawer" id="fcc-feature-inspector" role="dialog" aria-modal="true">
                {/* Header */}
                <div className="fcc-drawer__header">
                    <span className="fcc-drawer__title">Feature Inspector</span>
                    <button
                        className="fcc-drawer__close"
                        onClick={onClose}
                        aria-label="Close inspector"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="fcc-drawer__body">
                    {/* Feature Info */}
                    <div className="fcc-drawer__section">
                        <div className="fcc-drawer__section-title">Feature Details</div>
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "12px",
                        }}>
                            <div>
                                <div style={{ fontSize: "11px", color: "#64748B", marginBottom: "4px" }}>Name</div>
                                <div style={{ fontWeight: 600, color: "#F1F5F9" }}>{name}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: "11px", color: "#64748B", marginBottom: "4px" }}>Module</div>
                                <div style={{ fontWeight: 600, color: "#F1F5F9" }}>{moduleName}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: "11px", color: "#64748B", marginBottom: "4px" }}>Key</div>
                                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "#60A5FA" }}>{key}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: "11px", color: "#64748B", marginBottom: "4px" }}>Risk Level</div>
                                <span className={`fcc-risk-badge fcc-risk-badge--${risk}`}>
                                    {risk === "critical" ? "🔴" : risk === "medium" ? "🟡" : "🟢"} {risk}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Decision Chain */}
                    <div className="fcc-drawer__section">
                        <div className="fcc-drawer__section-title">Authorization Decision Chain</div>
                        <div className="fcc-decision-chain">
                            {decisionChain.map((step, i) => (
                                <DecisionStep
                                    key={i}
                                    label={step.label}
                                    passed={step.passed}
                                    detail={step.detail}
                                />
                            ))}
                        </div>

                        {/* Final Decision */}
                        <div className={`fcc-final-decision ${finalClass}`}>
                            <span style={{ fontSize: "18px" }}>
                                {finalDecision === "allowed" ? "✅" : finalDecision === "partial" ? "⚠️" : "🚫"}
                            </span>
                            <span>Final Decision: {finalLabel}</span>
                        </div>
                    </div>

                    {/* Raw JSON */}
                    <div className="fcc-drawer__section">
                        <div className="fcc-drawer__section-title">Debug Context (JSON)</div>
                        <JsonPreview data={jsonData} />
                    </div>
                </div>
            </div>
        </>
    );
}
