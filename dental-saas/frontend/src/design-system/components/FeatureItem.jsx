/**
 * FeatureItem.jsx — Design System Feature Item
 * Replaces legacy components/ui/FeatureItem.jsx
 */
import React from "react";

export function FeatureItem({ icon, title, description }) {
    return (
        <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                {icon}
            </div>
            <div>
                <span className="text-slate-800 font-semibold text-lg">{title}</span>
                {description && (
                    <p className="text-slate-500 text-sm mt-0.5">{description}</p>
                )}
            </div>
        </div>
    );
}

export default FeatureItem;
