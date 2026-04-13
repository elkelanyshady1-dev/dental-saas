/**
 * AutoRouter.jsx — UI Engine Auto Router (v1.0)
 *
 * Part 4 of the Auto UI Engine.
 *
 * Generates all org-plane <Route> elements from the auto-generated ROUTES
 * constant. This is the DROP-IN replacement for manual route declarations.
 *
 * ARCHITECTURE:
 *   ROUTES (uiEngine.js)
 *     ↓
 *   AutoRouter generates Routes + OrgPermissionGuard per route
 *     ↓
 *   PageLoader resolves page name → component
 *     ↓
 *   OrgPermissionGuard enforces RBAC + plan entitlement
 *
 * ZERO-TRUST RULES:
 *   ❌ No manual <Route> outside this component for auto-generated routes
 *   ✅ All routes derive from uiEngine.js (backend-generated)
 *   ✅ All routes protected by OrgPermissionGuard
 *   ✅ PatientLayout nested routes are handled explicitly below
 *
 * IMPORTANT: This component handles ONLY the auto-wired routes from the
 * UI Engine. Special-case nested tab routes (PatientLayout children) are
 * still handled in App.jsx since they require outlet nesting.
 *
 * PLANE: Org Plane only
 */
import { Routes, Route } from "react-router-dom";
import { ROUTES } from "@/generated/uiEngine";
import { loadPage } from "./PageLoader";
import OrgPermissionGuard from "./OrgPermissionGuard";

/**
 * AutoRouter — mounts all org-plane routes from the generated ROUTES map.
 *
 * Must be rendered inside:
 *   - BrowserRouter
 *   - OrgShell (AuthProvider, FeatureProvider, CapabilityProvider)
 *   - ProtectedRoute (auth check)
 *   - OrgLayout (sidebar shell)
 *
 * Usage in App.jsx (inside the /org Route):
 *   <Route path="/org" element={<ProtectedRoute><OrgLayout /></ProtectedRoute>}>
 *     <AutoRouter />        ← replaces manual route list
 *     {patientLayoutRoutes} ← keep nested tab routes separately
 *   </Route>
 */
export default function AutoRouter() {
    return (
        <>
            {ROUTES.map((route) => {
                const Page = loadPage(route.page);

                return (
                    <Route
                        key={route.path}
                        path={route.path}
                        element={
                            <OrgPermissionGuard
                                permission={route.permission}
                                module={route.module}
                                featureGated={route.featureGated ?? false}
                            >
                                <Page />
                            </OrgPermissionGuard>
                        }
                    />
                );
            })}
        </>
    );
}
