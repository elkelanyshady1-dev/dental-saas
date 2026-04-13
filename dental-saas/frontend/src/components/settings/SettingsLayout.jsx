import React from "react";
import SettingsBreadcrumb from "./SettingsBreadcrumb";
import SettingsHeader from "./SettingsHeader";
import SettingsTabs from "./SettingsTabs";

/**
 * SettingsLayout.jsx — Unified UX system for all Organization Settings pages.
 * 
 * Props:
 *   - title (string): Page title.
 *   - description (string): Optional page sub-text.
 *   - breadcrumb (string): Optional breadcrumb current name (defaults to title).
 *   - actions (ReactNode): Optional action buttons top-right.
 *   - tabs (Array): Optional tab objects { id, label, icon }.
 *   - activeTab (string): ID of active tab.
 *   - onTabChange (Function): Tab transition handler.
 *   - children (ReactNode): Page content.
 * 
 * Rules (Rule Engine v10.0):
 *   - max-w-5xl mx-auto px-6 py-6.
 *   - Consistent vertical spacing (mb-4 for header, mt-6 for content).
 *   - Layout: Breadcrumb -> Header (Title/Actions) -> Tabs (Optional) -> Content.
 */
export default function SettingsLayout({ 
    title, 
    description, 
    breadcrumb, 
    actions, 
    tabs, 
    activeTab, 
    onTabChange, 
    children 
}) {
    return (
        <div className="min-h-screen bg-transparent">
            <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 md:py-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
                
                {/* 1. Breadcrumb (Top Nav) */}
                <SettingsBreadcrumb current={breadcrumb || title} />

                {/* 2. Header Section (Title/Description/Actions) */}
                <SettingsHeader 
                    title={title} 
                    description={description} 
                    actions={actions} 
                />

                {/* 3. Tabs (Optional) */}
                {tabs && tabs.length > 0 && (
                    <SettingsTabs 
                        tabs={tabs} 
                        activeTab={activeTab} 
                        onTabChange={onTabChange} 
                    />
                )}

                {/* 4. Content Container */}
                <div className="mt-8">
                    {children}
                </div>

            </div>
        </div>
    );
}
