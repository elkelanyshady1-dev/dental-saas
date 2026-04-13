/**
 * PageLoader.jsx — Dynamic Page Component Resolver
 *
 * Part 3 of the Auto UI Engine (v1.0)
 *
 * Resolves page component names from uiEngine.js ROUTES to actual React
 * components. Pages are registered via the static page index, which Vite
 * can tree-shake and code-split at build time.
 *
 * ALL pages that should be loadable by the UI engine MUST be registered in:
 *   src/pages/org/index.js
 *
 * DESIGN RATIONALE:
 *   Using a static import map (rather than dynamic import()) allows Vite to
 *   statically analyze chunks. Dynamic import() is supported as an upgrade
 *   path — see lazy loading note below.
 *
 * PLANE: Org Plane only
 */
import * as OrgPages from "@/pages/org";

/**
 * loadPage — Resolves a page name string to a React component.
 *
 * @param {string} pageName — Component name as registered in pages/org/index.js
 * @returns {React.ComponentType} — The page component, or a NotFound fallback
 */
export function loadPage(pageName) {
    const Page = OrgPages[pageName];

    if (!Page) {
        // Return a fallback component — never throw (keeps router stable)
        const Missing = () => (
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                flexDirection: "column",
                gap: "12px",
                color: "#94a3b8",
                fontFamily: "system-ui, sans-serif",
            }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#ef4444" }}>
                    ⚠️ Page not found in page registry
                </div>
                <div style={{ fontSize: "12px", opacity: 0.7 }}>
                    {`"${pageName}" is not registered in src/pages/org/index.js`}
                </div>
                <div style={{ fontSize: "11px", opacity: 0.5 }}>
                    Run: npm run generate:ui  to regenerate the UI engine
                </div>
            </div>
        );
        Missing.displayName = `MissingPage_${pageName}`;
        return Missing;
    }

    return Page;
}
