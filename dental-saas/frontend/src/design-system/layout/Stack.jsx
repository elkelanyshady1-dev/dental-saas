/**
 * Stack.jsx — Vertical/Horizontal Spacing Primitive
 *
 * Applies consistent gap between children using a named spacing scale.
 * The primary replacement for raw <div className="flex gap-4"> patterns.
 *
 * Usage:
 *   <Stack>           — vertical stack, gap md (16px)
 *     <Card />
 *     <Card />
 *   </Stack>
 *
 *   <Stack direction="row" gap="sm">
 *     <Button />
 *     <Button variant="outline" />
 *   </Stack>
 *
 *   <Stack gap="lg" align="center">
 *     ...
 *   </Stack>
 */
import React from "react";

// Named gap scale → Tailwind gap class
const GAP = {
    none: "gap-0",
    xs: "gap-1",    // 4px
    sm: "gap-2",    // 8px
    md: "gap-4",    // 16px  ← default
    lg: "gap-6",    // 24px
    xl: "gap-8",    // 32px
    "2xl": "gap-12",  // 48px
};

const ALIGN = {
    start: "items-start",
    center: "items-center",
    end: "items-end",
    stretch: "items-stretch",   // default
    baseline: "items-baseline",
};

const JUSTIFY = {
    start: "justify-start",
    center: "justify-center",
    end: "justify-end",
    between: "justify-between",
    around: "justify-around",
};

export function Stack({
    children,
    direction = "col",      // "col" | "row"
    gap = "md",
    align,
    justify,
    wrap = false,
    className = "",
    as: Tag = "div",
    ...rest
}) {
    const flexDir = direction === "row" ? "flex-row" : "flex-col";
    const gapClass = GAP[gap] ?? GAP.md;
    const alignCls = align ? (ALIGN[align] ?? "") : "";
    const justCls = justify ? (JUSTIFY[justify] ?? "") : "";
    const wrapCls = wrap ? "flex-wrap" : "";

    return (
        <Tag
            className={[
                "flex",
                flexDir,
                gapClass,
                alignCls,
                justCls,
                wrapCls,
                className,
            ].filter(Boolean).join(" ")}
            {...rest}
        >
            {children}
        </Tag>
    );
}

export default Stack;
