/**
 * Badge.jsx — Governed Status/Label Badge
 *
 * Renders a colored pill badge using the design token status map.
 *
 * Usage:
 *   <Badge status="active" />
 *   <Badge status="deprecated" />
 *   <Badge variant="info">Custom Label</Badge>
 *   <Badge variant="success" size="sm">Published</Badge>
 */
import React from "react";
import { STATUS_TOKENS } from "../tokens";

const BASE = [
    "inline-flex items-center gap-1",
    "px-2.5 py-0.5 rounded-pill",
    "text-xs font-semibold uppercase tracking-wide",
    "border",
].join(" ");

// Variant → Tailwind token classes (for non-status usage)
const VARIANT_CLASSES = {
    default: "bg-surface-strong text-text-muted border-border",
    info: "bg-info-bg text-info border-info-border",
    success: "bg-success-bg text-success-text border-success-border",
    warning: "bg-warning-bg text-warning-text border-warning-border",
    danger: "bg-danger-bg text-danger-text border-danger-border",
    brand: "bg-brand-primary-lt text-brand-accent border-brand-border",
};

export function Badge({
    children,
    status,        // "active" | "draft" | "deprecated" | "published" | "archived"
    variant,       // "info" | "success" | "warning" | "danger" | "brand" | "default"
    size = "md",
    className = "",
    style: extraStyle,
}) {
    // Status token takes priority over variant
    if (status) {
        const cfg = STATUS_TOKENS[status] || STATUS_TOKENS.archived;
        return (
            <span
                className={[BASE, className, size === "sm" ? "text-[0.65rem]" : ""].filter(Boolean).join(" ")}
                style={{
                    background: cfg.bg,
                    color: cfg.color,
                    border: `1px solid ${cfg.border}`,
                    ...extraStyle,
                }}
            >
                {children ?? cfg.label}
            </span>
        );
    }

    // Variant-based (Tailwind token classes)
    const variantClass = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.default;
    return (
        <span
            className={[
                BASE,
                variantClass,
                size === "sm" ? "text-[0.65rem] px-1.5 py-0" : "",
                className,
            ].filter(Boolean).join(" ")}
            style={extraStyle}
        >
            {children}
        </span>
    );
}

export default Badge;
