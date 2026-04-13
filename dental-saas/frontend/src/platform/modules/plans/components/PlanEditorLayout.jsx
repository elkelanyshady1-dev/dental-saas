/**
 * PlanEditorLayout.jsx
 * v2.0 — Unified Plan Editor with scrollable sections + sidebar
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  Sticky Header (title, version, status badges)         │
 *   ├───────────────────────────────────┬─────────────────────┤
 *   │  Main Content (sections)         │  Sidebar            │
 *   │  · Core Configuration            │  · Editor Nav       │
 *   │  · Pricing Logic                 │  · Change Summary   │
 *   │  · Feature Matrix                │  · Go Live btn      │
 *   │  · Compliance (Settings)         │  · Discard Draft    │
 *   │                                  │  · Auto-save status │
 *   └───────────────────────────────────┴─────────────────────┘
 *
 * Matches the "Unified Plan Editor" mockup with:
 *   - Section headers with CHANGED badges
 *   - Right sidebar with navigation dots + change summary
 *   - Sticky "Go Live" + "Discard Draft" actions in sidebar
 */
import React, { useRef, useEffect, useState, useCallback } from "react";
import PlanHeader from "./PlanHeader";

const SECTIONS = [
    { id: "core", label: "Core Configuration", icon: "⚙" },
    { id: "pricing", label: "Pricing Logic", icon: "💳" },
    { id: "features", label: "Feature Matrix", icon: "⊞" },
    { id: "compliance", label: "Compliance", icon: "🛡" },
];

export default function PlanEditorLayout({
    title,
    versionTag,
    status,
    isReadOnly,
    isDirty,
    saving,
    onSaveDraft,
    onGoLive,
    onDiscard,
    onBack,
    children,
    changeSummary = [],  // [{ label, detail, type: 'change'|'add'|'remove' }]
    lastSaved,
}) {
    const sectionRefs = useRef({});
    const [activeSection, setActiveSection] = useState("core");

    // Track scroll to highlight active nav item
    const handleScroll = useCallback(() => {
        const scrollTop = window.scrollY + 120; // offset for sticky header
        let current = "core";
        for (const section of SECTIONS) {
            const el = sectionRefs.current[section.id];
            if (el && el.offsetTop <= scrollTop) {
                current = section.id;
            }
        }
        setActiveSection(current);
    }, []);

    useEffect(() => {
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, [handleScroll]);

    const scrollToSection = (id) => {
        const el = sectionRefs.current[id];
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

    const registerRef = (id) => (el) => {
        if (el) sectionRefs.current[id] = el;
    };

    // Determine if this is a read-only summary view (no sidebar needed)
    if (isReadOnly) {
        return (
            <div className="plan-editor">
                <PlanHeader
                    title={title}
                    versionTag={versionTag}
                    status={status}
                    isReadOnly
                    onBack={onBack}
                />
                <div className="plan-editor__content" style={{ maxWidth: "56rem", margin: "0 auto" }}>
                    <div className="plan-editor__main plan-editor__main--full">
                        {children}
                    </div>
                </div>
            </div>
        );
    }

    // Inject section IDs into children using context-like pattern
    const childrenWithRefs = React.Children.map(children, (child, index) => {
        const sectionId = SECTIONS[index]?.id;
        if (!sectionId || !React.isValidElement(child)) return child;
        return (
            <div
                key={sectionId}
                ref={registerRef(sectionId)}
                id={`section-${sectionId}`}
                style={{ scrollMarginTop: "6rem" }}
            >
                {child}
            </div>
        );
    });

    // Check if Go Live is available
    const canGoLive = !isReadOnly && status === "draft" && !saving;

    return (
        <div className="plan-editor">
            {/* Sticky Header */}
            <PlanHeader
                title={title}
                versionTag={versionTag}
                status={status}
                isReadOnly={isReadOnly}
                isDirty={isDirty}
                saving={saving}
                onSaveDraft={onSaveDraft}
                onBack={onBack}
            />

            {/* Main area: content + sidebar */}
            <div className="plan-editor__content">
                {/* Left: Scrollable sections */}
                <div className="plan-editor__main">
                    {childrenWithRefs}
                </div>

                {/* Right: Sticky sidebar */}
                <div className="plan-editor__sidebar">
                    <div className="editor-sidebar" style={{ position: "sticky", top: "5rem" }}>

                        {/* Editor Navigation */}
                        <div className="editor-sidebar__nav">
                            <div className="editor-sidebar__title">EDITOR NAVIGATION</div>
                            {SECTIONS.map(section => {
                                const isActive = activeSection === section.id;
                                const hasChange = changeSummary.some(c =>
                                    c.section === section.id || c.section === section.label
                                );
                                return (
                                    <button
                                        key={section.id}
                                        className={`editor-sidebar__link ${isActive ? "editor-sidebar__link--active" : ""}`}
                                        onClick={() => scrollToSection(section.id)}
                                    >
                                        <span>{section.label}</span>
                                        <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                                            {isActive && <span className="editor-sidebar__dot editor-sidebar__dot--active" />}
                                            {hasChange && !isActive && <span className="editor-sidebar__dot editor-sidebar__dot--changed" />}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Change Summary */}
                        {changeSummary.length > 0 && (
                            <div className="editor-sidebar__changes">
                                <div className="editor-sidebar__title">CHANGE SUMMARY</div>
                                {changeSummary.map((change, i) => (
                                    <div key={i} className="editor-sidebar__change-item">
                                        <span className={`editor-sidebar__change-icon editor-sidebar__change-icon--${change.type || 'change'}`}>
                                            {change.type === 'add' ? '＋' : change.type === 'remove' ? '−' : '◎'}
                                        </span>
                                        <div>
                                            <div className="editor-sidebar__change-label">{change.label}</div>
                                            {change.detail && (
                                                <div className="editor-sidebar__change-detail">{change.detail}</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Actions */}
                        {!isReadOnly && (
                            <div className="editor-sidebar__actions">
                                {canGoLive && onGoLive && (
                                    <button
                                        className="editor-sidebar__btn editor-sidebar__btn--primary"
                                        onClick={onGoLive}
                                        disabled={saving}
                                    >
                                        Go Live
                                    </button>
                                )}
                                {onDiscard && isDirty && (
                                    <button
                                        className="editor-sidebar__btn editor-sidebar__btn--ghost"
                                        onClick={onDiscard}
                                        disabled={saving}
                                    >
                                        Discard Draft
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Auto-save status */}
                        <div className="editor-sidebar__status">
                            <span className="editor-sidebar__status-icon">☁</span>
                            <span className="editor-sidebar__status-text">
                                {saving
                                    ? "Saving…"
                                    : isDirty
                                        ? "Unsaved changes"
                                        : lastSaved
                                            ? `All changes saved to cloud`
                                            : "Up to date"
                                }
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
