/**
 * Card.jsx — Governed Surface Container
 *
 * The primary card surface. All platform dashboard panels,
 * list items, and form sections should use this component.
 *
 * Usage:
 *   <Card>content</Card>
 *   <Card padding="lg" hover>content</Card>
 *   <Card variant="dark">content</Card>
 */
import React from "react";
import { tokens } from "../tokens";

const VARIANTS = {
    // Light card (default) — used on light-mode pages
    default: `bg-card border border-border ${tokens.radius.card} ${tokens.shadow.card} ${tokens.spacing.cardPadding}`,

    // Dark card — used inside the dark platform shell
    dark: [
        "border rounded-xl p-5",
        "backdrop-blur-md",
    ].join(" "),

    // Subtle ghost — borderless, lightest surface
    ghost: `bg-surface-subtle ${tokens.radius.card} ${tokens.spacing.cardPadding}`,
};

const PADDING = {
    sm: "p-3",
    md: "p-5",    // default
    lg: "p-6",
    xl: "p-8",
    none: "p-0",
};

export function Card({
    children,
    variant = "default",
    padding,
    hover = false,
    className = "",
    style,
    ...rest
}) {
    const base = VARIANTS[variant] ?? VARIANTS.default;
    const padClass = padding ? PADDING[padding] ?? "" : "";
    // Replace the default padding if explicit `padding` prop provided
    const resolved = padding
        ? base.replace(/\bp-\d+\b/, padClass)
        : base;

    const hoverClass = hover ? `${tokens.transition.base} hover:shadow-card-hover hover:-translate-y-0.5` : "";

    return (
        <div
            className={[resolved, hoverClass, className].filter(Boolean).join(" ")}
            style={style}
            {...rest}
        >
            {children}
        </div>
    );
}

export default Card;
