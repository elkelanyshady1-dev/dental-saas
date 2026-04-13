/**
 * Card.jsx
 * Platform UI Primitive — Surface Card
 *
 * Standard card surface. Replaces all ad-hoc:
 *   bg-white rounded-2xl shadow-sm border border-blue-100
 *
 * Variants:
 *   default   — white surface with subtle blue border
 *   muted     — soft gray surface (for secondary panels)
 *   danger    — red-tinted surface for error states
 *   success   — green-tinted surface
 *   warning   — amber-tinted surface
 *
 * Usage:
 *   <Card>content</Card>
 *   <Card variant="danger">error content</Card>
 *   <Card padding="none">full-bleed content</Card>
 */

const VARIANTS = {
    default: "bg-card border border-subtle shadow-sm hover:shadow-md hover:border-border",
    muted: "bg-surface-subtle border border-border shadow-sm",
    danger: "bg-red-50 border border-red-200",
    success: "bg-emerald-50 border border-emerald-200",
    warning: "bg-amber-50 border border-amber-200",
};

const PADDING = {
    default: "p-6",
    sm: "p-4",
    lg: "p-8",
    none: "",
};

export default function Card({
    children,
    variant = "default",
    padding = "default",
    className = "",
    ...props
}) {
    return (
        <div
            className={`rounded-2xl transition-all duration-200 ${VARIANTS[variant] || VARIANTS.default} ${PADDING[padding] || PADDING.default} ${className}`}
            {...props}
        >
            {children}
        </div>
    );
}

/**
 * CardHeader — optional header row inside a Card
 * Usage: <Card><CardHeader title="..." action={<button/>} /></Card>
 */
export function CardHeader({ title, subtitle, icon: Icon, action }) {
    return (
        <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
                {Icon && (
                    <div className="p-1.5 rounded-lg bg-brand-primary-lt border border-brand-border">
                        <Icon className="w-4 h-4 text-brand-primary" />
                    </div>
                )}
                <div>
                    <h3 className="text-base font-semibold text-text-body">{title}</h3>
                    {subtitle && <p className="text-xs text-text-subtle mt-0.5">{subtitle}</p>}
                </div>
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}
