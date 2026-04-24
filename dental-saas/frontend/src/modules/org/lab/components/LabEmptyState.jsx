/**
 * LabEmptyState — lab-themed empty state with optional call-to-action.
 *
 * Matches the clinical design system (teal accent, Inter/Plus Jakarta).
 */

import { Link } from "react-router-dom";
import { BeakerIcon } from "@heroicons/react/24/outline";

export default function LabEmptyState({
    icon: Icon = BeakerIcon,
    title,
    description,
    actionLabel,
    actionTo,
    actionOnClick,
    children,
}) {
    return (
        <div className="flex flex-col items-center justify-center text-center py-14 px-6">
            <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-clinical-lt text-brand-clinical mb-4">
                <Icon className="w-6 h-6" />
            </span>
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
            {description && (
                <p className="text-xs text-text-muted mt-1 max-w-sm">{description}</p>
            )}
            {actionLabel && (actionTo || actionOnClick) && (
                <div className="mt-4">
                    {actionTo ? (
                        <Link
                            to={actionTo}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-clinical rounded-btn hover:bg-brand-clinical-hover transition-colors"
                        >
                            {actionLabel}
                        </Link>
                    ) : (
                        <button
                            type="button"
                            onClick={actionOnClick}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-clinical rounded-btn hover:bg-brand-clinical-hover transition-colors"
                        >
                            {actionLabel}
                        </button>
                    )}
                </div>
            )}
            {children}
        </div>
    );
}
