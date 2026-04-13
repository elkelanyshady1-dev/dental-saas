/**
 * ModulesGrid.jsx — Phase 24 System Intelligence Panel
 *
 * 4-column responsive grid of module cards with 4 states:
 *   1. Enabled — green border, toggle ON
 *   2. Disabled — gray, toggle OFF
 *   3. Locked (Plan) — blurred overlay, lock icon, Upgrade CTA
 *   4. Flag Disabled — red tint, disabled toggle, platform label
 *
 * Each card shows:
 *   - Module icon + name + description
 *   - Toggle switch (respecting state)
 *   - Dependency indicator
 *   - Mini usage stats
 *
 * SENTINEL RULE: capabilities.includes() — ENFORCED
 * SENTINEL RULE: role === "admin" — FORBIDDEN
 * PLANE: Org only
 */

/**
 * ToggleSwitch — reusable micro-component
 */
function ToggleSwitch({ on, disabled, onToggle }) {
    const cls = [
        "fcc-toggle",
        on && "fcc-toggle--on",
        disabled && "fcc-toggle--disabled",
    ].filter(Boolean).join(" ");

    return (
        <div
            className={cls}
            role="switch"
            aria-checked={on}
            tabIndex={disabled ? -1 : 0}
            onClick={() => !disabled && onToggle?.(!on)}
            onKeyDown={e => !disabled && e.key === "Enter" && onToggle?.(!on)}
        >
            <div className="fcc-toggle__knob" />
        </div>
    );
}

/**
 * ModuleCard — individual module card
 */
function ModuleCard({ module, onToggle }) {
    const {
        key,
        name,
        icon,
        description,
        state,       // "enabled" | "disabled" | "locked" | "flagged"
        dependency,
        usageCount,
        flagReason,
    } = module;

    const stateClass = `fcc-module-card fcc-module-card--${state}`;
    const isToggleable = state === "enabled" || state === "disabled";
    const isOn = state === "enabled";

    return (
        <div className={stateClass} id={`fcc-module-card-${key}`}>
            {/* Top row: icon + toggle */}
            <div className="fcc-module-card__top">
                <div className="fcc-module-card__icon-wrap">{icon}</div>
                {isToggleable && (
                    <ToggleSwitch
                        on={isOn}
                        disabled={false}
                        onToggle={(val) => onToggle?.(key, val)}
                    />
                )}
                {state === "flagged" && (
                    <ToggleSwitch on={false} disabled />
                )}
            </div>

            {/* Name + Description */}
            <div className="fcc-module-card__name">{name}</div>
            <div className="fcc-module-card__desc">{description}</div>

            {/* Tags row */}
            <div className="fcc-module-card__meta">
                {dependency && (
                    <span className="fcc-module-card__tag fcc-module-card__tag--dep">
                        🔗 Requires {dependency}
                    </span>
                )}
                {usageCount !== undefined && (
                    <span className="fcc-module-card__tag fcc-module-card__tag--usage">
                        📊 {usageCount} actions today
                    </span>
                )}
                {state === "flagged" && flagReason && (
                    <span className="fcc-module-card__tag fcc-module-card__tag--flagged">
                        🚫 {flagReason}
                    </span>
                )}
            </div>

            {/* Lock overlay */}
            {state === "locked" && (
                <div className="fcc-module-card__lock-overlay">
                    <span className="fcc-module-card__lock-icon">🔒</span>
                    <button className="fcc-module-card__upgrade-btn">
                        Upgrade Plan
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * ModulesGrid — main grid layout
 */
export default function ModulesGrid({ modules = [], onToggle }) {
    return (
        <section className="fcc-section" id="fcc-modules-section">
            <div className="fcc-section__header">
                <div>
                    <span className="fcc-section__title">Modules</span>
                    <span className="fcc-section__subtitle">
                        {modules.filter(m => m.state === "enabled").length} active
                    </span>
                </div>
            </div>
            <div className="fcc-modules-grid">
                {modules.map(mod => (
                    <ModuleCard
                        key={mod.key}
                        module={mod}
                        onToggle={onToggle}
                    />
                ))}
            </div>
        </section>
    );
}

export { ToggleSwitch };
