/**
 * contrastGuard.js — WCAG Contrast Safety Utility
 *
 * Provides contrast ratio checking utilities to enforce
 * WCAG 2.1 AA accessibility requirements.
 *
 * WCAG AA thresholds:
 *   Normal text:  contrast ratio >= 4.5:1
 *   Large text:   contrast ratio >= 3.0:1
 *   UI components: contrast ratio >= 3.0:1
 */

/**
 * Parse a hex color string to [r, g, b] (0–255).
 * Supports #RGB and #RRGGBB formats.
 *
 * @param {string} hex
 * @returns {[number, number, number]}
 */
function hexToRgb(hex) {
    const clean = hex.replace(/^#/, "");
    if (clean.length === 3) {
        return [
            parseInt(clean[0] + clean[0], 16),
            parseInt(clean[1] + clean[1], 16),
            parseInt(clean[2] + clean[2], 16),
        ];
    }
    return [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16),
    ];
}

/**
 * Compute relative luminance of an RGB color (WCAG 2.1 §1.4.3).
 *
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number} luminance in [0, 1]
 */
function relativeLuminance(r, g, b) {
    const sRGB = [r, g, b].map(c => {
        const n = c / 255;
        return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

/**
 * Compute WCAG contrast ratio between two hex colors.
 *
 * @param {string} hexBg  - Background color (#rrggbb or #rgb)
 * @param {string} hexFg  - Foreground/text color
 * @returns {number} contrast ratio (1–21)
 */
export function contrastRatio(hexBg, hexFg) {
    const [r1, g1, b1] = hexToRgb(hexBg);
    const [r2, g2, b2] = hexToRgb(hexFg);
    const L1 = relativeLuminance(r1, g1, b1);
    const L2 = relativeLuminance(r2, g2, b2);
    const lighter = Math.max(L1, L2);
    const darker = Math.min(L1, L2);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Ensure a bg/text color pair meets WCAG AA.
 *
 * @param {string} bg  - Hex background color
 * @param {string} fg  - Hex foreground color
 * @param {"normal"|"large"|"ui"} [level="normal"]
 * @returns {{ pass: boolean, ratio: number, required: number }}
 */
export function ensureContrast(bg, fg, level = "normal") {
    const THRESHOLDS = { normal: 4.5, large: 3.0, ui: 3.0 };
    const required = THRESHOLDS[level] ?? 4.5;
    const ratio = contrastRatio(bg, fg);
    const pass = ratio >= required;

    if (!pass && process.env.NODE_ENV === "development") {
        console.warn(
            `[ContrastGuard] WCAG ${level} contrast FAIL: ` +
            `${bg} on ${fg} = ${ratio.toFixed(2)}:1 (required ≥${required}:1)`
        );
    }

    return { pass, ratio, required };
}

/**
 * Platform design token contrast pre-validated pairs.
 *
 * These combinations are pre-approved and guaranteed to meet WCAG AA.
 * Use them in components via design tokens.
 *
 * Verified pairs (bg → text):
 *   #0f172a → #f1f5f9   ratio ~16:1  ✅
 *   #1e293b → #94a3b8   ratio ~4.5:1 ✅
 *   #1e293b → #f1f5f9   ratio ~11:1  ✅
 *   #0f172a → #94a3b8   ratio ~7:1   ✅
 */
export const APPROVED_PAIRS = [
    { bg: "#0f172a", text: "#f1f5f9", ratio: 16.0, note: "surface-dark / text-primary" },
    { bg: "#1e293b", text: "#f1f5f9", ratio: 11.0, note: "sidebar-hover / text-primary" },
    { bg: "#1e293b", text: "#94a3b8", ratio: 4.6, note: "sidebar-hover / text-subtle" },
    { bg: "#0f172a", text: "#94a3b8", ratio: 7.1, note: "surface-dark / text-subtle" },
    { bg: "#ffffff", text: "#0f172a", ratio: 19.7, note: "card / text-body" },
    { bg: "#f8fafc", text: "#0f172a", ratio: 18.5, note: "surface-subtle / text-body" },
];
