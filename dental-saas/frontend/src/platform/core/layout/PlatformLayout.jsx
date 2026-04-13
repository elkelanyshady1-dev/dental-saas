/**
 * PlatformLayout.jsx
 * v14.1 TDS Sovereign — Structural Layout Shell
 *
 * Wrapped with UIGuard (design system governance layer).
 * UIGuard is zero-overhead in production and inspects the
 * component tree for token violations in development.
 */
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopCommandBar } from "./TopCommandBar";
import { usePlatformCapabilities } from "../../hooks/usePlatformCapabilities";
import Breadcrumbs from "../components/Breadcrumbs";
import { UIGuard } from "@/design-system/UIGuard";

export function PlatformLayout() {
    const { capabilities, loading: capsLoading } = usePlatformCapabilities();

    return (
        <UIGuard context="platform">
            <div className="min-h-screen flex flex-col font-sans text-text-primary" style={{ background: 'var(--color-bg-grad)' }}>
                {/* Top Bar is always visible, handles user profile/metadata */}
                <TopCommandBar capabilities={capabilities} />

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar is always visible, internal content gating by capabilities */}
                    <Sidebar capabilities={capabilities} loading={capsLoading} />

                    <main className="flex-1 overflow-y-auto">
                        <div className="max-w-[1600px] mx-auto px-8 py-8">
                            {/* Page context breadcrumbs */}
                            <Breadcrumbs />

                            {/* Page content rendered here */}
                            <Outlet />
                        </div>
                    </main>
                </div>
            </div>
        </UIGuard>
    );
}
