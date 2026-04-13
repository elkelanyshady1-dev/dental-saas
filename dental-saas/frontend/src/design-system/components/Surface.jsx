/**
 * Surface.jsx — Governed Generic Surface Container
 *
 * A flexible container for panels, sections, and content blocks
 * that need the standard dark platform glass-morphism treatment.
 *
 * Usage:
 *   <Surface>...</Surface>
 *   <Surface depth="deep" rounded="xl" shadow>...</Surface>
 *   <Surface border={false}>...</Surface>
 */
import React from "react";

const DEPTH = {
    default: { background: "rgba(22,32,52,0.92)", border: "rgba(71,85,105,0.6)" },
    deep: { background: "rgba(15,23,42,0.95)", border: "rgba(51,65,85,0.6)" },
    shallow: { background: "rgba(30,41,59,0.92)", border: "rgba(99,102,241,0.22)" },
    light: { background: "rgba(248,250,252,1)", border: "rgba(226,232,240,1)" },
};

export function Surface({
    children,
    depth = "default",
    rounded = "xl",
    border = true,
    shadow = true,
    padding = "1.25rem",
    className = "",
    style,
    ...rest
}) {
    const cfg = DEPTH[depth] ?? DEPTH.default;

    return (
        <div
            className={[`rounded-${rounded}`, "backdrop-blur-md overflow-hidden", className].filter(Boolean).join(" ")}
            style={{
                background: cfg.background,
                border: border ? `1px solid ${cfg.border}` : "none",
                boxShadow: shadow ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
                padding,
                ...style,
            }}
            {...rest}
        >
            {children}
        </div>
    );
}

export default Surface;
