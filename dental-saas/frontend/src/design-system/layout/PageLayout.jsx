/**
 * PageLayout.jsx — Top-Level Page Wrapper Primitive
 *
 * Every platform page must be wrapped in PageLayout.
 * Provides consistent horizontal padding and vertical rhythm.
 * By default renders full-width (no max-width constraint).
 *
 * Usage:
 *   <PageLayout>
 *     <Section>...</Section>
 *   </PageLayout>
 *
 *   <PageLayout maxWidth="xl" padding="sm">
 *     {children}
 *   </PageLayout>
 */
import React from "react";

const MAX_WIDTHS = {
    sm:   "max-w-2xl",
    md:   "max-w-4xl",
    lg:   "max-w-6xl",
    xl:   "max-w-7xl",
    "2xl":"max-w-[1400px]",
    full: "",              // no constraint — true fluid width
};

const PADDINGS = {
    none: "",
    sm:   "px-3 py-3",
    md:   "px-4 xl:px-6 py-4",          // default — responsive
    lg:   "px-6 xl:px-8 py-6",
};

export function PageLayout({
    children,
    maxWidth = "full",          // default: full width (was "2xl")
    padding = "md",             // default: compact responsive (was "lg")
    className = "",
}) {
    const mw  = MAX_WIDTHS[maxWidth] ?? "";
    const pad = PADDINGS[padding] ?? PADDINGS.md;
    // Only use mx-auto when a max-width is actually set
    const center = mw ? "mx-auto" : "";

    return (
        <div className={["w-full", center, mw, pad, className].filter(Boolean).join(" ")}>
            {children}
        </div>
    );
}

export default PageLayout;
