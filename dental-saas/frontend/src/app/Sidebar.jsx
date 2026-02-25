import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Sidebar() {
    const { hasPermission } = useAuth();

    const links = [
        { to: "/calendar", label: "Calendar", icon: "📅", perm: "calendar.read" },
        { to: "/patients", label: "Patients", icon: "👥", perm: "patients.read" },
    ];

    return (
        <aside className="w-60 bg-slate-900 border-r border-slate-700/50 flex flex-col min-h-screen">
            {/* Logo */}
            <div className="p-5 border-b border-slate-700/50">
                <h1 className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                    DentalSaaS
                </h1>
            </div>

            {/* Nav */}
            <nav className="flex-1 p-3 space-y-1">
                {links
                    .filter((l) => hasPermission(l.perm))
                    .map((l) => (
                        <NavLink
                            key={l.to}
                            to={l.to}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${isActive
                                    ? "bg-blue-600/20 text-blue-400 shadow-sm"
                                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                                }`
                            }
                        >
                            <span className="text-base">{l.icon}</span>
                            {l.label}
                        </NavLink>
                    ))}
            </nav>
        </aside>
    );
}
