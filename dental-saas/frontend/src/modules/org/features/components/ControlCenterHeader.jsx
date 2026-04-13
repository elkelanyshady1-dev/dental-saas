/**
 * ControlCenterHeader.jsx — Phase 24 System Intelligence Panel
 *
 * Header with:
 *   - Title + subtitle
 *   - Plan badge (Enterprise / Pro / Basic)
 *   - System health indicator (pulsing dot)
 *   - Settings CTA
 *
 * SENTINEL RULE: capabilities.includes() — ENFORCED
 * SENTINEL RULE: role === "admin" — FORBIDDEN
 * PLANE: Org only
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useFeatures } from "@/context/FeatureContext";
import { useAuth } from "@/context/AuthContext";

const PLAN_MAP = {
    enterprise: { label: "Enterprise", cls: "fcc-plan-badge--enterprise", icon: "💎" },
    pro:        { label: "Pro",        cls: "fcc-plan-badge--pro",        icon: "⚡" },
    basic:      { label: "Basic",      cls: "fcc-plan-badge--basic",      icon: "📦" },
    trial:      { label: "Trial",      cls: "fcc-plan-badge--basic",      icon: "🧪" },
};

export default function ControlCenterHeader({ flagOverrides = 0 }) {
    const navigate = useNavigate();
    const { subscriptionStatus } = useFeatures();
    const { user } = useAuth();

    const planName = useMemo(() => {
        const sub = user?.organization?.subscription;
        const planSlug = sub?.plan?.slug || sub?.planName || "";
        if (planSlug.includes("enterprise")) return "enterprise";
        if (planSlug.includes("pro")) return "pro";
        if (planSlug.includes("basic")) return "basic";
        return subscriptionStatus === "active" ? "pro" : "trial";
    }, [user, subscriptionStatus]);

    const plan = PLAN_MAP[planName] || PLAN_MAP.trial;

    const healthStatus = flagOverrides > 0 ? "warn" : "ok";
    const healthText = flagOverrides > 0
        ? `${flagOverrides} flag override${flagOverrides > 1 ? "s" : ""} active`
        : "All systems operational";

    return (
        <header className="fcc-header" id="fcc-header">
            <div className="fcc-header__left">
                <h1>Features & Modules</h1>
                <p>Manage capabilities, permissions, and system behavior</p>
            </div>

            <div className="fcc-header__right">
                {/* Plan Badge */}
                <span className={`fcc-plan-badge ${plan.cls}`} id="fcc-plan-badge">
                    <span>{plan.icon}</span>
                    <span>{plan.label}</span>
                </span>

                {/* Health Indicator */}
                <span className="fcc-health" id="fcc-health-indicator">
                    <span className={`fcc-health__dot fcc-health__dot--${healthStatus}`} />
                    <span>{healthText}</span>
                </span>

                {/* Settings Button */}
                <button
                    className="fcc-settings-btn"
                    id="fcc-settings-btn"
                    onClick={() => navigate("/org/settings")}
                >
                    ⚙️ System Settings
                </button>
            </div>
        </header>
    );
}
