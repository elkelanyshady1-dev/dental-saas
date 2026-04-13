/**
 * useTokens.js — Design Token Access Hook
 *
 * Provides all design system tokens via a single hook.
 * Avoids repeated direct imports of tokens.js across every component.
 *
 * Usage:
 *   import { useTokens } from "@/design-system";
 *
 *   function MyComponent() {
 *     const { colors, spacing, radius, shadows, typography } = useTokens();
 *     return <div className={colors.surface}>...</div>;
 *   }
 *
 * Note: tokens are static constants — this hook does NOT cause re-renders.
 * It is a pure convenience wrapper with no state, not a traditional hook.
 */
import { tokens, STATUS_TOKENS, VISIBILITY_TOKENS } from "./tokens";

/**
 * Returns the full token set and semantic token maps.
 *
 * @returns {{
 *   colors:           typeof tokens.colors,
 *   spacing:          typeof tokens.spacing,
 *   radius:           typeof tokens.radius,
 *   shadows:          typeof tokens.shadows,
 *   typography:       typeof tokens.typography,
 *   transitions:      typeof tokens.transitions,
 *   statusTokens:     typeof STATUS_TOKENS,
 *   visibilityTokens: typeof VISIBILITY_TOKENS,
 *   tokens:           typeof tokens,
 * }}
 */
export function useTokens() {
    return {
        // Named groups (canonical v2.0)
        colors: tokens.colors,
        spacing: tokens.spacing,
        radius: tokens.radius,
        shadows: tokens.shadows,
        typography: tokens.typography,
        transitions: tokens.transitions,

        // Semantic maps
        statusTokens: STATUS_TOKENS,
        visibilityTokens: VISIBILITY_TOKENS,

        // Full token object (escape hatch)
        tokens,
    };
}

export default useTokens;
