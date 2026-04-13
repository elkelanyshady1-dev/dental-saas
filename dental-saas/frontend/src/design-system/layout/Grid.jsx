/**
 * Grid.jsx — Responsive Grid Layout Primitive
 *
 * CSS Grid wrapper with named column and gap tokens.
 * Replaces raw <div className="grid grid-cols-3 gap-4"> patterns.
 *
 * Usage:
 *   <Grid cols={3}>
 *     <StatCard ... />
 *     <StatCard ... />
 *     <StatCard ... />
 *   </Grid>
 *
 *   <Grid cols={{ base: 1, md: 2, lg: 4 }} gap="lg">
 *     ...
 *   </Grid>
 *
 *   <Grid auto="fit" minColWidth="160px" gap="md">
 *     ...
 *   </Grid>
 */
import React from "react";

// Named gap scale (mirrors Stack)
const GAP = {
    none: "gap-0",
    xs: "gap-1",
    sm: "gap-2",
    md: "gap-4",    // default
    lg: "gap-6",
    xl: "gap-8",
    "2xl": "gap-12",
};

// Static column presets
const COLS = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
    12: "grid-cols-12",
};

// Responsive column string builder
// e.g. { base: 1, md: 2, lg: 4 } → "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
function responsiveCols(cols) {
    if (typeof cols === "number") return COLS[cols] ?? "grid-cols-1";
    if (typeof cols === "object") {
        return Object.entries(cols)
            .map(([bp, n]) => bp === "base" ? (COLS[n] ?? "grid-cols-1") : `${bp}:${COLS[n] ?? "grid-cols-1"}`)
            .join(" ");
    }
    return "grid-cols-1";
}

export function Grid({
    children,
    cols = 1,
    gap = "md",
    auto,          // "fit" | "fill" — enables auto-fit/fill
    minColWidth,   // e.g. "160px" — used with auto
    className = "",
    as: Tag = "div",
    ...rest
}) {
    const gapClass = GAP[gap] ?? GAP.md;

    // Auto-fit/fill overrides static cols
    const colClass = auto && minColWidth
        ? undefined
        : responsiveCols(cols);

    const autoStyle = auto && minColWidth
        ? { gridTemplateColumns: `repeat(auto-${auto}, minmax(${minColWidth}, 1fr))` }
        : undefined;

    return (
        <Tag
            className={["grid", colClass, gapClass, className].filter(Boolean).join(" ")}
            style={autoStyle}
            {...rest}
        >
            {children}
        </Tag>
    );
}

export default Grid;
