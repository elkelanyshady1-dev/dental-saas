/**
 * Button.jsx — Governed Interactive Button
 *
 * All platform action buttons must use this component.
 * Enforces brand tokens, focus states, and disabled styling.
 *
 * Usage:
 *   <Button>Save</Button>
 *   <Button variant="outline" size="sm">Cancel</Button>
 *   <Button variant="danger" loading>Deleting...</Button>
 *   <Button variant="success">Publish</Button>
 */
import React from "react";

const BASE = [
    "inline-flex items-center justify-center gap-2",
    "font-medium rounded-btn",
    "transition-colors duration-150",
    "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary",
    "disabled:opacity-50 disabled:cursor-not-allowed",
].join(" ");

const VARIANTS = {
    primary: "bg-brand-primary hover:bg-brand-hover text-white focus:ring-brand-primary",
    outline: "border border-border bg-transparent hover:bg-surface-subtle text-text-primary",
    ghost: "bg-transparent hover:bg-surface-subtle text-text-secondary hover:text-text-primary",
    danger: "bg-danger hover:bg-danger-text text-white focus:ring-danger",
    success: "bg-success hover:bg-success-text text-white focus:ring-success",
    warning: "bg-warning hover:bg-warning-text text-white focus:ring-warning",
    accent: "bg-brand-accent hover:opacity-90 text-white",
};

const SIZES = {
    xs: "text-xs px-2 py-1",
    sm: "text-sm px-3 py-1.5",
    md: "text-sm px-4 py-2",     // default
    lg: "text-base px-5 py-2.5",
    xl: "text-base px-6 py-3",
};

export function Button({
    children,
    variant = "primary",
    size = "md",
    loading = false,
    disabled = false,
    className = "",
    type = "button",
    ...rest
}) {
    const variantClass = VARIANTS[variant] ?? VARIANTS.primary;
    const sizeClass = SIZES[size] ?? SIZES.md;

    return (
        <button
            type={type}
            disabled={disabled || loading}
            className={[BASE, variantClass, sizeClass, className].filter(Boolean).join(" ")}
            {...rest}
        >
            {loading && (
                <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
            )}
            {children}
        </button>
    );
}

export default Button;
