import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { User, Settings, LogOut } from "lucide-react";
import { useAuth } from "../../../../context/AuthContext";

export function AdminDropdown({ user }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const navigate = useNavigate();
    const { logout } = useAuth();

    const handleLogout = () => {
        logout();
        navigate("/platform/login");
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const initial = user?.name?.charAt(0)?.toUpperCase() || "A";

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 focus:outline-none group"
            >
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 border border-slate-200 group-hover:bg-slate-200 group-hover:text-slate-900 transition-colors">
                    {initial}
                </div>
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-3 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                        <p className="text-sm font-semibold text-slate-900 truncate">{user?.name || "Admin User"}</p>
                        <p className="text-xs font-medium text-slate-500 truncate">{user?.email || "admin@example.com"}</p>
                        <span className="inline-block mt-1.5 px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider rounded-md border border-blue-100">
                            {user?.role || "Admin"}
                        </span>
                    </div>

                    <div className="p-1">
                        <Link
                            to="/platform/profile"
                            onClick={() => setIsOpen(false)}
                            className="w-full text-left px-3 py-2 text-sm text-slate-600 font-medium hover:bg-slate-50 hover:text-slate-900 rounded-lg flex items-center gap-2 transition-colors"
                        >
                            <User className="w-4 h-4 text-slate-400" />
                            Profile
                        </Link>
                        <Link
                            to="/platform/settings"
                            onClick={() => setIsOpen(false)}
                            className="w-full text-left px-3 py-2 text-sm text-slate-600 font-medium hover:bg-slate-50 hover:text-slate-900 rounded-lg flex items-center gap-2 transition-colors"
                        >
                            <Settings className="w-4 h-4 text-slate-400" />
                            Settings
                        </Link>
                    </div>

                    <div className="p-1 border-t border-slate-100">
                        <button
                            onClick={handleLogout}
                            className="w-full text-left px-3 py-2 text-sm text-red-600 font-medium hover:bg-red-50 hover:text-red-700 rounded-lg flex items-center gap-2 transition-colors"
                        >
                            <LogOut className="w-4 h-4 text-red-400" />
                            Sign out
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
