/**
 * UpgradePlanBanner.jsx — Plan Upgrade Prompt
 *
 * Displayed when a user navigates to a feature that's not included
 * in their organization's current subscription plan.
 *
 * PLANE: Org only.
 */

import { ArrowUpCircleIcon, SparklesIcon } from "@heroicons/react/24/outline";

const FEATURE_LABELS = {
    orthodontics: "Orthodontics",
    finance: "Finance & Billing",
    analytics: "Analytics & Intelligence",
    clinical: "Clinical Operations",
    inventory: "Inventory Management",
    booking: "Online Booking",
    labs: "Lab Management",
};

/**
 * @param {Object} props
 * @param {string} [props.feature] — Feature key for contextual messaging
 */
export default function UpgradePlanBanner({ feature }) {
    const label = FEATURE_LABELS[feature] || feature || "This feature";

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
            <div className="relative mb-8">
                <div className="absolute -inset-4 bg-gradient-to-r from-violet-500/20 to-blue-500/20 rounded-full blur-2xl" />
                <div className="relative bg-gradient-to-br from-violet-50 to-blue-50 p-6 rounded-2xl border border-violet-100">
                    <SparklesIcon className="w-16 h-16 text-violet-500" />
                </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
                {label} is Not Available
            </h2>

            <p className="text-gray-500 text-center max-w-md mb-8 leading-relaxed">
                The <strong>{label}</strong> module is not included in your current plan.
                Contact your administrator to upgrade and unlock this feature.
            </p>

            <div className="flex items-center gap-3 bg-gradient-to-r from-violet-500 to-blue-500 text-white px-6 py-3 rounded-xl shadow-lg shadow-violet-500/25 cursor-default">
                <ArrowUpCircleIcon className="w-5 h-5" />
                <span className="font-medium">Upgrade Plan</span>
            </div>

            <p className="text-xs text-gray-400 mt-4">
                Contact your organization administrator for plan changes.
            </p>
        </div>
    );
}
