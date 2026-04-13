/**
 * Button.jsx
 * Platform UI Primitive — Standardized Action Buttons
 *
 * Replaces:
 *   platformTheme.primaryButton / secondaryButton / dangerButton
 *   All ad-hoc button className strings across pages
 *
 * Variants: primary | secondary | danger | ghost | warning | success
 * Sizes:    sm | md | lg
 */
import { Loader2 } from "lucide-react";

const VARIANT_CLS = {
    primary: "bg-brand-primary text-white hover:bg-brand-hover border border-brand-primary shadow-sm disabled:opacity-50",
    secondary: "bg-card text-brand-primary border border-brand-border hover:bg-brand-primary-lt shadow-sm disabled:opacity-50",
    danger: "bg-card text-danger border border-danger-border hover:bg-danger-bg disabled:opacity-50",
    warning: "bg-card text-warning border border-warning-border hover:bg-warning-bg disabled:opacity-50",
    success: "bg-card text-success border border-success-border hover:bg-success-bg disabled:opacity-50",
    ghost: "bg-transparent text-text-muted border border-transparent hover:text-text-body hover:bg-surface-subtle disabled:opacity-50",
};

const SIZE_CLS = {
    sm: "px-3 py-1.5 text-xs font-semibold rounded-lg gap-1.5",
    md: "px-4 py-2.5 text-sm font-semibold rounded-xl gap-2",
    lg: "px-6 py-3 text-sm font-bold rounded-xl gap-2.5",
};

export default function Button({
    children,
    variant = "primary",
    size = "md",
    loading = false,
    icon: Icon,
    onClick,
    disabled,
    type = "button",
    className = "",
    title,
}) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled || loading}
            title={title}
            className={`
                inline-flex items-center justify-center
                transition-all duration-200 active:scale-95
                disabled:cursor-not-allowed
                ${VARIANT_CLS[variant] || VARIANT_CLS.primary}
                ${SIZE_CLS[size] || SIZE_CLS.md}
                ${className}
            `}
        >
            {loading
                ? <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                : Icon && <Icon className="w-4 h-4 shrink-0" />
            }
            {children}
        </button>
    );
}
