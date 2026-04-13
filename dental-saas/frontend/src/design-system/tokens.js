/**
 * tokens.js — DentalSaaS UI Governance Authority v2.0
 *
 * SINGLE SOURCE OF TRUTH for all UI design tokens.
 * Upgraded to Stripe-level guardian structure.
 *
 * Structure:
 *   tokens.colors.*      — semantic color classes
 *   tokens.spacing.*     — structural spacing primitives
 *   tokens.radius.*      — border radius
 *   tokens.shadows.*     — shadow scale
 *   tokens.typography.*  — text scale
 *   tokens.transitions.* — motion tokens
 *
 * Backwards-compatible aliases:
 *   tokens.color     → tokens.colors   (v1.0 consumers still work)
 *   tokens.shadow    → tokens.shadows
 *   tokens.text      → tokens.typography
 *   tokens.transition → tokens.transitions
 *
 * Usage:
 *   import { tokens } from "@/design-system";
 *   <div className={tokens.colors.surface}>...</div>
 *   const { colors, spacing } = useTokens();
 */

// ── Core Token Groups ──────────────────────────────────────────────────────

const colors = {
    // ── Surfaces (Clinical Curator Tiers) ───────────────────────
    /** Base Layer: surface (#f7f9fb) */
    surface: "bg-surface",
    /** Sectioning: surface-container-low (#f2f4f6) */
    surfaceLow: "bg-surface-low",
    /** Actionable Cards: surface-container-lowest (#ffffff) */
    surfaceLowest: "bg-surface-lowest",
    /** Active/Elevated: surface-container-high (#e6e8ea) */
    surfaceHigh: "bg-surface-high",
    /** Legacy alias */
    bgPrimary: "bg-surface",
    /** Legacy alias */
    bgSecondary: "bg-surface-low",

    // ── Cards ───────────────────────────────────────────────────────
    /** #ffffff — card background */
    card: "bg-card",

    // ── Borders ─────────────────────────────────────────────────────
    /** #e2e8f0 — standard border */
    border: "border-border",
    /** #f1f5f9 — subtle border */
    borderSubtle: "border-subtle",

    // ── Brand / Accent ──────────────────────────────────────────────
    /** #4f46e5 — indigo accent */
    accent: "bg-brand-accent",
    accentHover: "hover:bg-brand-hover",
    /** #2563eb — primary brand blue */
    brandPrimary: "bg-brand-primary",
    brandHover: "bg-brand-hover",

    // ── Typography ──────────────────────────────────────────────────
    /** #0f172a — primary text */
    textPrimary: "text-text-primary",
    /** #475569 — secondary text */
    textSecondary: "text-text-secondary",
    /** #64748b — muted text */
    textMuted: "text-text-muted",
    /** #94a3b8 — subtle / hint text */
    textSubtle: "text-text-subtle",

    // ── Semantic Status ─────────────────────────────────────────────
    /** #10b981 */
    success: "text-success",
    successBg: "bg-success-bg",
    /** #f59e0b */
    warning: "text-warning",
    warningBg: "bg-warning-bg",
    /** #ef4444 */
    danger: "text-danger",
    dangerBg: "bg-danger-bg",
    /** #3b82f6 */
    info: "text-info",
    infoBg: "bg-info-bg",
};

const spacing = {
    // Named scale — use these in Stack / Grid / Section
    /** 4px */
    xs: "gap-1",
    /** 8px */
    sm: "gap-2",
    /** 16px */
    md: "gap-4",
    /** 24px */
    lg: "gap-6",
    /** 32px */
    xl: "gap-8",
    /** 48px */
    "2xl": "gap-12",

    // Padding aliases for components
    cardPadding: "p-5",
    cardPaddingLg: "p-6",
    inputPadding: "px-3 py-2",
    sectionGap: "gap-6",

    // Page structure
    pagePaddingX: "px-8",
    pagePaddingY: "py-8",
};

const radius = {
    /** 16px — cards, surfaces */
    card: "rounded-card",
    /** 12px — buttons */
    btn: "rounded-btn",
    /** 9999px — pills */
    pill: "rounded-pill",
    sm: "rounded-md",
    base: "rounded-lg",
    xl: "rounded-xl",
    "2xl": "rounded-2xl",
};

const shadows = {
    /** Subtle card lift */
    card: "shadow-card",
    /** Elevated hover state */
    cardHover: "shadow-card-hover",
    /** Brand blue glow */
    brand: "shadow-brand",
    none: "shadow-none",
};

const typography = {
    heading: "text-xl font-semibold",
    subheading: "text-base font-medium",
    label: "text-sm font-medium",
    body: "text-sm",
    caption: "text-xs",
    mono: "font-mono text-sm",
    /** Platform-grade headline */
    display: "text-2xl font-bold tracking-tight",
};

const transitions = {
    base: "transition-colors duration-150",
    all: "transition-all duration-150",
    slow: "transition-all duration-250",
};

// ── Assembled Token Object ─────────────────────────────────────────────────

export const tokens = {
    // v2.0 canonical names (plural)
    colors,
    spacing,
    radius,
    shadows,
    typography,
    transitions,

    // v1.0 backwards-compat aliases (deprecated — migrate to plural form)
    /** @deprecated Use tokens.colors */
    color: colors,
    /** @deprecated Use tokens.shadows */
    shadow: shadows,
    /** @deprecated Use tokens.typography */
    text: typography,
    /** @deprecated Use tokens.transitions */
    transition: transitions,
};

// ── Status Token Map ───────────────────────────────────────────────────────
export const STATUS_TOKENS = {
    active: {
        label: "ACTIVE",
        bg: "rgba(34,197,94,0.15)",
        color: "#22c55e",
        border: "rgba(34,197,94,0.3)",
        tw: "bg-success-bg text-success border border-success-border",
    },
    draft: {
        label: "DRAFT",
        bg: "rgba(245,158,11,0.15)",
        color: "#f59e0b",
        border: "rgba(245,158,11,0.3)",
        tw: "bg-warning-bg text-warning border border-warning-border",
    },
    deprecated: {
        label: "DEPRECATED",
        bg: "rgba(100,116,139,0.15)",
        color: "#64748b",
        border: "rgba(100,116,139,0.3)",
        tw: "bg-surface-strong text-text-muted border border-border",
    },
    published: {
        label: "PUBLISHED",
        bg: "rgba(99,102,241,0.15)",
        color: "#818cf8",
        border: "rgba(99,102,241,0.3)",
        tw: "bg-brand-primary-lt text-brand-accent border border-brand-border",
    },
    archived: {
        label: "ARCHIVED",
        bg: "rgba(100,116,139,0.15)",
        color: "#64748b",
        border: "rgba(100,116,139,0.3)",
        tw: "bg-surface-strong text-text-muted border border-border",
    },
    inactive: {
        label: "INACTIVE",
        bg: "rgba(100,116,139,0.12)",
        color: "#475569",
        border: "rgba(100,116,139,0.2)",
        tw: "bg-surface-strong text-text-secondary border border-border",
    },
};

// ── Visibility Token Map ───────────────────────────────────────────────────
export const VISIBILITY_TOKENS = {
    public: {
        label: "Public",
        bg: "rgba(59,130,246,0.15)",
        color: "#60a5fa",
        border: "rgba(59,130,246,0.25)",
    },
    sales: {
        label: "Sales",
        bg: "rgba(139,92,246,0.15)",
        color: "#a78bfa",
        border: "rgba(139,92,246,0.25)",
    },
    internal: {
        label: "Internal",
        bg: "rgba(71,85,105,0.15)",
        color: "#64748b",
        border: "rgba(71,85,105,0.25)",
    },
};
