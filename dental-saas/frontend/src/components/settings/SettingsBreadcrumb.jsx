import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRightIcon } from "@heroicons/react/20/solid";

/**
 * SettingsBreadcrumb.jsx — Unified top navigation for Settings sub-pages.
 * 
 * Rules:
 *   - "Settings" -> clickable -> /org/settings
 *   - Current Page -> text only
 *   - Style: Minimalist SaaS (Stripe/Linear)
 */
export default function SettingsBreadcrumb({ current }) {
    const navigate = useNavigate();

    return (
        <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-6 transition-opacity duration-300">
            <button
                onClick={() => navigate("/org/settings")}
                className="hover:text-gray-900 transition-colors font-medium flex items-center"
            >
                Settings
            </button>
            <ChevronRightIcon className="w-4 h-4 text-gray-300" />
            <span className="text-gray-900 font-semibold truncate max-w-[200px]">
                {current}
            </span>
        </nav>
    );
}
