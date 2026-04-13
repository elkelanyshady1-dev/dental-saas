/**
 * platformTheme.js
 * v2.0 — Design Token Migration
 *
 * Centralized design tokens for the platform governance UI.
 * Ensures visual consistency and eliminates style duplication.
 *
 * v2.0: All raw Tailwind color classes replaced with semantic design tokens
 * defined in tailwind.config.cjs. No visual changes — token values are
 * 1:1 aliases to the same colour hex values.
 *
 * Token → raw class mapping:
 *   bg-brand-primary     = bg-blue-600
 *   bg-brand-hover       = bg-blue-700
 *   bg-brand-primary-lt  = bg-blue-50
 *   border-brand-border  = border-blue-100/200
 *   text-brand-primary   = text-blue-600
 *   text-text-muted      = text-slate-500
 *   hover:text-text-body = hover:text-slate-800
 */

export const platformTheme = {
    // Action Buttons — use semantic brand tokens
    primaryButton: "bg-brand-primary text-white hover:bg-brand-hover shadow-md active:scale-95 transition-all",
    secondaryButton: "bg-card text-brand-primary border border-brand-border hover:bg-brand-primary-lt shadow-sm transition-all",
    dangerButton: "bg-danger-bg text-danger border border-danger-border hover:bg-red-100 transition-all",
    successButton: "bg-success-bg text-success border border-success-border hover:bg-emerald-100 transition-all",

    // Ghost/Minimal Buttons
    ghostButton: "text-text-muted hover:text-text-body transition-colors",

    // Tab Bar
    tabActive: "border-b-2 border-brand-primary text-brand-primary",
    tabInactive: "text-text-muted hover:text-text-body",

    // Accents
    textPrimary: "text-brand-primary",
    bgPrimaryLight: "bg-brand-primary-lt",
    borderPrimaryLight: "border-brand-border",

    // Action Sizes (layout only — no color tokens needed)
    buttonSm: "px-3 py-1.5 text-xs font-bold rounded-lg",
    buttonMd: "px-5 py-2.5 text-sm font-bold rounded-xl",
    buttonLg: "px-8 py-3 text-sm font-black uppercase tracking-widest rounded-2xl",
};
