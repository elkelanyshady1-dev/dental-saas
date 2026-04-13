/**
 * StatCard (Design System v2.0)
 * Two visual variants: white (default) and gradient (colored).
 * 
 * @param {string} label        - Stat label (e.g. "Patients")
 * @param {string} value        - Big bold number/value
 * @param {node}   icon         - Heroicon component
 * @param {boolean} gradient    - Enable gradient variant
 * @param {string} gradientFrom - Tailwind from-color (e.g. "from-cyan-400")
 * @param {string} gradientTo   - Tailwind to-color (e.g. "to-purple-500")
 */
export default function StatCard({
    label,
    value,
    icon: Icon,
    gradient = false,
    gradientFrom = "from-cyan-400",
    gradientTo = "to-purple-500",
    className = "",
}) {
    const base = "rounded-2xl p-6 shadow-sm flex flex-col justify-between gap-4 min-h-[130px]";

    if (gradient) {
        return (
            <div className={`${base} bg-gradient-to-br ${gradientFrom} ${gradientTo} text-white ${className}`}>
                <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold opacity-90">{label}</span>
                    {Icon && (
                        <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                            <Icon className="w-4 h-4 text-white" />
                        </div>
                    )}
                </div>
                <span className="text-3xl font-black tracking-tight">{value}</span>
            </div>
        );
    }

    return (
        <div className={`${base} bg-white border border-gray-100 ${className}`}>
            <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-500">{label}</span>
                {Icon && (
                    <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-gray-400" />
                    </div>
                )}
            </div>
            <span className="text-3xl font-black text-gray-900 tracking-tight">{value}</span>
        </div>
    );
}
