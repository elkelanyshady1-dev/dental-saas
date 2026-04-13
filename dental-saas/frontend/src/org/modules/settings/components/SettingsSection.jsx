import React from "react";

/**
 * SettingsSection.jsx — Groups settings cards into defined domains.
 */
export default function SettingsSection({ title, description, children }) {
    return (
        <section className="space-y-4">
            <header className="px-1">
                <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                {description && (
                    <p className="text-sm text-gray-500 mt-1">{description}</p>
                )}
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {children}
            </div>
        </section>
    );
}
