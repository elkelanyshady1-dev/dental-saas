import React from "react";

/**
 * SettingsTabs.jsx — Reusable tab navigation for complex settings pages (e.g. Security).
 * 
 * Props:
 *   - tabs (Array): Objects with { id, label, icon }.
 *   - activeTab (string): ID of the currently selected tab.
 *   - onTabChange (Function): Callback for tab transitions.
 * 
 * Rules:
 *   - Highlight active tab with a bottom border and primary color text.
 *   - Use flex gap-6 for consistent spacing.
 */
export default function SettingsTabs({ tabs, activeTab, onTabChange }) {
    if (!tabs || tabs.length === 0) return null;

    return (
        <div className="flex items-center gap-6 border-b border-gray-200 mt-6 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide overflow-x-auto whitespace-nowrap">
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;

                return (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange && onTabChange(tab.id)}
                        className={`group relative flex items-center gap-2 pb-3.5 px-1 text-sm font-semibold transition-all duration-200 ${
                            isActive 
                                ? "text-blue-600 border-b-2 border-blue-600 shadow-[0_1px_0_0_rgba(37,99,235,1)]" 
                                : "text-gray-500 border-b-2 border-transparent hover:text-gray-800 hover:border-gray-300"
                        }`}
                    >
                        {Icon && (
                            <Icon 
                                className={`w-4 h-4 transition-colors ${
                                    isActive ? "text-blue-600" : "text-gray-400 group-hover:text-gray-600"
                                }`} 
                            />
                        )}
                        <span>{tab.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
