import React from "react";

/**
 * SettingsHeader.jsx — Uniform page header for all settings sub-pages.
 * 
 * Props:
 *   - title (string): Page title.
 *   - description (string): Page description (sub-text).
 *   - actions (ReactNode): Optional action buttons top-right.
 * 
 * Rules:
 *   - Use text-2xl font-semibold for titles.
 *   - Actions must be in a dedicated flex container on the right.
 */
export default function SettingsHeader({ title, description, actions }) {
    return (
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
            <div className="flex-1">
                <h1 className="text-2xl font-semibold text-gray-900 tracking-tight leading-tight">
                    {title}
                </h1>
                {description && (
                    <p className="text-sm text-gray-500 mt-1 max-w-2xl leading-relaxed">
                        {description}
                    </p>
                )}
            </div>
            {actions && (
                <div className="flex items-center gap-3 shrink-0 self-start md:self-auto">
                    {actions}
                </div>
            )}
        </div>
    );
}
