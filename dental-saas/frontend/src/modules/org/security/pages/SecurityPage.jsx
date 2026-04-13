/**
 * SecurityPage.jsx — Security Control Center Entry Page
 * Refactored to use unified SettingsLayout system (v10.1)
 */
import React, { useState } from "react";
import {
    Shield,
    LayoutDashboard,
    Table,
    FileCode,
    Lock,
    Activity,
    Terminal,
    Info,
    ShieldAlert,
} from "lucide-react";

import SettingsLayout from "@/components/settings/SettingsLayout";
import SecurityErrorBoundary from "../SecurityErrorBoundary";

// Tabs
import OverviewTab from "../tabs/OverviewTab";
import PermissionsMatrixTab from "../tabs/PermissionsMatrixTab";
import PolicyEngineTab from "../tabs/PolicyEngineTab";
import FieldAccessTab from "../tabs/FieldAccessTab";
import AccessLogsTab from "../tabs/AccessLogsTab";
import DebugConsoleTab from "../tabs/DebugConsoleTab";
import SecurityAlertsTab from "../tabs/SecurityAlertsTab";

const TABS = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "alerts", label: "Alerts", icon: ShieldAlert },
    { id: "matrix", label: "Permissions Matrix", icon: Table },
    { id: "policy", label: "Policy Engine", icon: FileCode },
    { id: "field", label: "Field Access", icon: Lock },
    { id: "logs", label: "Access Logs", icon: Activity },
    { id: "debug", label: "Debug Console", icon: Terminal },
];

export default function SecurityPage() {
    const [activeTab, setActiveTab] = useState("overview");

    return (
        <SettingsLayout
            title="Security Control Center"
            description="Policy & RBAC Management — Global security governance for your organization."
            breadcrumb="Security"
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
        >
            <div className="flex-1 overflow-auto bg-white rounded-2xl border border-gray-100 shadow-sm min-h-[600px]">
                <SecurityErrorBoundary>
                    <div className="p-8">
                        {activeTab === "overview" && <OverviewTab />}
                        {activeTab === "alerts" && <SecurityAlertsTab />}
                        {activeTab === "matrix" && <PermissionsMatrixTab />}
                        {activeTab === "policy" && <PolicyEngineTab />}
                        {activeTab === "field" && <FieldAccessTab />}
                        {activeTab === "logs" && <AccessLogsTab />}
                        {activeTab === "debug" && <DebugConsoleTab />}
                    </div>
                </SecurityErrorBoundary>
            </div>

            {/* Simple Footer inside layout */}
            <div className="mt-8 flex items-center justify-between px-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                <div className="flex items-center gap-2">
                    <Info size={12} className="text-emerald-500" />
                    <span>System Status: <span className="text-emerald-600">All Security Policies Active</span></span>
                </div>
                <div>PBAC Engine v2.0</div>
            </div>
        </SettingsLayout>
    );
}
