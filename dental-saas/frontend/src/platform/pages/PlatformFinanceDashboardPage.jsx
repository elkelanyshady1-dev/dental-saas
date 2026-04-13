/**
 * PlatformFinanceDashboardPage.jsx
 * Platform Finance — Finance Dashboard Page
 *
 * Full-page wrapper around FinanceDashboardWidget.
 * Route: /platform/finance (registered via FINANCE_DASHBOARD in platformFeatureRegistry)
 *
 * Capability gate: VIEW_PLATFORM_ANALYTICS
 */

import React from "react";
import { TrendingUp } from "lucide-react";
import FinanceDashboardWidget from "../modules/billing/FinanceDashboardWidget";
import { usePlatformCapabilities } from "../hooks/usePlatformCapabilities";
import PlatformUnauthorized from "../core/components/PlatformUnauthorized";

export default function PlatformFinanceDashboardPage() {
    const { hasCapability, loading } = usePlatformCapabilities();

    if (loading) return null;
    if (!hasCapability("VIEW_PLATFORM_ANALYTICS")) {
        return <PlatformUnauthorized capability="VIEW_PLATFORM_ANALYTICS" />;
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6 px-4 py-6" id="finance-dashboard-page">
            {/* Page header */}
            <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-700">
                    <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                    <h1 className="text-xl font-black text-slate-900 tracking-tight">Finance Dashboard</h1>
                    <p className="text-sm text-slate-500 font-medium">MRR, ARR, revenue recognition, and renewal pipeline</p>
                </div>
            </div>

            {/* Widget */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <FinanceDashboardWidget />
            </div>
        </div>
    );
}
