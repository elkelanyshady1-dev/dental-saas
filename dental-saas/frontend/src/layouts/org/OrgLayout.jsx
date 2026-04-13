/**
 * OrgLayout (Design System v4.0 — Light Theme)
 *
 * Structure:
 *   flex h-screen
 *   ├── Sidebar  (persistent left rail, w-20 md:w-64)
 *   └── main div (flex-1, flex-col)
 *       ├── OrgHeader  (sticky, z-50)
 *       └── <Outlet /> (scrollable content)
 *
 * Changes from v2.2:
 *   - Removed OrgGlobalActionBar (quick actions now live in Dashboard)
 *   - Layout uses new light design system spacing
 *   - Header is now self-contained (sticky within the right column, not fixed)
 *   - All keyboard shortcuts + profile guard logic is FULLY PRESERVED
 */
import { useState, useEffect } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import LayoutContainer from "@/design-system/LayoutContainer";
import Sidebar from "@/design-system/Sidebar";
import OrgHeader from "./OrgHeader";
import { useDashboardAction } from "@/hooks/useDashboardAction";
import { OrgBrandingProvider, useOrgBranding } from "@/context/OrgBrandingContext";
import { OrgTimeProvider } from "@/context/OrgTimeContext";
import { useAuth } from "@/context/AuthContext";

export default function OrgLayout() {
    return (
        <OrgBrandingProvider>
            <OrgTimeProvider>
                <OrgLayoutInner />
            </OrgTimeProvider>
        </OrgBrandingProvider>
    );
}

function OrgLayoutInner() {
    const navigate = useNavigate();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const { executeAction } = useDashboardAction();
    const { fetchProfile } = useOrgBranding();
    const { user } = useAuth();

    // ── Phase 4: Profile completion guard ─────────────────────────────────
    useEffect(() => {
        if (user && user.profile?.isComplete === false) {
            navigate("/complete-profile", { replace: true });
        }
    }, [user, navigate]);

    // Fetch org branding once on layout mount
    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    // Keyboard shortcuts (⌘/Ctrl + key)
    useEffect(() => {
        const handler = (e) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
            if (!(e.metaKey || e.ctrlKey)) return;
            switch (e.key.toLowerCase()) {
                case 'p': e.preventDefault(); navigate("/org/patients/new"); break;
                case 'a': e.preventDefault(); executeAction("add_appointment"); break;
                case 't': e.preventDefault(); executeAction("add_treatment"); break;
                case 's': e.preventDefault(); executeAction("send_sms"); break;
                default: break;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [executeAction, navigate]);

    return (
        <LayoutContainer>
            <div className="flex h-screen overflow-hidden bg-slate-50">

                {/* ── Sidebar (persistent left rail) ── */}
                <Sidebar
                    isOpen={isSidebarOpen}
                    onClose={() => setIsSidebarOpen(false)}
                />

                {/* ── Right column: header + content ── */}
                <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

                    {/* Sticky Header */}
                    <OrgHeader onMenuClick={() => setIsSidebarOpen(true)} />

                    {/* Scrollable Page Content */}
                    <main className="flex-1 overflow-y-auto">
                        <Outlet />
                    </main>
                </div>
            </div>
        </LayoutContainer>
    );
}
