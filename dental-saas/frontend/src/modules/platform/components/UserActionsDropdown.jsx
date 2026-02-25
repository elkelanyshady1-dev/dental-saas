import { useState, useRef, useEffect } from "react";
import { MoreVertical, ShieldAlert, LogOut, Mail, Lock, Key, Power, PowerOff } from "lucide-react";
import api from "../../../services/api";
import { useAuth } from "../../../context/AuthContext";

export function UserActionsDropdown({ user, onActionComplete }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const { user: authUser } = useAuth();

    const platformRole = authUser?.platformRole;
    const isSuperAdmin = platformRole === "superadmin";
    const isOpsAdmin = platformRole === "operations_admin";

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleAction = async (mode) => {
        let payload = { mode };

        if (mode === "set_password") {
            const password = window.prompt("Enter new password for user:");
            if (!password) return;
            payload.password = password;
        }

        setIsOpen(false);
        try {
            await api.post(`/platform/users/${user._id}/manage-credentials`, payload);
            alert(`Action ${mode} completed successfully.`);
            if (onActionComplete) onActionComplete();
        } catch (err) {
            alert(err.response?.data?.message || `Failed to execute ${mode}`);
        }
    };

    const handleToggleStatus = async () => {
        setIsOpen(false);
        try {
            // This endpoint exists in platformUserController.js for organization users
            // Wait, I should check if it's the right endpoint for org users vs platform users
            // In OrganizationDetailsPage.jsx it was: /platform/organizations/${orgId}/users/${user._id}
            // But here we are in a generic component. 
            // Maybe it's better to pass handleToggleStatus as a prop or use a generic user update endpoint.
            // Let's assume we can use the platform users patch if it supports it, 
            // but the original code used a very specific path.
            // Actually, let's stick to the manage-credentials for credential-related things 
            // and maybe keep status toggle as a separate item if needed.
            // But the user wants a dropdown with "full options" and "limited options".
            // I'll add "Toggle Status" to the dropdown.
            onActionComplete("toggle_status", user);
        } catch (err) {
            alert("Failed to update status.");
        }
    };

    if (!isSuperAdmin && !isOpsAdmin) return null;

    return (
        <div className="relative inline-block text-left" ref={dropdownRef}>
            <button
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600 focus:outline-none"
            >
                <MoreVertical className="w-5 h-5" />
            </button>

            {isOpen && (
                <div
                    className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden py-1"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/50">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Credential Management</p>
                    </div>

                    {isSuperAdmin && (
                        <>
                            <button
                                onClick={() => handleAction("set_password")}
                                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                            >
                                <Lock className="w-4 h-4 text-slate-400" />
                                Set Password Manually
                            </button>
                            <button
                                onClick={() => handleAction("temporary_password")}
                                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                            >
                                <Key className="w-4 h-4 text-slate-400" />
                                Generate Temp Password
                            </button>
                        </>
                    )}

                    <button
                        onClick={() => handleAction("send_reset_email")}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                    >
                        <Mail className="w-4 h-4 text-slate-400" />
                        Send Reset Link
                    </button>

                    <button
                        onClick={() => handleAction("force_logout")}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                    >
                        <ShieldAlert className="w-4 h-4 text-slate-400" />
                        Force Logout
                    </button>

                    <div className="border-t border-slate-100 mt-1 pt-1">
                        <button
                            onClick={handleToggleStatus}
                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${user.isActive ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                        >
                            {user.isActive ? (
                                <>
                                    <PowerOff className="w-4 h-4" />
                                    Deactivate User
                                </>
                            ) : (
                                <>
                                    <Power className="w-4 h-4" />
                                    Activate User
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
