import { useNavigate } from "react-router-dom";
import { MagnifyingGlassIcon, PhoneIcon, PlusIcon, Bars3Icon } from "@heroicons/react/24/outline";

/**
 * Topbar (Design System v2.0)
 * Premium glass topbar with search, call, and add patient actions.
 */
export default function Topbar({ onMenuClick }) {
    const navigate = useNavigate();

    return (
        <header className="flex items-center justify-between px-8 py-4 border-b border-gray-100/80 bg-white/50 backdrop-blur-sm flex-shrink-0">
            {/* Search */}
            <div className="flex-1 flex items-center gap-4 max-w-xl">
                {/* Mobile menu toggle */}
                <button
                    onClick={onMenuClick}
                    className="lg:hidden p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
                >
                    <Bars3Icon className="w-5 h-5" />
                </button>

                <div className="relative flex-1 group">
                    <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Command + K to Search"
                        className="w-full pl-11 pr-5 py-2.5 rounded-full bg-gray-50 border border-gray-200 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all shadow-sm"
                    />
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 ml-6">
                {/* Call Button - Blue circular */}
                <button className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-colors">
                    <PhoneIcon className="w-4 h-4 text-white" />
                </button>

                {/* Add Patient Button - Emerald rounded-full */}
                <button
                    onClick={() => navigate("/org/patients/new")}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-sm transition-all shadow-lg shadow-emerald-500/30 whitespace-nowrap"
                >
                    <PlusIcon className="w-4 h-4" />
                    <span>Add Patient</span>
                </button>
            </div>
        </header>
    );
}
