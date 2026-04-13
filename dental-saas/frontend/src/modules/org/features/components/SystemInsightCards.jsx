/**
 * SystemInsightCards.jsx — Phase 24 System Intelligence Panel
 *
 * Top-level dashboard strip with Stripe-style analytics cards:
 *   1. Modules Active — "12 / 15 active"
 *   2. Feature Flags Impact — "1 feature overridden"
 *   3. Role Complexity — "24 active roles"
 *   4. Policy Coverage — "98% routes guarded"
 *
 * SENTINEL RULE: capabilities.includes() — ENFORCED
 * PLANE: Org only
 */

export default function SystemInsightCards({ insights }) {
    const {
        activeModules   = 0,
        totalModules    = 0,
        restrictedByPlan = 0,
        flagOverrides   = 0,
        activeRoles     = 0,
        customEntitlements = 0,
        guardedRoutes   = 0,
        totalRoutes     = 0,
    } = insights || {};

    const cards = [
        {
            id: "modules-active",
            label: "Modules Active",
            value: `${activeModules} / ${totalModules}`,
            sub: restrictedByPlan > 0
                ? `${restrictedByPlan} restricted by plan`
                : "All modules available",
            subClass: restrictedByPlan > 0 ? "fcc-insight-card__sub--highlight" : "fcc-insight-card__sub--success",
            accent: "primary",
            icon: "🧩",
        },
        {
            id: "flag-impact",
            label: "Feature Flags Impact",
            value: flagOverrides > 0 ? `${flagOverrides} overridden` : "No overrides",
            sub: flagOverrides > 0 ? "Click to inspect flags" : "System running clean",
            subClass: flagOverrides > 0 ? "fcc-insight-card__sub--highlight" : "fcc-insight-card__sub--success",
            accent: flagOverrides > 0 ? "warning" : "success",
            icon: "🚩",
        },
        {
            id: "role-complexity",
            label: "Role Complexity",
            value: `${activeRoles} roles`,
            sub: customEntitlements > 0
                ? `${customEntitlements} custom entitlements`
                : "Standard configuration",
            subClass: customEntitlements > 0 ? "fcc-insight-card__sub--highlight" : "",
            accent: "purple",
            icon: "🛡️",
        },
        {
            id: "policy-coverage",
            label: "Route Guard Coverage",
            value: totalRoutes > 0 ? `${Math.round((guardedRoutes / totalRoutes) * 100)}%` : "—",
            sub: `${guardedRoutes} / ${totalRoutes} routes guarded`,
            subClass: guardedRoutes === totalRoutes ? "fcc-insight-card__sub--success" : "fcc-insight-card__sub--highlight",
            accent: guardedRoutes === totalRoutes ? "success" : "warning",
            icon: "🔒",
        },
    ];

    return (
        <section className="fcc-insights" id="fcc-insights">
            {cards.map(card => (
                <div
                    key={card.id}
                    className={`fcc-insight-card fcc-insight-card--${card.accent}`}
                    id={`fcc-insight-${card.id}`}
                >
                    <div className="fcc-insight-card__icon">{card.icon}</div>
                    <div className="fcc-insight-card__label">{card.label}</div>
                    <div className="fcc-insight-card__value">{card.value}</div>
                    <div className={`fcc-insight-card__sub ${card.subClass}`}>
                        {card.sub}
                    </div>
                </div>
            ))}
        </section>
    );
}
