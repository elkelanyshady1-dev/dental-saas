/**
 * EmptyState — Recall-specific empty messages.
 *
 * Three distinct variants per the audit feedback (no recalls / no matches /
 * all caught up). Each carries an optional CTA.
 */

export default function EmptyState({ variant = "none", onCreate }) {
    const config = {
        none: {
            icon: "event_available",
            title: "No recalls yet",
            description: "Recalls keep patients coming back. Create one when a treatment plan calls for follow-up.",
            cta: onCreate ? { label: "+ New Recall", action: onCreate } : null,
        },
        filtered: {
            icon: "filter_alt_off",
            title: "No recalls match these filters",
            description: "Try widening the date range or clearing the status filter.",
            cta: null,
        },
        caughtUp: {
            icon: "task_alt",
            title: "All caught up!",
            description: "No pending recalls in this view. Great work.",
            cta: null,
        },
    }[variant] || { icon: "info", title: "Nothing to show", description: "", cta: null };

    return (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-full bg-[#eef1ff] flex items-center justify-center mb-5">
                <span
                    className="material-symbols-outlined text-[#004ac6]"
                    style={{ fontSize: "28px" }}
                    aria-hidden="true"
                >
                    {config.icon}
                </span>
            </div>
            <h3 className="text-base font-semibold text-[#0f172a] mb-1">{config.title}</h3>
            <p className="text-sm text-[#737686] max-w-sm">{config.description}</p>
            {config.cta && (
                <button
                    type="button"
                    onClick={config.cta.action}
                    className="mt-5 text-sm font-medium px-4 py-2 rounded-lg bg-[#004ac6] text-white hover:bg-[#003ba0] transition-colors"
                >
                    {config.cta.label}
                </button>
            )}
        </div>
    );
}
