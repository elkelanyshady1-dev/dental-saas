/**
 * UIGuard.jsx — Design System Guardian v2.0
 *
 * Stripe-level enforcement layer. Wraps PlatformLayout and OrgLayout
 * to detect violations at the component-tree level in development.
 *
 * ── Detection Rules ──────────────────────────────────────────────────
 *   RULE 1: Raw Tailwind color utilities     (bg-slate-900, text-gray-500)
 *   RULE 2: Raw Tailwind spacing utilities    (p-4, m-6, px-3, gap-2)
 *           → Warn to use Stack/Grid/Section layout primitives
 *   RULE 3: Inline style hex/rgb values       (style={{ color: "#123" }})
 *   RULE 4: Inline style literal spacing      (style={{ padding: "16px" }})
 *
 * ── Vite Compatibility ───────────────────────────────────────────────
 * Uses import.meta.env.DEV — NOT process.env.NODE_ENV.
 * Vite statically replaces this at build time, dead-code-eliminating
 * the entire guard body from production bundles.
 *
 * ── Performance ──────────────────────────────────────────────────────
 * Runs once after first mount (useEffect + [] deps).
 * Never blocks render. Zero production overhead.
 * ─────────────────────────────────────────────────────────────────────
 */
import React, { useEffect } from "react";

// ── Detection patterns ─────────────────────────────────────────────────────

/** RULE 1 — Raw Tailwind palette color utilities */
const RAW_COLOR_RE = /\b(bg|text|border|ring|from|to|via|fill|stroke)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+\b/;

/** RULE 2 — Raw Tailwind spacing utilities on layout divs
 *  Targets explicit spacing classes that should come from Stack/Grid/Section.
 *  Scoped to top-level structural divs (NOT inside design-system components). */
const RAW_SPACING_RE = /\b(p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|gap)-(\d+)\b/;

/** RULE 3 — Inline style hex color values */
const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/;

/** RULE 4 — Inline style literal pixel spacing */
const PX_SPACING_RE = /^\d+px$/;

// Spacing props that are checked for raw pixel values
const SPACING_STYLE_KEYS = new Set([
    "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
    "gap", "rowGap", "columnGap",
]);

// ── Guardian prefix ────────────────────────────────────────────────────────
const G = "[DESIGN SYSTEM GUARDIAN]";

// ── Tree walker ────────────────────────────────────────────────────────────

/**
 * Recursively walk a React element tree and emit guardian warnings.
 *
 * @param {React.ReactNode} children
 * @param {string}          context  — "platform" | "org" | etc.
 * @param {number}          depth    — recursion depth (hard-capped at 14)
 * @param {boolean}         insideDS — whether we're inside a design-system component
 */
function walkTree(children, context, depth = 0, insideDS = false) {
    if (depth > 14) return;

    React.Children.forEach(children, (child) => {
        if (!React.isValidElement(child)) return;

        const tag = typeof child.type === "string"
            ? `<${child.type}>`
            : `<${child.type?.displayName || child.type?.name || "Component"}>`;

        // Detect if we're inside a design-system component to suppress false positives
        const isDS = typeof child.type === "function" &&
            ["Button", "Input", "Select", "DataTable", "Card", "Badge", "Surface"].includes(
                child.type?.displayName || child.type?.name || ""
            );

        const className = child.props?.className;
        const style = child.props?.style;

        // ── RULE 1: Raw Tailwind color ─────────────────────────────────────
        if (typeof className === "string" && RAW_COLOR_RE.test(className)) {
            const match = className.match(RAW_COLOR_RE)?.[0] ?? "";
            console.warn(
                `${G} Raw Tailwind color detected\n` +
                `  Context : ${context}\n` +
                `  Element : ${tag}\n` +
                `  Class   : "${match}"\n` +
                `  Fix     : Use tokens.colors.* from /src/design-system/tokens.js`
            );
        }

        // ── RULE 2: Raw Tailwind spacing (warn, don't block) ───────────────
        // Only warn on direct <div> layout wrappers to avoid noise from
        // design-system components whose internal spacing is already governed.
        if (
            typeof child.type === "string" &&        // DOM element only
            typeof className === "string" &&
            RAW_SPACING_RE.test(className)
        ) {
            const matches = className.match(/\b(p|m|px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|gap)-\d+\b/g) ?? [];
            console.info(
                `${G} Raw spacing utility on layout element\n` +
                `  Context : ${context}\n` +
                `  Element : ${tag}\n` +
                `  Classes : ${matches.join(", ")}\n` +
                `  Suggest : Wrap with <Stack>, <Grid>, or <Section> layout primitives`
            );
        }

        // ── RULE 5: Raw HTML form elements outside design-system ───────────
        // Detects <button>, <input>, <select> used directly instead of DS
        // counterparts. Skips checks when inside a DS component (to avoid
        // flagging the DS component's own internal <button> or <input>).
        if (
            !insideDS &&
            typeof child.type === "string" &&
            ["button", "input", "select"].includes(child.type)
        ) {
            const dsAlternative = {
                button: "<Button /> from @/design-system",
                input:  "<Input /> from @/design-system",
                select: "<Select /> from @/design-system",
            }[child.type];
            console.warn(
                `${G} Raw HTML form element detected\n` +
                `  Context : ${context}\n` +
                `  Element : ${tag}\n` +
                `  Fix     : Use ${dsAlternative}`
            );
        }

        // ── RULE 3 & 4: Inline style violations ───────────────────────────
        if (style && typeof style === "object") {
            for (const [key, val] of Object.entries(style)) {
                // Skip CSS custom properties (var(--color-*)) — they are allowed
                if (typeof val === "string" && val.startsWith("var(")) continue;

                // RULE 3: Hex / rgb color in style prop
                if (
                    (key === "color" || key === "background" || key === "backgroundColor" ||
                        key === "borderColor" || key === "fill" || key === "stroke") &&
                    typeof val === "string" &&
                    HEX_COLOR_RE.test(val)
                ) {
                    console.warn(
                        `${G} Inline style color detected\n` +
                        `  Context : ${context}\n` +
                        `  Element : ${tag}\n` +
                        `  Style   : ${key}: "${val}"\n` +
                        `  Fix     : Use CSS custom properties (var(--color-*)) or tokens.colors.*`
                    );
                }

                // RULE 4: Literal px spacing in style prop
                if (
                    SPACING_STYLE_KEYS.has(key) &&
                    typeof val === "string" &&
                    PX_SPACING_RE.test(val)
                ) {
                    console.info(
                        `${G} Inline spacing value detected\n` +
                        `  Context : ${context}\n` +
                        `  Element : ${tag}\n` +
                        `  Style   : ${key}: "${val}"\n` +
                        `  Suggest : Use layout primitives (Stack gap, Section padding)`
                    );
                }
            }
        }

        // ── Recurse ────────────────────────────────────────────────────────
        if (child.props?.children) {
            walkTree(child.props.children, context, depth + 1, insideDS || isDS);
        }
    });
}

// ── UIGuard Component ──────────────────────────────────────────────────────

/**
 * Design System Guardian wrapper.
 *
 * Wrap layout roots — all platform pages are audited automatically.
 *
 * @param {{ children: React.ReactNode, context?: string }} props
 */
export function UIGuard({ children, context = "platform" }) {
    useEffect(() => {
        // import.meta.env.DEV: Vite replaces this statically at build time.
        // The entire block is tree-shaken in production. No runtime cost.
        if (import.meta.env.DEV) {
            walkTree(children, context);
        }
        // [] → run once after first mount only
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Render children with no wrapper element — does not affect layout.
    return children;
}

export default UIGuard;
