/**
 * tokens.js
 * DentalSaaS Design Token System — v1.0
 *
 * Single source of truth for the entire design system.
 * Consumed by:
 *   - tailwind.config.js    → generates Tailwind utility classes
 *   - index.css             → exposes as CSS custom properties (:root)
 *   - Components            → direct JS import for inline style cases
 *
 * Naming convention:
 *   colors.*      → raw hex values
 *   radius.*      → border-radius in px string
 *   shadow.*      → box-shadow string
 *   spacing.*     → spacing in px string
 *   transition.*  → transition shorthand string
 */

// ─── COLOR PALETTE ────────────────────────────────────────────────────────────

const palette = {
    // Brand blues
    blue50: '#eff6ff',
    blue100: '#dbeafe',
    blue200: '#bfdbfe',
    blue400: '#60a5fa',
    blue500: '#3b82f6',
    blue600: '#2563eb',
    blue700: '#1d4ed8',

    // Indigo accent
    indigo400: '#818cf8',
    indigo500: '#6366f1',
    indigo600: '#4f46e5',

    // Neutrals (slate-based)
    white: '#ffffff',
    slate50: '#f8fafc',
    slate100: '#f1f5f9',
    slate200: '#e2e8f0',
    slate300: '#cbd5e1',
    slate400: '#94a3b8',
    slate500: '#64748b',
    slate600: '#475569',
    slate700: '#334155',
    slate800: '#1e293b',
    slate900: '#0f172a',

    // Sidebar darks
    sidebarBg: '#0f172a',
    sidebarHover: '#1e293b',

    // Semantic
    emerald50: '#ecfdf5',
    emerald100: '#d1fae5',
    emerald400: '#34d399',
    emerald500: '#10b981',
    emerald600: '#059669',
    emerald700: '#047857',

    amber50: '#fffbeb',
    amber100: '#fef3c7',
    amber500: '#f59e0b',
    amber600: '#d97706',

    red50: '#fef2f2',
    red100: '#fee2e2',
    red500: '#ef4444',
    red600: '#dc2626',
    red700: '#b91c1c',

    violet50: '#f5f3ff',
    violet500: '#8b5cf6',

    cyan500: '#06b6d4',
};

// ─── SEMANTIC COLOR MAP ───────────────────────────────────────────────────────

export const colors = {
    // Brand
    brandPrimary: palette.blue600,
    brandPrimaryLight: palette.blue50,
    brandPrimaryHover: palette.blue700,
    brandAccent: palette.indigo600,
    brandAccentHover: palette.indigo500,
    brandBorder: palette.blue100,

    // Backgrounds
    background: palette.blue50,
    backgroundGrad: 'linear-gradient(160deg, #eff6ff 0%, #f8fafc 30%, #ffffff 100%)',
    surface: palette.white,
    surfaceSoft: palette.slate50,
    surfaceHover: 'rgba(239, 246, 255, 0.4)',   // blue-50/40

    // Sidebar
    sidebarBg: palette.sidebarBg,
    sidebarHover: palette.sidebarHover,
    sidebarText: palette.slate300,
    sidebarTextMuted: palette.slate500,
    sidebarActive: palette.blue600,
    sidebarBorder: palette.slate800,

    // Typography
    textPrimary: palette.slate900,
    textSecondary: palette.slate600,
    textMuted: palette.slate500,
    textPlaceholder: palette.slate400,
    textDisabled: palette.slate300,

    // Border
    borderDefault: palette.slate200,
    borderSoft: palette.blue100,
    borderFocus: palette.blue400,

    // Status
    successBg: palette.emerald50,
    successText: palette.emerald700,
    successBorder: palette.emerald100,
    successDot: palette.emerald500,

    warningBg: palette.amber50,
    warningText: palette.amber600,
    warningBorder: palette.amber100,

    dangerBg: palette.red50,
    dangerText: palette.red700,
    dangerBorder: palette.red100,
    dangerDot: palette.red500,

    // Accents for events / badges
    eventLogin: { bg: palette.blue50, text: palette.blue600, border: palette.blue100 },
    eventCreate: { bg: palette.emerald50, text: palette.emerald600, border: palette.emerald100 },
    eventUpdate: { bg: palette.amber50, text: palette.amber600, border: palette.amber100 },
    eventDelete: { bg: palette.red50, text: palette.red600, border: palette.red100 },
};

// ─── BORDER RADIUS ────────────────────────────────────────────────────────────

export const radius = {
    sm: '8px',
    md: '12px',   // button
    lg: '16px',   // card
    xl: '20px',   // large card
    full: '9999px', // pill / badge
};

// ─── SHADOWS ─────────────────────────────────────────────────────────────────

export const shadow = {
    xs: '0 1px 2px rgba(0,0,0,0.04)',
    sm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
    md: '0 4px 12px rgba(0,0,0,0.08)',
    lg: '0 8px 24px rgba(0,0,0,0.10)',
    xl: '0 16px 40px rgba(0,0,0,0.12)',
    brand: '0 4px 14px rgba(37,99,235,0.25)',
    inner: 'inset 0 1px 2px rgba(0,0,0,0.05)',
};

// ─── SPACING ─────────────────────────────────────────────────────────────────

export const spacing = {
    px: '1px',
    0: '0px',
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
    '3xl': '64px',
};

// ─── TYPOGRAPHY ──────────────────────────────────────────────────────────────

export const typography = {
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
    sizes: {
        '2xs': '10px',
        xs: '11px',
        sm: '12px',
        base: '14px',
        md: '16px',
        lg: '18px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '30px',
    },
    weights: {
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        black: 900,
    },
    leading: {
        tight: 1.2,
        snug: 1.375,
        normal: 1.5,
        relaxed: 1.625,
    },
};

// ─── TRANSITIONS ─────────────────────────────────────────────────────────────

export const transition = {
    fast: 'all 0.1s ease',
    default: 'all 0.2s ease',
    slow: 'all 0.3s ease',
    bounce: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
};

// ─── COMPOSITE EXPORT ─────────────────────────────────────────────────────────

export const tokens = {
    colors,
    radius,
    shadow,
    spacing,
    typography,
    transition,
};

export default tokens;
