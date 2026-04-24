/**
 * ComingSoon — Lightweight placeholder for stub routes.
 *
 * Used where a route is wired into the navigation tree but the page itself
 * hasn't been built yet (e.g. /org/doctors). Keeps users from hitting a
 * 404 while the team works on the real implementation.
 */

export default function ComingSoon({
    title = "Coming Soon",
    description = "This page is on the roadmap. Check back soon.",
}) {
    return (
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-[#eef1ff] flex items-center justify-center mb-6">
                <span
                    className="material-symbols-outlined text-[#004ac6]"
                    style={{ fontSize: "32px" }}
                    aria-hidden="true"
                >
                    construction
                </span>
            </div>
            <h2 className="text-xl font-semibold text-[#0f172a] mb-2">{title}</h2>
            <p className="text-sm text-[#434655] max-w-sm">{description}</p>
        </div>
    );
}
